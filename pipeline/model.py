"""Turns Oil Bulletin numbers into the price breakdown the site displays.

Why this is not a straight subtraction
--------------------------------------
The Commission publishes two authoritative price series — with and without
taxes — and, separately, tables of VAT rates, excise duties and other indirect
levies. The tables lag reality: on 2026-07-06 the German price series shows the
specific duty going back up from 662.3 to 802.7 EUR/1000 l as a temporary duty
cut expired, while the excise table still reported the reduced 514.1. Ireland's
carbon tax is likewise missing from its excise figure.

So the two price series are treated as the truth and the tables only *split*
the tax wedge into its parts:

    tax_total       = gross - net                     (both authoritative)
    vat             = gross * rate / (100 + rate)     (VAT rates are reliable)
    specific_total  = tax_total - vat                 (what the state levies per litre)
    other_levies    = from the table (small, stable: CO2 price, stockholding fees)
    excise          = specific_total - other_levies   (the remainder)

The stack therefore always adds up to the price at the pump — a tooltip that
does not add up is worse than no tooltip. Where the table disagrees with the
derived excise, the difference is reported in ``notes`` rather than hidden.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field

from pipeline.mapping import NATIONAL_CURRENCY, PRODUCTS_BY_KEY

#: Tolerance for "the numbers agree", in EUR per 1000 l — 0.1 cent per litre.
TOLERANCE = 1.0

#: Above this the excise table is genuinely out of date rather than just rounded
#: (exchange-rate rounding moves a converted duty by a few tenths of a cent).
#: In EUR per 1000 l = 1 cent per litre.
REPORT_THRESHOLD = 10.0


@dataclass
class Breakdown:
    """One country, one product, one date — in EUR per 1000 l (or per tonne)."""

    country: str
    product: str
    date: dt.date
    gross: float
    net: float
    vat: float
    excise: float
    other: float
    vat_rate: float
    #: Excise as printed in the Commission's table, before reconciliation.
    excise_table: float | None = None
    notes: list[str] = field(default_factory=list)

    @property
    def tax_total(self) -> float:
        return self.vat + self.excise + self.other

    @property
    def tax_share(self) -> float:
        return self.tax_total / self.gross if self.gross else 0.0

    def as_json(self) -> dict:
        """Rounded to 0.01 EUR/1000 l = 0.001 ct/l; plenty for display."""
        out = {
            "gross": round(self.gross, 2),
            "net": round(self.net, 2),
            "vat": round(self.vat, 2),
            "excise": round(self.excise, 2),
            "other": round(self.other, 2),
            "vat_rate": round(self.vat_rate, 2),
            "tax_share": round(self.tax_share, 4),
        }
        if self.notes:
            out["notes"] = self.notes
        if self.excise_table is not None and abs(self.excise_table - self.excise) > TOLERANCE:
            out["excise_table"] = round(self.excise_table, 2)
        return out


class MissingData(Exception):
    """Not enough input to build a breakdown for this country/product/week."""


def build_breakdown(
    *,
    country: str,
    product: str,
    date: dt.date,
    gross: float,
    net: float,
    vat_rate: float | None,
    excise_national: float | None,
    other_national: float | None,
    fx: float | None,
) -> Breakdown:
    """Reconcile one price pair against the tax tables.

    ``excise_national`` and ``other_national`` are in the country's own currency;
    ``fx`` converts them to EUR (euro per unit of national currency) and is
    required for countries outside the euro area.
    """
    if gross is None or net is None:
        raise MissingData(f"{country}/{product}: no price pair")
    if vat_rate is None:
        raise MissingData(f"{country}/{product}: no VAT rate")

    notes: list[str] = []
    rate = 1.0
    if NATIONAL_CURRENCY.get(country):
        if not fx:
            raise MissingData(f"{country}: no exchange rate for {date}")
        rate = fx

    excise_table = excise_national * rate if excise_national is not None else None
    other = (other_national or 0.0) * rate
    if other_national is None:
        notes.append("other_levies_unknown")

    vat = gross * vat_rate / (100.0 + vat_rate)
    specific = gross - net - vat

    if specific < -TOLERANCE:
        # Only happens if the VAT rate is wrong for this week; fall back to
        # splitting by the table and let the flag surface it.
        notes.append("vat_rate_implausible")
        specific = max(0.0, (excise_table or 0.0) + other)
        vat = max(0.0, gross - net - specific)

    excise = specific - other
    if excise < 0:
        notes.append("levies_exceed_specific_duty")
        excise, other = specific, 0.0

    if excise_table is not None and abs(excise_table - excise) > REPORT_THRESHOLD:
        notes.append("excise_table_outdated")

    return Breakdown(
        country=country,
        product=product,
        date=date,
        gross=gross,
        net=net,
        vat=vat,
        excise=excise,
        other=other,
        vat_rate=vat_rate,
        excise_table=excise_table,
        notes=notes,
    )


def per_litre(value_per_1000: float, product: str) -> float:
    """EUR per 1000 l -> EUR per litre (heavy fuel oil is priced per tonne)."""
    return value_per_1000 / 1000.0 if PRODUCTS_BY_KEY[product].unit == "1000l" else value_per_1000


def build_from_duty(
    *,
    country: str,
    product: str,
    date: dt.date,
    gross: float,
    duty: float,
    vat_rate: float,
    other: float = 0.0,
) -> Breakdown:
    """Breakdown for a source that publishes the statutory duty with the price.

    No reconciliation is needed or possible here: the duty is the rate in force
    that week, published in the same file as the price, so the net price follows
    exactly. Used for the UK, where DESNZ publishes pump price, duty and VAT
    together.
    """
    vat = gross * vat_rate / (100.0 + vat_rate)
    net = gross - vat - duty - other
    return Breakdown(
        country=country,
        product=product,
        date=date,
        gross=gross,
        net=net,
        vat=vat,
        excise=duty,
        other=other,
        vat_rate=vat_rate,
    )
