#!/usr/bin/env python3
"""Refresh official endpoints without changing the curated mathematical crosswalk.

Initialize the review baseline once with --initialize-reviewed. Later runs compare
new upstream records to that baseline; they never infer mathematical improvements
or silently bless a changed proof. Only the standard library is required.
"""
from __future__ import annotations

import argparse
import datetime as dt
import fcntl
from fractions import Fraction
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile
import time
from typing import Callable
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

SOURCE_BASE = 'https://gtimg.github.io/QuasiRiemannTracker/'
MAX_BYTES = 8 * 1024 * 1024
FINGERPRINT_FIELDS = (
    'id', 'theta', 'source_commit', 'method', 'builds_on', 'exact_bound',
    'bound_interval', 'repository', 'entrypoint', 'status',
)


class SyncError(ValueError):
    """Invalid upstream data or an invalid local review baseline."""


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def json_bytes(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode('utf-8')


def digest(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def decode_json(raw: bytes, name: str) -> dict:
    try:
        def unique_keys(pairs):
            out = {}
            for key, value in pairs:
                if key in out:
                    raise SyncError(f'{name}: duplicate JSON key {key!r}')
                out[key] = value
            return out
        def reject_constant(constant):
            raise SyncError(f'{name}: non-JSON numeric constant {constant}')
        value = json.loads(raw.decode('utf-8'), object_pairs_hook=unique_keys,
                           parse_constant=reject_constant)
    except (UnicodeError, json.JSONDecodeError) as exc:
        raise SyncError(f'{name}: invalid UTF-8 JSON') from exc
    if not isinstance(value, dict):
        raise SyncError(f'{name}: expected a JSON object')
    return value


def rational(value: object, label: str) -> Fraction:
    if not isinstance(value, dict):
        raise SyncError(f'{label}: expected numerator and denominator')
    integers = []
    for key in ('numerator', 'denominator'):
        part = value.get(key)
        if isinstance(part, bool) or not isinstance(part, (str, int)):
            raise SyncError(f'{label}.{key}: an exact integer is required')
        if not re.fullmatch(r'[0-9]+', str(part)):
            raise SyncError(f'{label}.{key}: a nonnegative decimal integer is required')
        try:
            integers.append(int(part))
        except ValueError as exc:
            raise SyncError(f'{label}.{key}: invalid integer') from exc
    if integers[1] == 0:
        raise SyncError(f'{label}: zero denominator')
    result = Fraction(*integers)
    if not 0 < result <= 1:
        raise SyncError(f'{label}: boundary must satisfy 0 < theta <= 1')
    return result


def validate_catalogue(value: dict) -> dict[str, dict]:
    if type(value.get('schema_version')) is not int or value['schema_version'] != 1:
        raise SyncError('catalogue.json: unsupported schema_version')
    date = value.get('as_of')
    try:
        if not isinstance(date, str) or len(date) != 10:
            raise ValueError('expected YYYY-MM-DD')
        dt.date.fromisoformat(date)
    except ValueError as exc:
        raise SyncError('catalogue.json: invalid as_of date') from exc
    rows = value.get('records')
    if not isinstance(rows, list) or not rows:
        raise SyncError('catalogue.json: records must be a nonempty list')
    indexed = {}
    for row in rows:
        if not isinstance(row, dict):
            raise SyncError('catalogue.json: each record must be an object')
        id = row.get('id')
        if not isinstance(id, str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]*', id):
            raise SyncError('catalogue.json: invalid record id')
        if id in indexed:
            raise SyncError(f'catalogue.json: duplicate id {id!r}')
        rational(row.get('theta'), id + '.theta')
        if not isinstance(row.get('title'), str) or not row['title'].strip():
            raise SyncError(f'{id}: a nonempty title is required')
        if not isinstance(row.get('status'), str) or not row['status'].strip():
            raise SyncError(f'{id}: a status is required')
        for field in ('method', 'source_commit', 'repository'):
            if field in row and not isinstance(row[field], str):
                raise SyncError(f'{id}.{field}: expected text')
        parents = row.get('builds_on', [])
        if not isinstance(parents, list) or any(not isinstance(p, str) for p in parents):
            raise SyncError(f'{id}.builds_on: expected a list of ids')
        if 'exact_bound' in row and not isinstance(row['exact_bound'], str):
            raise SyncError(f'{id}.exact_bound: expected an exact expression as text')
        if 'bound_interval' in row:
            interval = row['bound_interval']
            if not isinstance(interval, dict):
                raise SyncError(f'{id}.bound_interval: expected an object')
            lower = rational(interval.get('lower'), id + '.bound_interval.lower')
            upper = rational(interval.get('upper'), id + '.bound_interval.upper')
            if lower > upper:
                raise SyncError(f'{id}.bound_interval: lower exceeds upper')
        indexed[id] = row
    return indexed


def validate_site(value: dict) -> None:
    if not isinstance(value.get('repository'), str) or not re.fullmatch(
        r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', value['repository']
    ):
        raise SyncError('site.json: expected an owner/repository name')
    if not isinstance(value.get('title'), str) or not value['title'].strip():
        raise SyncError('site.json: a nonempty title is required')


def review_fields(row: dict) -> dict:
    """A stable, documented subset; missing optional fields are explicit nulls."""
    return {field: row.get(field) for field in FINGERPRINT_FIELDS}


def fingerprint(fields: dict) -> str:
    canonical = json.dumps(fields, sort_keys=True, ensure_ascii=False, separators=(',', ':'))
    return digest(canonical.encode('utf-8'))


def initialize_review(data_dir: Path, previous: dict[str, dict], raw: bytes) -> dict:
    evidence = decode_json((data_dir / 'method-evidence.json').read_bytes(), 'method-evidence.json')
    methods = evidence.get('methods')
    if not isinstance(methods, dict) or not methods:
        raise SyncError('method-evidence.json: methods must be a nonempty object')
    missing = set(methods) - set(previous)
    if missing:
        raise SyncError('Cannot initialize reviews for absent snapshot ids: ' + ', '.join(sorted(missing)))
    reviewed = {}
    for id in sorted(methods):
        fields = review_fields(previous[id])
        reviewed[id] = {
            'reviewed_source_commit': previous[id].get('source_commit'),
            'reviewed_fingerprint': fingerprint(fields),
            'reviewed_fields': fields,
        }
    return {
        'schema_version': 1, 'initialized_at': utc_now(),
        'fingerprint_fields': list(FINGERPRINT_FIELDS),
        'source_catalogue_sha256': digest(raw), 'reviewed': reviewed,
    }


def validate_review(value: dict) -> None:
    if value.get('schema_version') != 1 or value.get('fingerprint_fields') != list(FINGERPRINT_FIELDS):
        raise SyncError('reviewed-sources.json: incompatible review schema')
    if not isinstance(value.get('reviewed'), dict):
        raise SyncError('reviewed-sources.json: missing reviewed map')
    for id, entry in value['reviewed'].items():
        if not isinstance(entry, dict) or not isinstance(entry.get('reviewed_fields'), dict):
            raise SyncError(f'reviewed-sources.json: invalid entry {id}')
        fields = entry['reviewed_fields']
        if fields.get('id') != id or set(fields) != set(FINGERPRINT_FIELDS):
            raise SyncError(f'reviewed-sources.json: invalid field set for {id}')
        if entry.get('reviewed_source_commit') != fields.get('source_commit'):
            raise SyncError(f'reviewed-sources.json: inconsistent commit for {id}')
        if entry.get('reviewed_fingerprint') != fingerprint(fields):
            raise SyncError(f'reviewed-sources.json: fingerprint mismatch for {id}')


def fetch_bytes(url: str, timeout: float = 25, attempts: int = 3) -> bytes:
    if attempts < 1 or timeout <= 0:
        raise SyncError('Fetch attempts and timeout must be positive')
    error = None
    for attempt in range(attempts):
        try:
            request = Request(url, headers={'User-Agent': 'QRH-Method-Atlas/1', 'Accept': 'application/json'})
            with urlopen(request, timeout=timeout) as response:
                raw = response.read(MAX_BYTES + 1)
            if len(raw) > MAX_BYTES:
                raise SyncError(f'Upstream response exceeds {MAX_BYTES} bytes: {url}')
            return raw
        except (OSError, URLError, HTTPError, TimeoutError) as exc:
            error = exc
            if attempt + 1 < attempts:
                time.sleep(min(0.5 * 2**attempt, 2))
    raise SyncError(f'Could not fetch {url} after {attempts} attempts: {error}') from error


def atomic_replace(data_dir: Path, payloads: dict[str, bytes]) -> None:
    """Stage every file before replacement; restore prior bytes if a replace fails."""
    staged = {}
    previous = {name: (data_dir / name).read_bytes() if (data_dir / name).exists() else None for name in payloads}
    replaced = []
    try:
        for name, raw in payloads.items():
            fd, temporary = tempfile.mkstemp(prefix='.' + name + '.', suffix='.tmp', dir=data_dir)
            staged[name] = Path(temporary)
            with os.fdopen(fd, 'wb') as stream:
                stream.write(raw)
                stream.flush()
                os.fsync(stream.fileno())
        for name, temporary in staged.items():
            os.replace(temporary, data_dir / name)
            replaced.append(name)
    except OSError:
        for name in reversed(replaced):
            original = previous[name]
            if original is None:
                (data_dir / name).unlink(missing_ok=True)
            else:
                fd, rollback = tempfile.mkstemp(prefix='.rollback.', dir=data_dir)
                with os.fdopen(fd, 'wb') as stream:
                    stream.write(original)
                os.replace(rollback, data_dir / name)
        raise
    finally:
        for temporary in staged.values():
            temporary.unlink(missing_ok=True)


def sync_catalogue(
    data_dir: Path, *, initialize_reviewed: bool = False,
    fetcher: Callable[[str], bytes] | None = None,
    source_base: str = SOURCE_BASE,
) -> dict:
    data_dir = Path(data_dir)
    data_dir.mkdir(parents=True, exist_ok=True)
    source_base = source_base.rstrip('/') + '/'
    fetcher = fetcher or fetch_bytes
    with (data_dir / '.sync.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        previous_raw = (data_dir / 'catalogue.json').read_bytes()
        previous = validate_catalogue(decode_json(previous_raw, 'previous catalogue.json'))
        review_path = data_dir / 'reviewed-sources.json'
        if review_path.exists():
            if initialize_reviewed:
                raise SyncError('Review manifest already exists; refusing to restamp curated records')
            review = decode_json(review_path.read_bytes(), review_path.name)
        elif initialize_reviewed:
            review = initialize_review(data_dir, previous, previous_raw)
        else:
            raise SyncError('Missing reviewed-sources.json; initialize the reviewed baseline explicitly once')
        validate_review(review)

        # Neither upstream file nor the status receipt changes if either fetch or
        # either schema validation fails. Curated evidence is never rewritten.
        catalogue_raw = fetcher(source_base + 'catalogue.json')
        site_raw = fetcher(source_base + 'site.json')
        catalogue = decode_json(catalogue_raw, 'catalogue.json')
        current = validate_catalogue(catalogue)
        validate_site(decode_json(site_raw, 'site.json'))
        reviewed = review['reviewed']
        changed = sorted(id for id in current.keys() & reviewed.keys()
                         if fingerprint(review_fields(current[id])) != reviewed[id]['reviewed_fingerprint'])
        status = {
            'schema_version': 1, 'fetched_at': utc_now(), 'source_as_of': catalogue['as_of'],
            'sources': {'catalogue_url': source_base + 'catalogue.json', 'site_url': source_base + 'site.json'},
            'digests': {'catalogue_sha256': digest(catalogue_raw), 'site_sha256': digest(site_raw)},
            'record_count': len(current), 'new_ids': sorted(current.keys() - previous.keys()),
            'unreviewed_ids': sorted(current.keys() - reviewed.keys()),
            'changed_source_ids': changed, 'removed_ids': sorted(previous.keys() - current.keys()),
            'reviewed_ids': sorted((current.keys() & reviewed.keys()) - set(changed)),
            'review_manifest_initialized_at': review['initialized_at'],
            'scope': 'Automatic endpoint/status sync only. New or changed sources require manual mathematical extraction; no analytic improvements are inferred.',
        }
        payloads = {'catalogue.json': catalogue_raw, 'site.json': site_raw, 'sync-status.json': json_bytes(status)}
        if not review_path.exists():
            payloads['reviewed-sources.json'] = json_bytes(review)
        atomic_replace(data_dir, payloads)
        return status


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-dir', type=Path, default=Path(__file__).resolve().parents[1] / 'dist' / 'data')
    parser.add_argument('--initialize-reviewed', action='store_true')
    parser.add_argument('--timeout', type=float, default=25)
    parser.add_argument('--attempts', type=int, default=3)
    args = parser.parse_args()
    try:
        status = sync_catalogue(args.data_dir, initialize_reviewed=args.initialize_reviewed,
                                fetcher=lambda url: fetch_bytes(url, args.timeout, args.attempts))
    except (SyncError, OSError) as exc:
        parser.exit(1, f'Sync failed; previous snapshot retained: {exc}\n')
    print(json.dumps(status, ensure_ascii=False, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
