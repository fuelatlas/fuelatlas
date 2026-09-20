# fuelatlas

A map of European fuel prices **with taxes and duties stripped out**.

**<https://fuelatlas.github.io/fuelatlas/>**

The price on the pump sign says little about whether a country is expensive —
roughly half of it is the state. This site shows the product price underneath,
and on hover, how the pump price is put together.

Static site, updated automatically every week. No server, no database, no
sign-up. Interface in German and English.

## Quickstart

```bash
uv sync                                # Python dependencies
uv run python -m pipeline.build        # fetch weekly data, write JSON
uv run python -m pipeline.geo          # map geometry (rarely needed)

cd web && npm install && npm run dev   # http://localhost:5173
```

The generated data is committed under `web/public/data/`, so the site runs
without a pipeline run first.

## What the numbers mean

Per country, fuel and week:

```
pump price = product price + excise duty + other levies + VAT
```

**The two official price series are the truth; the tax tables only supply the
split.** That is not caution, it is experience. As of 2026-09-14 the
Commission's excise table still quoted 514.10 EUR/1000 l for Germany — a
temporary cut that had expired on 2026-07-06. The price series shows the step
back up to 654.50 cleanly. Ireland's carbon tax is missing from the same table,
and Cyprus sits on the EU minimum rate. So the pipeline computes:

```
VAT    = pump price × rate / (100 + rate)
excise = pump price − product price − VAT − other levies
```

The breakdown therefore always adds up to the price at the pump. Two
thresholds govern what happens when the table disagrees: above 0.1 cent per
litre its value is carried in the dataset for comparison, and above 1 cent per
litre the table counts as genuinely out of date rather than merely rounded, and
the site says so. Of 98 breakdowns (not every country reports every fuel) 74
currently match the table to within 0.1 cent per litre; 18 carry the
outdated-table note.

The derived figures land on recognisable real-world rates — Germany's actual
energy tax, the EU minimum rates, Ireland's mineral oil tax including carbon
tax — which is the strongest evidence that the direction is right.

## Data sources

| Source | Coverage | Cadence | Licence |
|---|---|---|---|
| [EU Weekly Oil Bulletin](https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en) | EU-27, prices with and without tax, tax rates, history from 2005 | weekly, Thu | Decision 2011/833/EU |
| [DESNZ Weekly road fuel prices](https://www.gov.uk/government/statistics/weekly-road-fuel-prices) | United Kingdom, price + duty rate + VAT | weekly, Thu | Open Government Licence v3.0 |
| [ECB reference rates](https://www.ecb.europa.eu/stats/eurofxref/) | GBP conversion | daily | reproduction with attribution |
| [Eurostat GISCO](https://ec.europa.eu/eurostat/web/gisco) | country boundaries | — | © EuroGeographics and UN-FAO, non-commercial |

Countries outside the euro area are converted with the rate the bulletin ships
itself, so the euro figures match its published ones. The United Kingdom, which
the bulletin does not cover, uses the ECB reference rate of the same day. The
rate used is shown in each country's detail panel.

### Daily prices: a separate tool, not on the site

```bash
./scripts/update-daily.sh     # -> data/daily.json, 3-5 minutes
```

Italy, France and Spain publish every station's price individually
([Osservaprezzi](https://www.mimit.gov.it/), [prix-carburants](https://www.prix-carburants.gouv.fr/),
[Geoportal de Gasolineras](https://geoportalgasolineras.es/)). The script
fetches them, takes a 5 % trimmed mean per country and fuel, and applies the
tax split of the most recent bulletin week.

These numbers deliberately stay off the site. The bulletin collects
consumption-weighted national averages comparable across all 28 countries;
beside them would stand ungrouped station prices from three, inviting exactly
the comparison that does not hold. The output lands in `data/daily.json`,
outside the published directory.

### Deliberately not included

- **Norway** — monthly prices only, around two months behind, and its rates
  changed three times in 2026 (road tax to zero on 1 April, diesel back to 2.28
  NOK/l on 1 September). A hard-coded rate table would be exactly the mistake
  this pipeline corrects elsewhere.
- **Switzerland** — no reusable source. Avenergy publishes daily prices under
  "all rights reserved"; the federal portals do not answer automated requests.
- **Austria in the daily layer** — the E-Control API returns the five cheapest
  stations per query. That is a ranking, not a sample.
- **Germany in the daily layer** — the MTS-K terms forbid passing the datasets
  on, and the Tankerkönig API only does radius searches up to 25 km. An
  unbiased national average would need a grid covering the whole country;
  before that, a word with Tankerkönig would be in order.

## Layout

```
pipeline/            Python 3.11+, only requests + openpyxl
  sources/           wob.py (Oil Bulletin), uk.py (DESNZ), ecb.py (rates)
  daily/             one adapter per country with an open station feed
  model.py           price breakdown and reconciliation
  mapping.py         country, product and currency tables
  build.py           weekly data -> web/public/data/
  build_daily.py     daily prices -> data/daily.json (not on the site)
  geo.py             GISCO geometry -> europe.geo.json
web/                 Vite + TypeScript, no framework
  src/map.ts         choropleth in ETRS89-LAEA (EPSG:3035), label placement
  src/label-anchor.ts anchor via the point furthest from any border
  src/chart.ts       time series with a crosshair
```

## Labelling the map

Every country carries its price on the map itself. Two things make that less
trivial than it sounds:

**Where in the country?** The area-weighted centroid falls in the Tyrrhenian
Sea for Italy and inside Bosnia for Croatia. What is used instead is the point
furthest from any border — always inside the country, and with the most room
around it.

**When there is no room.** Luxembourg is smaller than its own price tag. The
map therefore keeps an occupancy raster: for every cell it knows which country
covers it. A label searches rings of growing radius for the cheapest free spot,
where its own territory costs nothing, open space little and a neighbour's
territory a lot — so a displaced label lands on water rather than on the
neighbour. Anything that had to move gets a line drawn back to its country.

On a phone the map is about 350 px wide. There the labels are set much larger
and shorter (no currency symbol, two decimals) and nothing moves: leader lines
criss-crossing a phone screen are worse than no label. What does not fit on its
own country is in the table, which opens by default at that width and reduces
to country, net price, pump price and tax share — the full breakdown is one tap
away.

## Automation

| Workflow | Trigger | Does |
|---|---|---|
| `update-weekly.yml` | Thu 13:00 UTC | tests, build data, commit if changed, then deploy |
| `deploy.yml` | push to `main`, or called by the weekly run | build to GitHub Pages |

None of this needs hand-holding: the weekly run fetches the data, commits it
and publishes the site. Two traps are handled:

- **A push from a workflow does not trigger further workflows.** That is
  GitHub's protection against loops and applies to the default `GITHUB_TOKEN`.
  The deploy is therefore not reached through its push trigger but called by the
  weekly run as a `workflow_call`.
- **Scheduled workflows fall asleep.** In public repositories GitHub disables
  cron workflows after 60 days without activity, announced by email. One click
  on "Enable workflow" is enough.

The weekly run fails hard if a worksheet no longer looks the way it should, or
if the bulletin is more than ten days old — the last committed data then stays
online instead of wrong numbers going live.

### One-time setup

1. Create the repository on GitHub and push.
2. *Settings → Pages → Source:* **GitHub Actions**.
3. *Settings → Actions → General → Workflow permissions:* **Read and write**,
   so the weekly run may commit the data.

After that it runs by itself. Cost: Actions minutes are unlimited and free for
public repositories; private ones get 2,000 minutes a month on the free plan,
of which this workflow uses about two.

## Verifying

```bash
uv run pytest                              # parsers, breakdown, aggregation
uv run python -m pipeline.build --check    # builds and reports, writes nothing
cd web && npm run build                    # type check and bundle
```

A sample to check by hand (Germany, petrol, 2026-09-14): pump price
2357 EUR/1000 l, VAT 2357 × 19/119 = 376.3, less 654.5 energy tax, less 148.2
carbon price, giving a product price of 1178.0 — exactly the value in the
official "without taxes" series.

## Legal

The code carries no licence.

The data comes from public bodies and brings its own conditions. They are named
in the site footer and in `meta.json`, and continue to apply unchanged:

| Source | Condition |
|---|---|
| European Commission, Weekly Oil Bulletin | reuse under Decision 2011/833/EU, attribution |
| DESNZ, Weekly road fuel prices | Open Government Licence v3.0, attribution with link |
| European Central Bank, reference rates | reproduction with attribution |
| Eurostat GISCO, country boundaries | acknowledge EuroGeographics **and UN-FAO**, **non-commercial use only**, scale of 1:1 million or smaller |

The last row is the only real restriction: **this site may not be run
commercially** — no advertising, no paywall. As long as it stays freely
accessible, the condition is met. The 1:20 million scale in use is well inside
the limit.

To be rid of the restriction, swap the geometry for
[Natural Earth](https://www.naturalearthdata.com/) — public domain, commercial
use allowed, no attribution required. Only `pipeline/geo.py` would change.
