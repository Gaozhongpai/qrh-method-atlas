# QRH Method Atlas

An interactive companion to the [QRH leaderboard](https://gtimg.github.io/QuasiRiemannTracker/), showing which moment estimates, LOW/HIGH bounds, detector counts, geometry, and recovery conditions feed each endpoint.

Website: **https://gaozhongpai.github.io/qrh-method-atlas/**

## Views

- Compare two methods in a dimension matrix, with exact rational endpoints and source links.
- Open the [dimension guide](https://gaozhongpai.github.io/qrh-method-atlas/#dimensions) when needed. Definitions, examples, and the relationship between LOW and HIGH appear in a side panel, preserving your place in the comparison.
- Inspect declared proof dependencies and nine required proof gates.
- Follow the selected method’s documented improvement route. The dependency map separates the LOW branch, detector-to-HIGH flow, compatibility, recovery, and verification; selecting a gate highlights its inputs and consumers. Method-specific formulas override representative framework examples.
- Open **Bottlenecks** for a reviewed six-dimension constraint ledger, grouped certified reserve bounds, and an explicitly numerical upper-row diagnostic. Global LOW’s endpoint balance, internal source payments, final HIGH row margins, and conditional continuation gaps keep their separate meanings and units. The numerical map is not an endpoint solver or a certificate.
- Use a categorical radar footprint. Its area is **not** a mathematical strength score; verification is separate.
- Explore a worked moment-capacity example: adjust equal plain length m, the conditional standard parameter κ, and a test prime length z with sliders, exact-value fields, or by clicking the plot. The plot distinguishes the affine local window from its inequality and does not represent the complete endpoint requirements.
- Keep proposed endpoints separate from the verified catalogue.
- Download the comparison as CSV or all source evidence as JSON.
- Matrix rows list the two compared methods first, then the rest from strongest endpoint θ to weakest, with reference baselines last. Endpoints use a fixed eight-digit decimal plus the gain over 7/8 in millionths; the exact rational appears on hover and in the detail panel.
- Choose a light or dark theme with the ◐ button (Auto follows the system setting). Phone layouts stack the comparison controls, keep the method column fixed while the matrix scrolls sideways, and let the endpoint chart scroll.

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

`dist/styles.css` is the only hand-edited stylesheet. `dist/theme.css` (WCAG AA contrast repairs and the dark theme) and `dist/theme-map.js` (dark colours for the SVG charts) are generated from it and from the chart colour literals by `scripts/build_dark_theme.py`; CI fails if they are stale.

No build or package installation is needed. Serve `dist` over HTTP:

```sh
python3 -m http.server 8000 --directory dist
```

Refresh data and check the sync behavior:

```sh
python3 scripts/sync_catalogue.py
python3 -m unittest discover -s scripts -p 'test_*.py'
node --check dist/app.js
python3 scripts/build_dark_theme.py   # after editing styles.css or chart colours
node --test scripts/test_capacity.mjs scripts/test_bottleneck.mjs
```

For a fresh checkout that has never established its initial reviewed snapshot:

```sh
python3 scripts/sync_catalogue.py --initialize-reviewed
```

The initializer intentionally refuses to overwrite an existing review manifest.

## Evidence and credit

The official tracker and linked proof authors supply the mathematical records. Component annotations are an editorial crosswalk, not independent mathematical certification. Every formula includes its domain and source; every verification receipt controls its own target scope. A source saving, a capacity improvement, and a final endpoint gain are different quantities.

Code is MIT licensed. Upstream catalogue content, proof text, and linked verification artifacts retain their original attribution and licenses. Proof sources are linked rather than bundled.
