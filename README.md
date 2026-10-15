# QRH Method Atlas

An interactive companion to the [QRH leaderboard](https://gtimg.github.io/QuasiRiemannTracker/), showing which moment estimates, LOW/HIGH bounds, detector counts, geometry, and recovery conditions feed each endpoint.

Website: **https://gaozhongpai.github.io/qrh-method-atlas/**

## Views

- Compare two methods in a dimension matrix, with exact rational endpoints and source links.
- Read the [dimension guide](https://gaozhongpai.github.io/qrh-method-atlas/#dimensions), with plain-language definitions, examples, and an explanation of how LOW and HIGH fit together.
- Inspect declared proof dependencies and nine required proof gates.
- Use a categorical radar footprint. Its area is **not** a mathematical strength score; verification is separate.
- Explore the standard and local affine capacity planes, including intercepts, length windows, and the standard theorem's zero-bound premise.
- Keep proposed endpoints separate from the verified catalogue.
- Download the comparison as CSV or all source evidence as JSON.

## Automatic synchronization

`.github/workflows/pages.yml` fetches the official `catalogue.json` and `site.json`, validates them, and deploys the static website:

- Every hour at minute 17 UTC, subject to GitHub scheduling delays.
- On each push to `main`.
- On **Actions → Sync leaderboard and publish Pages → Run workflow**.
- Optionally through a `repository_dispatch` event named `upstream-catalogue-updated` if the upstream maintainer later adds that integration.

The browser also checks the official catalogue on opening the page and every five minutes while the tab is visible. A failed live request leaves the included snapshot available. An invalid or unreachable upstream source fails the scheduled build, preserving the last deployed website.

No GitHub token is exposed to the browser. Scheduled deployment uses the repository's built-in Actions permissions. It does not make automatic source commits.

**What updates automatically:** endpoints, authors, catalogue verification status, declared dependencies, source links, and newly admitted methods.

**What needs source review:** attributing a new mathematical improvement to a specific proof dimension. New or changed proof sources appear as **not extracted** rather than receiving guessed scores or inherited claims. Curated files are `dist/data/method-evidence.json` and `dist/data/proof-dimensions.json`; `reviewed-sources.json` binds annotations to reviewed catalogue fields. Its reviewed entries must be updated deliberately after source review; hourly sync never approves new annotations.

The source-reported catalogue date is displayed verbatim. Refresh times and the review snapshot date are separate.

## Local development

No build or package installation is needed. Serve `dist` over HTTP:

```sh
python3 -m http.server 8000 --directory dist
```

Refresh data and check the sync behavior:

```sh
python3 scripts/sync_catalogue.py
python3 -m unittest discover -s scripts -p 'test_*.py'
node --check dist/app.js
```

For a fresh checkout that has never established its initial reviewed snapshot:

```sh
python3 scripts/sync_catalogue.py --initialize-reviewed
```

The initializer intentionally refuses to overwrite an existing review manifest.

## Evidence and credit

The official tracker and linked proof authors supply the mathematical records. Component annotations are an editorial crosswalk, not independent mathematical certification. Every formula includes its domain and source; every verification receipt controls its own target scope. A source saving, a capacity improvement, and a final endpoint gain are different quantities.

Code is MIT licensed. Upstream catalogue content, proof text, and linked verification artifacts retain their original attribution and licenses. Proof sources are linked rather than bundled.
