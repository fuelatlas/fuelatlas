"""Daily station prices from the national portals — a standalone tool.

    ./scripts/update-daily.sh          # or: uv run python -m pipeline.build_daily

This does not feed the website. The site runs on the Commission's weekly
figures, which are consumption-weighted national averages collected by each
member state and comparable across all 28 countries. These daily numbers are
ungrouped station prices from three countries that happen to publish them, and
mixing the two would invite exactly the comparison that does not hold.

The output lands in `data/daily.json`, outside the published site, for whoever
wants to look at it. National portals publish only the pump price, so the split
into product price and taxes is carried over from the most recent weekly
breakdown of the same country and product — including the reconciled excise
duty, which is the whole reason this pipeline does not read the Commission's
rate tables directly.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import logging
import sys
from pathlib import Path

from pipeline.daily import ADAPTERS
from pipeline.daily.base import aggregate

log = logging.getLogger("build_daily")

ROOT = Path(__file__).resolve().parent.parent
#: The weekly artefacts the tax split is taken from.
WEEKLY = ROOT / "web" / "public" / "data"
#: Deliberately outside the published site — see the module docstring.
OUT = ROOT / "data"


def build(latest: dict) -> tuple[dict, list[str]]:
    countries: dict[str, dict] = {}
    problems: list[str] = []

    for adapter in ADAPTERS:
        try:
            fetched = adapter.fetch()
        except Exception as error:  # one portal being down must not fail the rest
            problems.append(f"{adapter.country}: {type(error).__name__}: {error}")
            log.warning("%s failed: %s", adapter.country, error)
            continue

        weekly = latest["countries"].get(adapter.country, {})
        products: dict[str, dict] = {}
        for product, prices in fetched.by_product.items():
            summary = aggregate(prices)
            if summary is None:
                continue
            reference = weekly.get(product)
            entry: dict[str, object] = {
                "gross": round(summary.mean, 2),
                "median": round(summary.median, 2),
                "stations": summary.stations,
            }
            if reference:
                # Same duty and VAT as the weekly breakdown, applied to today's price.
                vat_rate = reference["vat_rate"]
                specific = reference["excise"] + reference["other"]
                vat = summary.mean * vat_rate / (100.0 + vat_rate)
                entry.update(
                    {
                        "net": round(summary.mean - vat - specific, 2),
                        "vat": round(vat, 2),
                        "excise": round(reference["excise"], 2),
                        "other": round(reference["other"], 2),
                        "vat_rate": vat_rate,
                    }
                )
            products[product] = entry

        if summary_is_thin(fetched.by_product, adapter.minimum_stations):
            problems.append(
                f"{adapter.country}: only {max((len(v) for v in fetched.by_product.values()), default=0)}"
                f" stations, expected at least {adapter.minimum_stations}"
            )

        countries[adapter.country] = {
            "date": fetched.date.isoformat(),
            "source": adapter.name,
            "products": products,
        }

    return (
        {
            "generated_at": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
            "countries": countries,
            "basis": "station prices, 5 % trimmed mean",
        },
        problems,
    )


def summary_is_thin(by_product: dict[str, list[float]], minimum: int) -> bool:
    return max((len(prices) for prices in by_product.values()), default=0) < minimum


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="report only, write nothing")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

    latest_path = WEEKLY / "latest.json"
    if not latest_path.exists():
        log.error("%s missing — run pipeline.build first", latest_path)
        return 1
    latest = json.loads(latest_path.read_text())

    data, problems = build(latest)
    print(f"\ncountries : {len(data['countries'])}/{len(ADAPTERS)}")
    for code, entry in sorted(data["countries"].items()):
        products = ", ".join(
            f"{product} {values['gross'] / 1000:.3f} EUR/l (n={values['stations']})"
            for product, values in sorted(entry["products"].items())
        )
        print(f"  {code} {entry['date']}  {products}")
    if problems:
        print(f"problems  : {len(problems)}")
        for problem in problems:
            print(f"  - {problem}")

    if not data["countries"]:
        log.error("no country could be fetched")
        return 1
    if args.check:
        return 0

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "daily.json").write_text(
        json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n"
    )
    print(f"\nwrote {OUT / 'daily.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
