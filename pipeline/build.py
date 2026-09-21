"""Build the static data artefacts the website loads.

    uv run python -m pipeline.build            # download + build everything
    uv run python -m pipeline.build --cached   # reuse .cache, no network
    uv run python -m pipeline.build --check    # build, print the report, write nothing
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import logging
import sys
from pathlib import Path

from pipeline import mapping
from pipeline.model import MissingData, build_breakdown, build_from_duty
from pipeline.sources import ecb, eurostat, uk, wob

log = logging.getLogger("build")

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / ".cache"
OUT = ROOT / "web" / "public" / "data"

#: A bulletin older than this means the pipeline is publishing stale numbers.
MAX_AGE_DAYS = 10

SOURCES = [
    {
        "id": "wob",
        "de": "Europäische Kommission, GD Energie — Weekly Oil Bulletin",
        "en": "European Commission, DG Energy — Weekly Oil Bulletin",
        "url": "https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en",
        "licence": {
            "de": "© Europäische Union, Weiterverwendung nach Beschluss 2011/833/EU",
            "en": "© European Union, reuse under Decision 2011/833/EU",
        },
    },
    {
        "id": "desnz",
        "de": "DESNZ — Weekly road fuel prices (Vereinigtes Königreich)",
        "en": "DESNZ — Weekly road fuel prices (United Kingdom)",
        "url": "https://www.gov.uk/government/statistics/weekly-road-fuel-prices",
        "licence": {
            "de": (
                "Enthält Informationen des öffentlichen Sektors, lizenziert unter der "
                "Open Government Licence v3.0 "
                "(https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/)"
            ),
            "en": (
                "Contains public sector information licensed under the "
                "Open Government Licence v3.0 "
                "(https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/)"
            ),
        },
    },
    {
        "id": "ecb",
        "de": "EZB — Euro-Referenzkurse",
        "en": "ECB — euro foreign exchange reference rates",
        "url": "https://www.ecb.europa.eu/stats/eurofxref/",
        "licence": {
            "de": "© Europäische Zentralbank, Wiedergabe mit Quellenangabe gestattet",
            "en": "© European Central Bank, reproduction permitted with attribution",
        },
    },
    {
        "id": "eurostat",
        "de": "Eurostat — Medianeinkommen (EU-SILC, ilc_di03)",
        "en": "Eurostat — median equivalised income (EU-SILC, ilc_di03)",
        "url": "https://ec.europa.eu/eurostat/databrowser/view/ilc_di03",
        "licence": {
            "de": "© Europäische Union, Weiterverwendung nach Beschluss 2011/833/EU",
            "en": "© European Union, reuse under Decision 2011/833/EU",
        },
    },
    {
        "id": "gisco",
        "de": "Eurostat GISCO — Ländergrenzen",
        "en": "Eurostat GISCO — country boundaries",
        "url": "https://ec.europa.eu/eurostat/web/gisco",
        # The dataset's metadata asks in so many words for both EuroGeographics
        # AND UN-FAO to be acknowledged, alongside non-commercial use and a scale
        # of 1:1 million or smaller (we use 1:20 million).
        "licence": {
            "de": (
                "© EuroGeographics und UN-FAO für die Verwaltungsgrenzen — "
                "Nutzung nur zu nicht-kommerziellen Zwecken"
            ),
            "en": (
                "© EuroGeographics and UN-FAO for the administrative boundaries — "
                "non-commercial use only"
            ),
        },
    },
]


def _load(cached: bool) -> tuple[wob.WeeklyPrices, wob.WeeklyPrices, dict, wob.History, dict]:
    paths = {name: wob.download(name, CACHE, force=not cached) for name in wob.FILES}
    with_tax = wob.load_weekly_prices(paths["with_tax"])
    wo_tax = wob.load_weekly_prices(paths["wo_tax"])
    duties = wob.load_duties(paths["duties"])
    history = wob.load_history(paths["history"])
    hashes = {name: wob.sha256(path)[:16] for name, path in paths.items()}

    if with_tax.date != wo_tax.date:
        raise wob.ParseError(
            f"price files disagree on the week: {with_tax.date} vs {wo_tax.date}"
        )
    latest_history = max(history.prices["DE"])
    if latest_history != with_tax.date:
        log.warning(
            "history ends %s but the weekly files are for %s", latest_history, with_tax.date
        )
    return with_tax, wo_tax, duties, history, hashes


def _rates_for(history: wob.History, duties: dict, code: str, date: dt.date) -> dict[str, dict]:
    """Rates in force for one country, history first, weekly file as fallback.

    The history workbook carries every rate change and is the more current of
    the two — in the 2026-09-14 edition it has Poland back at 23 % VAT while the
    weekly file still shows the 8 % emergency rate.
    """
    out = {}
    for kind in ("vat", "excise", "other"):
        values = dict(wob.rates_at(history.rates.get(kind, {}).get(code, []), date))
        fallback = duties[kind].get(code)
        if fallback:
            for product, value in fallback.values.items():
                values.setdefault(product, value)
        out[kind] = values
    return out


def load_uk() -> tuple[dict, list[str], dict]:
    """UK weekly prices as EUR/1000 l breakdowns, keyed by date.

    Pence per litre and pounds are converted with the ECB reference rate of the
    bulletin week, so a UK bar sits on the same euro scale as the rest.
    """
    weeks = uk.load()
    rates = ecb.daily_rates()
    problems: list[str] = []
    out: dict[dt.date, dict[str, object]] = {}
    used_rates: dict[dt.date, float] = {}

    for date, products in weeks.items():
        try:
            gbp_per_eur = ecb.rate_on(rates, "GBP", date)
        except LookupError:
            continue  # no reference rate that week (shouldn't happen post-1999)
        used_rates[date] = gbp_per_eur
        # pence -> pounds -> euro -> per 1000 litres
        to_eur_per_1000 = 10.0 / gbp_per_eur
        entry = {}
        for product, values in products.items():
            entry[product] = build_from_duty(
                country="GB",
                product=product,
                date=date,
                gross=values["gross"] * to_eur_per_1000,
                duty=values["duty"] * to_eur_per_1000,
                vat_rate=values["vat_rate"],
            )
        if entry:
            out[date] = entry
    if not out:
        problems.append("GB: no week could be converted (no ECB rate in range)")
    return out, problems, used_rates


def build_latest(with_tax, wo_tax, duties, history) -> tuple[dict, list[str]]:
    date = with_tax.date
    problems: list[str] = []
    countries: dict[str, dict] = {}

    for code in mapping.EU27:
        rates = _rates_for(history, duties, code, date)
        fx = history.fx.get(code, {}).get(date)
        entry: dict[str, dict] = {}
        for product in mapping.UI_PRODUCTS:
            gross = with_tax.by_country.get(code, {}).get(product)
            net = wo_tax.by_country.get(code, {}).get(product)
            if gross is None or net is None:
                continue
            try:
                breakdown = build_breakdown(
                    country=code,
                    product=product,
                    date=date,
                    gross=gross,
                    net=net,
                    vat_rate=rates["vat"].get(product),
                    excise_national=rates["excise"].get(product),
                    other_national=rates["other"].get(product),
                    fx=fx,
                )
            except MissingData as exc:
                problems.append(str(exc))
                continue
            for note in breakdown.notes:
                problems.append(f"{code}/{product}: {note}")
            entry[product] = breakdown.as_json()
        if entry:
            countries[code] = entry

    uk_weeks, uk_problems, uk_rates = load_uk()
    problems.extend(uk_problems)
    uk_entry = uk_weeks.get(date)
    if uk_entry:
        countries["GB"] = {
            product: breakdown.as_json() for product, breakdown in uk_entry.items()
        }
    elif uk_weeks:
        problems.append(f"GB: no figures for {date} (latest is {max(uk_weeks)})")

    aggregates = {
        key: {
            product: {
                "gross": round(with_tax.aggregates[key][product], 2),
                "net": round(wo_tax.aggregates.get(key, {}).get(product, 0.0), 2),
            }
            for product in mapping.UI_PRODUCTS
            if product in with_tax.aggregates.get(key, {})
        }
        for key in with_tax.aggregates
    }

    # Secondary to the prices: if Eurostat is unreachable the map simply loses
    # the burden metric, which must not take the week's prices down with it.
    income: dict[str, float] = {}
    income_year = ""
    try:
        income, income_year = eurostat.median_income()
    except Exception as exc:  # noqa: BLE001 — any failure here is non-fatal
        problems.append(f"income: {exc}")

    data = {
        "week": date.isoformat(),
        "unit": "EUR/1000l",
        "products": [
            {"key": p.key, "unit": PRODUCT_UNIT[p.unit], "de": p.de, "en": p.en}
            for p in (mapping.PRODUCTS_BY_KEY[k] for k in mapping.UI_PRODUCTS)
        ],
        "countries": countries,
        "aggregates": aggregates,
        "names": {c: mapping.COUNTRY_NAMES[c] for c in countries},
        "income": {
            "year": income_year,
            "unit": "EUR/year",
            "values": {c: income[c] for c in countries if c in income},
        },
    }
    data["exchange_rates"] = _exchange_rates(history, uk_rates, date)
    return data, problems, uk_weeks


PRODUCT_UNIT = {"1000l": "l", "t": "t"}


def _exchange_rates(history: wob.History, uk_rates: dict, date: dt.date) -> dict:
    """What each non-euro country's figures were converted with, and by whom.

    The bulletin countries use the Commission's own weekly rate so the euro
    figures match its published ones exactly; the UK, which the bulletin does
    not cover, uses the ECB reference rate of the same day.
    """
    rates: dict[str, dict] = {}
    for code, currency in mapping.NATIONAL_CURRENCY.items():
        if code == "GB":
            continue
        rate = history.fx.get(code, {}).get(date)
        if not rate:
            continue
        rates[code] = {
            "currency": currency,
            "eur_per_unit": round(rate, 6),
            "units_per_eur": round(1 / rate, 4),
            "source": "wob",
            "date": date.isoformat(),
        }
    gbp = uk_rates.get(date)
    if gbp:
        rates["GB"] = {
            "currency": "GBP",
            "eur_per_unit": round(1 / gbp, 6),
            "units_per_eur": round(gbp, 4),
            "source": "ecb",
            "date": date.isoformat(),
        }
    return rates


def build_uk_history(weeks: dict) -> dict | None:
    """The UK series in the same shape as the bulletin countries."""
    dates = sorted(weeks)
    series = {}
    for product in mapping.UI_PRODUCTS:
        kept, gross, net = [], [], []
        for date in dates:
            breakdown = weeks[date].get(product)
            if breakdown is None:
                continue
            kept.append(date.isoformat())
            gross.append(round(breakdown.gross, 2))
            net.append(round(breakdown.net, 2))
        if kept:
            series[product] = {"dates": kept, "gross": gross, "net": net}
    return {"country": "GB", "series": series} if series else None


def build_history(history: wob.History) -> dict[str, dict]:
    """One compact file per country: parallel arrays, dates shared per product."""
    out = {}
    for code in mapping.EU27:
        weeks = history.prices.get(code)
        if not weeks:
            continue
        dates = sorted(weeks)
        series = {}
        for product in mapping.UI_PRODUCTS:
            gross, net, kept = [], [], []
            for date in dates:
                values = weeks[date].get(product, {})
                if "with_tax" not in values or "wo_tax" not in values:
                    continue
                kept.append(date.isoformat())
                gross.append(round(values["with_tax"], 2))
                net.append(round(values["wo_tax"], 2))
            if kept:
                series[product] = {"dates": kept, "gross": gross, "net": net}
        if series:
            out[code] = {"country": code, "series": series}
    return out


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cached", action="store_true", help="reuse .cache, no network")
    parser.add_argument("--check", action="store_true", help="report only, write nothing")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

    with_tax, wo_tax, duties, history, hashes = _load(cached=args.cached)
    age = (dt.date.today() - with_tax.date).days
    latest, problems, uk_weeks = build_latest(with_tax, wo_tax, duties, history)
    per_country = build_history(history)
    uk_history = build_uk_history(uk_weeks)
    if uk_history:
        per_country["GB"] = uk_history

    print(f"\nbulletin week : {with_tax.date} ({age} days old)")
    print(f"countries     : {len(latest['countries'])}/{len(mapping.COVERED)}")
    print(f"history       : {len(per_country)} countries, "
          f"{sum(len(c['series']['euro95']['dates']) for c in per_country.values() if 'euro95' in c['series'])} country-weeks")
    if problems:
        print(f"notes         : {len(problems)}")
        for problem in problems:
            print(f"  - {problem}")
    else:
        print("notes         : none — every breakdown reconciles exactly")

    if age > MAX_AGE_DAYS:
        log.error("bulletin is %d days old (limit %d) — refusing to publish", age, MAX_AGE_DAYS)
        return 1
    if args.check:
        return 0

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "history").mkdir(exist_ok=True)
    _write(OUT / "latest.json", latest)
    for code, payload in per_country.items():
        _write(OUT / "history" / f"{code}.json", payload)
    _write(
        OUT / "meta.json",
        {
            "generated_at": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
            "week": with_tax.date.isoformat(),
            "sources": SOURCES,
            "source_digests": hashes,
            "notes": problems,
            "exchange_rates": latest["exchange_rates"],
        },
    )
    print(f"\nwrote {OUT}")
    return 0


def _write(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n")


if __name__ == "__main__":
    sys.exit(main())
