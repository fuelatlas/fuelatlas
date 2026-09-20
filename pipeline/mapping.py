"""Canonical countries, products and units shared by every stage of the pipeline.

The Weekly Oil Bulletin identifies countries by English name in the price files
and by an ``XX_`` code in the tax files; everything downstream uses ISO 3166-1
alpha-2 instead.
"""

from __future__ import annotations

from dataclasses import dataclass

# --- products -----------------------------------------------------------------
# Column order is identical in every Oil Bulletin sheet, so products are keyed by
# their position rather than by their (multilingual, whitespace-ridden) header.


@dataclass(frozen=True)
class Product:
    key: str
    column: int  # 0-based offset among the value columns
    unit: str  # "1000l" or "t"
    de: str
    en: str


PRODUCTS: tuple[Product, ...] = (
    Product("euro95", 0, "1000l", "Benzin (Super 95)", "Petrol (Euro-super 95)"),
    Product("diesel", 1, "1000l", "Diesel", "Diesel"),
    Product("heating_oil", 2, "1000l", "Heizöl", "Heating gas oil"),
    Product("fuel_oil_ls", 3, "t", "Schweröl (schwefelarm)", "Fuel oil (low sulphur)"),
    Product("fuel_oil_hs", 4, "t", "Schweröl (schwefelreich)", "Fuel oil (high sulphur)"),
    Product("lpg", 5, "1000l", "Autogas (LPG)", "LPG motor fuel"),
)

PRODUCTS_BY_KEY = {p.key: p for p in PRODUCTS}

#: Products shown in the UI. The two heavy fuel oils are priced per tonne and are
#: not road fuels, so they stay out of the map.
UI_PRODUCTS = ("euro95", "diesel", "heating_oil", "lpg")

# --- countries ----------------------------------------------------------------

COUNTRY_BY_NAME: dict[str, str] = {
    "Austria": "AT",
    "Belgium": "BE",
    "Bulgaria": "BG",
    "Croatia": "HR",
    "Cyprus": "CY",
    "Czechia": "CZ",
    "Czech Republic": "CZ",
    "Denmark": "DK",
    "Estonia": "EE",
    "Finland": "FI",
    "France": "FR",
    "Germany": "DE",
    "Greece": "GR",
    "Hungary": "HU",
    "Ireland": "IE",
    "Italy": "IT",
    "Latvia": "LV",
    "Lithuania": "LT",
    "Luxembourg": "LU",
    "Malta": "MT",
    "Netherlands": "NL",
    "Poland": "PL",
    "Portugal": "PT",
    "Romania": "RO",
    "Slovakia": "SK",
    "Slovenia": "SI",
    "Spain": "ES",
    "Sweden": "SE",
}

EU27: tuple[str, ...] = tuple(sorted(set(COUNTRY_BY_NAME.values())))

#: Countries covered from national sources instead of the Oil Bulletin. The UK's
#: bulletin series stops at Brexit (2020-12-21); DESNZ publishes the equivalent
#: weekly figures with the statutory duty and VAT rate, so the breakdown there is
#: exact rather than reconciled.
NON_EU: tuple[str, ...] = ("GB",)

#: Everything the map colours.
COVERED: tuple[str, ...] = tuple(sorted(EU27 + NON_EU))

COUNTRY_NAMES: dict[str, dict[str, str]] = {
    "AT": {"de": "Österreich", "en": "Austria"},
    "BE": {"de": "Belgien", "en": "Belgium"},
    "BG": {"de": "Bulgarien", "en": "Bulgaria"},
    "CY": {"de": "Zypern", "en": "Cyprus"},
    "CZ": {"de": "Tschechien", "en": "Czechia"},
    "DE": {"de": "Deutschland", "en": "Germany"},
    "DK": {"de": "Dänemark", "en": "Denmark"},
    "EE": {"de": "Estland", "en": "Estonia"},
    "ES": {"de": "Spanien", "en": "Spain"},
    "FI": {"de": "Finnland", "en": "Finland"},
    "FR": {"de": "Frankreich", "en": "France"},
    "GR": {"de": "Griechenland", "en": "Greece"},
    "HR": {"de": "Kroatien", "en": "Croatia"},
    "HU": {"de": "Ungarn", "en": "Hungary"},
    "IE": {"de": "Irland", "en": "Ireland"},
    "IT": {"de": "Italien", "en": "Italy"},
    "LT": {"de": "Litauen", "en": "Lithuania"},
    "LU": {"de": "Luxemburg", "en": "Luxembourg"},
    "LV": {"de": "Lettland", "en": "Latvia"},
    "MT": {"de": "Malta", "en": "Malta"},
    "NL": {"de": "Niederlande", "en": "Netherlands"},
    "PL": {"de": "Polen", "en": "Poland"},
    "PT": {"de": "Portugal", "en": "Portugal"},
    "RO": {"de": "Rumänien", "en": "Romania"},
    "SE": {"de": "Schweden", "en": "Sweden"},
    "SI": {"de": "Slowenien", "en": "Slovenia"},
    "SK": {"de": "Slowakei", "en": "Slovakia"},
    "GB": {"de": "Vereinigtes Königreich", "en": "United Kingdom"},
}

#: Excise duties and other levies are quoted in national currency. Everything not
#: listed here uses the euro (Bulgaria joined the euro area on 2026-01-01, and
#: its 2026 bulletins quote excise in EUR).
NATIONAL_CURRENCY: dict[str, str] = {
    "CZ": "CZK",
    "GB": "GBP",
    "DK": "DKK",
    "HU": "HUF",
    "PL": "PLN",
    "RO": "RON",
    "SE": "SEK",
}


def currency_of(iso2: str) -> str:
    return NATIONAL_CURRENCY.get(iso2, "EUR")


#: Aggregate rows at the bottom of each price sheet, copied through rather than
#: recomputed (the Commission weights them by consumption).
AGGREGATE_ROWS: dict[str, str] = {
    "EUR27_2020": "EU27",
    "Euro Area 20": "EA20",
}
