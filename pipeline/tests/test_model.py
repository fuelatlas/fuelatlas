"""The reconciliation rules, pinned to real weeks of the bulletin."""

from __future__ import annotations

import datetime as dt

import pytest

from pipeline.model import MissingData, build_breakdown

WEEK = dt.date(2026, 9, 14)


def test_clean_country_reconciles_without_notes():
    """France 2026-09-14: the published tables match the price pair exactly."""
    result = build_breakdown(
        country="FR", product="euro95", date=WEEK,
        gross=2172.33, net=1120.13, vat_rate=20.0,
        excise_national=690.2, other_national=0.0, fx=None,
    )

    assert result.notes == []
    assert result.excise == pytest.approx(690.2, abs=0.5)
    assert result.vat == pytest.approx(2172.33 / 6, abs=0.01)
    assert result.net + result.tax_total == pytest.approx(result.gross, abs=0.01)


def test_outdated_excise_table_is_corrected_from_the_price_pair():
    """Germany's duty cut expired on 2026-07-06; the table still says 514.10.

    The price series knows better, so the breakdown must report the real
    654.50 EUR/1000 l and keep the table value for reference.
    """
    result = build_breakdown(
        country="DE", product="euro95", date=WEEK,
        gross=2357.0, net=1177.972268907563, vat_rate=19.0,
        excise_national=514.1, other_national=148.2, fx=None,
    )

    assert result.excise == pytest.approx(654.5, abs=0.1)
    assert result.other == pytest.approx(148.2, abs=0.01)
    assert "excise_table_outdated" in result.notes
    assert result.as_json()["excise_table"] == 514.1


def test_stack_always_sums_to_the_pump_price():
    """Whatever the tables say, net + VAT + excise + levies must equal gross."""
    for excise, other in [(514.1, 148.2), (0.0, 0.0), (9999.0, 0.0), (None, None)]:
        result = build_breakdown(
            country="DE", product="euro95", date=WEEK,
            gross=2357.0, net=1177.97, vat_rate=19.0,
            excise_national=excise, other_national=other, fx=None,
        )
        assert result.net + result.tax_total == pytest.approx(2357.0, abs=0.01)
        assert result.excise >= 0 and result.other >= 0


def test_national_currency_duties_are_converted():
    """Czechia 2026-09-14: 12840 CZK/1000 l at 0.041163 EUR/CZK."""
    result = build_breakdown(
        country="CZ", product="euro95", date=WEEK,
        gross=1827.7352432699431, net=982.0, vat_rate=21.0,
        excise_national=12840.0, other_national=0.0, fx=0.0411626,
    )

    assert result.excise == pytest.approx(528.5, abs=1.0)
    assert result.notes == []


def test_missing_exchange_rate_is_an_error_not_a_guess():
    with pytest.raises(MissingData, match="exchange rate"):
        build_breakdown(
            country="PL", product="euro95", date=WEEK,
            gross=1821.82, net=1062.1, vat_rate=23.0,
            excise_national=1819.29, other_national=0.0, fx=None,
        )


def test_missing_vat_rate_is_an_error():
    with pytest.raises(MissingData, match="VAT"):
        build_breakdown(
            country="XX", product="euro95", date=WEEK,
            gross=2000.0, net=1000.0, vat_rate=None,
            excise_national=500.0, other_national=0.0, fx=None,
        )


def test_levies_larger_than_the_whole_duty_are_absorbed_and_flagged():
    result = build_breakdown(
        country="BE", product="lpg", date=WEEK,
        gross=870.0, net=719.0, vat_rate=21.0,
        excise_national=0.0, other_national=500.0, fx=None,
    )

    assert "levies_exceed_specific_duty" in result.notes
    assert result.net + result.tax_total == pytest.approx(870.0, abs=0.01)
