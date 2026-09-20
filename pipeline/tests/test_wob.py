from __future__ import annotations

import datetime as dt

import pytest

from pipeline.sources import wob
from pipeline.tests.conftest import write_price_workbook, write_rate_workbook


def test_weekly_prices_reads_date_countries_and_aggregates(tmp_path, week):
    path = write_price_workbook(
        tmp_path / "p.xlsx", week, {"Germany": [2357.0, 2426.0, 1683.0, None, None, 1086.5]}
    )
    parsed = wob.load_weekly_prices(path)

    assert parsed.date == week
    assert len(parsed.by_country) == 27
    assert parsed.by_country["DE"]["euro95"] == 2357.0
    assert parsed.by_country["DE"]["lpg"] == 1086.5
    assert "fuel_oil_ls" not in parsed.by_country["DE"]  # blank cells are dropped
    assert parsed.aggregates["EU27"]["euro95"] == 2000.0
    assert parsed.aggregates["EA20"]["euro95"] == 2050.0


def test_missing_country_is_fatal(tmp_path, week):
    """A layout change must fail the build, not silently drop a country."""
    import openpyxl

    path = write_price_workbook(tmp_path / "p.xlsx", week, {})
    wb = openpyxl.load_workbook(path)
    wb.active.delete_rows(13)  # Germany
    wb.save(path)

    with pytest.raises(wob.ParseError, match="DE"):
        wob.load_weekly_prices(path)


def test_rate_history_carries_the_merged_country_code_forward(tmp_path):
    """Only the first row of a country's block repeats its code."""
    path = write_rate_workbook(
        tmp_path / "d.xlsx",
        {
            "VAT": [
                ("PL", dt.date(2026, 8, 17), 23.0, 23.0),
                (None, dt.date(2026, 3, 1), 8.0, 8.0),
                (None, dt.date(2011, 1, 1), 23.0, 23.0),
                ("DE", dt.date(2021, 1, 1), 19.0, 19.0),
            ],
            "Excise duties": [("PL", dt.date(2026, 6, 16), 1819.29, 1693.52)],
            "Other Indirect Taxes": [("PL", dt.date(2024, 1, 1), 0.0, 0.0)],
        },
    )
    wb = __import__("openpyxl").load_workbook(path, read_only=True, data_only=True)
    rates = wob._read_rate_sheet(wb["VAT"], history=True)
    wb.close()

    assert sorted(rates) == ["DE", "PL"]
    assert len(rates["PL"]) == 3
    assert [entry.since for entry in rates["PL"]] == sorted(entry.since for entry in rates["PL"])


def test_rates_at_picks_the_rate_in_force_and_merges_products():
    entries = [
        wob.RateSet(dt.date(2011, 1, 1), {"euro95": 23.0, "diesel": 23.0, "lpg": 23.0}),
        wob.RateSet(dt.date(2026, 3, 1), {"euro95": 8.0, "diesel": 8.0}),
        wob.RateSet(dt.date(2026, 8, 17), {"euro95": 23.0, "diesel": 23.0}),
    ]

    assert wob.rates_at(entries, dt.date(2026, 5, 1))["euro95"] == 8.0
    assert wob.rates_at(entries, dt.date(2026, 9, 14))["euro95"] == 23.0
    # lpg was never restated, so it keeps the 2011 rate throughout
    assert wob.rates_at(entries, dt.date(2026, 9, 14))["lpg"] == 23.0
    assert wob.rates_at(entries, dt.date(2010, 1, 1)) == {}


def test_excel_serial_dates_and_datetimes_both_parse():
    assert wob.as_date(46279) == dt.date(2026, 9, 14)
    assert wob.as_date(dt.datetime(2026, 9, 14, 12)) == dt.date(2026, 9, 14)
    assert wob.as_date("not a date") is None
