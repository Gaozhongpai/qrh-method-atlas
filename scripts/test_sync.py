"""Integration tests of snapshot preservation and conservative review detection."""
import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import URLError

import sync_catalogue as sync


def record(id='baseline'):
    return {
        'id': id, 'title': 'Verified method', 'status': 'framework-verified',
        'theta': {'numerator': '7', 'denominator': '8'},
        'source_commit': 'source-one', 'method': 'A manually extracted proof.',
        'builds_on': [], 'repository': 'author/proof',
    }


class SyncTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.data = Path(self.temporary.name)
        self.catalogue = {'schema_version': 1, 'as_of': '2026-10-15', 'records': [record()]}
        self.site = {'repository': 'GTimG/QuasiRiemannTracker', 'title': 'Official tracker'}
        self.curated = b'{"methods":{"baseline":{"manual_note":"Do not rewrite"}}}\n'
        (self.data / 'catalogue.json').write_bytes(sync.json_bytes(self.catalogue))
        (self.data / 'site.json').write_bytes(sync.json_bytes(self.site))
        (self.data / 'method-evidence.json').write_bytes(self.curated)
        (self.data / 'proof-dimensions.json').write_bytes(b'{"manually_reviewed":true}\n')
        self.sync(initialize_reviewed=True)

    def fetcher(self, catalogue=None, site=None):
        responses = {
            'catalogue.json': sync.json_bytes(catalogue if catalogue is not None else self.catalogue),
            'site.json': sync.json_bytes(site if site is not None else self.site),
        }
        return lambda url: responses[url.rsplit('/', 1)[1]]

    def sync(self, catalogue=None, site=None, **kwargs):
        return sync.sync_catalogue(self.data, fetcher=self.fetcher(catalogue, site), **kwargs)

    def snapshot(self):
        return {p.name: p.read_bytes() for p in self.data.glob('*.json')}

    def test_initialization_is_explicit_and_curated_files_never_change(self):
        before = self.snapshot()
        status = self.sync()
        self.assertEqual(status['reviewed_ids'], ['baseline'])
        self.assertEqual(status['unreviewed_ids'], [])
        self.assertEqual(status['source_as_of'], '2026-10-15')
        self.assertEqual((self.data / 'method-evidence.json').read_bytes(), self.curated)
        for name in ('method-evidence.json', 'proof-dimensions.json', 'reviewed-sources.json'):
            self.assertEqual((self.data / name).read_bytes(), before[name])
        review = json.loads(before['reviewed-sources.json'])['reviewed']['baseline']
        self.assertEqual(review['reviewed_source_commit'], 'source-one')
        self.assertEqual(review['reviewed_fields']['theta'], {'numerator': '7', 'denominator': '8'})
        self.assertEqual(review['reviewed_fingerprint'], sync.fingerprint(review['reviewed_fields']))
        with self.assertRaisesRegex(sync.SyncError, 'refusing to restamp'):
            self.sync(initialize_reviewed=True)

    def test_changed_exact_bound_requires_review_even_with_same_source_commit(self):
        newer = copy.deepcopy(self.catalogue)
        # Less than binary float resolution at this scale; exact integers must
        # still trigger review rather than being compared as rounded floats.
        newer['records'][0]['theta'] = {'numerator': '874999999999999999999999999999',
                                         'denominator': '1000000000000000000000000000000'}
        status = self.sync(newer)
        self.assertEqual(status['changed_source_ids'], ['baseline'])
        self.assertEqual(status['reviewed_ids'], [])
        self.assertEqual(status['unreviewed_ids'], [])
        self.assertEqual(json.loads((self.data / 'catalogue.json').read_bytes()), newer)

    def test_new_method_remains_unreviewed_after_repeated_refresh(self):
        newer = copy.deepcopy(self.catalogue)
        new = record('new-method')
        new['method'] = 'Claims dramatic improvements; prose must not create dimension tags.'
        newer['records'].append(new)
        first = self.sync(newer)
        self.assertEqual(first['new_ids'], ['new-method'])
        self.assertEqual(first['unreviewed_ids'], ['new-method'])
        second = self.sync(newer)
        self.assertEqual(second['new_ids'], [])
        self.assertEqual(second['unreviewed_ids'], ['new-method'])
        self.assertEqual((self.data / 'method-evidence.json').read_bytes(), self.curated)

    def test_changed_commit_and_description_are_not_auto_reviewed(self):
        newer = copy.deepcopy(self.catalogue)
        newer['records'][0]['source_commit'] = 'source-two'
        newer['records'][0]['method'] = 'A revised proof.'
        self.assertEqual(self.sync(newer)['changed_source_ids'], ['baseline'])
        self.assertEqual(self.sync(newer)['changed_source_ids'], ['baseline'])

    def test_malformed_and_zero_denominator_preserve_entire_snapshot(self):
        cases = []
        for theta in ({'numerator': '7', 'denominator': '0'},
                      {'numerator': 0.875, 'denominator': '1'},
                      {'numerator': 'not-an-integer', 'denominator': '8'}):
            bad = copy.deepcopy(self.catalogue)
            bad['records'][0]['theta'] = theta
            cases.append(bad)
        bad = copy.deepcopy(self.catalogue)
        bad['records'].append(record())
        cases.append(bad)
        bad = copy.deepcopy(self.catalogue)
        bad['schema_version'] = 2
        cases.append(bad)
        for bad in cases:
            with self.subTest(bad=bad):
                before = self.snapshot()
                with self.assertRaises(sync.SyncError):
                    self.sync(bad)
                self.assertEqual(self.snapshot(), before)

    def test_site_validation_happens_before_any_replacement(self):
        before = self.snapshot()
        newer = copy.deepcopy(self.catalogue)
        newer['as_of'] = '2026-10-16'
        with self.assertRaises(sync.SyncError):
            self.sync(newer, {'repository': 'invalid', 'title': 'Bad response'})
        self.assertEqual(self.snapshot(), before)

    def test_second_failed_fetch_preserves_previous_snapshot(self):
        before = self.snapshot()
        calls = []
        def fetch(url):
            calls.append(url)
            if url.endswith('site.json'):
                raise OSError('Network unavailable')
            return sync.json_bytes({**self.catalogue, 'as_of': '2026-10-16'})
        with self.assertRaisesRegex(OSError, 'Network unavailable'):
            sync.sync_catalogue(self.data, fetcher=fetch)
        self.assertEqual(len(calls), 2)
        self.assertEqual(self.snapshot(), before)

    def test_invalid_json_and_duplicate_json_keys_preserve_previous_snapshot(self):
        before = self.snapshot()
        for raw in (b'{broken', b'{"schema_version":1,"schema_version":2}', b'{"invalid":NaN}'):
            with self.subTest(raw=raw):
                with self.assertRaises(sync.SyncError):
                    sync.sync_catalogue(self.data, fetcher=lambda url: raw)
                self.assertEqual(self.snapshot(), before)

    def test_retries_use_timeout_and_stop_after_budget(self):
        with patch.object(sync, 'urlopen', side_effect=URLError('Temporary failure')) as opened, \
                patch.object(sync.time, 'sleep') as slept:
            with self.assertRaisesRegex(sync.SyncError, 'after 3 attempts'):
                sync.fetch_bytes('https://example.invalid/catalogue.json', timeout=7, attempts=3)
        self.assertEqual(opened.call_count, 3)
        self.assertEqual(slept.call_count, 2)
        self.assertTrue(all(call.kwargs['timeout'] == 7 for call in opened.call_args_list))

    def test_replacement_failure_rolls_back_already_replaced_files(self):
        before = self.snapshot()
        actual_replace = sync.os.replace
        calls = 0
        def fail_second(source, destination):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise OSError('Simulated write failure')
            return actual_replace(source, destination)
        newer = copy.deepcopy(self.catalogue)
        newer['as_of'] = '2026-10-16'
        with patch.object(sync.os, 'replace', side_effect=fail_second):
            with self.assertRaisesRegex(OSError, 'Simulated write failure'):
                self.sync(newer)
        self.assertEqual(self.snapshot(), before)
        self.assertFalse(list(self.data.glob('*.tmp')))


if __name__ == '__main__':
    unittest.main()
