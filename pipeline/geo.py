"""Build the map geometry from Eurostat GISCO country polygons.

    uv run python -m pipeline.geo

GISCO ships the whole world; the site needs Europe. Filtering to the countries
we draw and rounding coordinates to ~10 m turns a 1.9 MB download into a file
small enough to inline-load with the page. The 1:20 M dataset is already
generalised, so no further line simplification is needed at this scale.
"""

from __future__ import annotations

import json
import logging
import sys
from pathlib import Path

import requests

from pipeline.mapping import COVERED

log = logging.getLogger("geo")

SOURCE = (
    "https://gisco-services.ec.europa.eu/distribution/v2/countries/geojson/"
    "CNTR_RG_20M_2024_4326.geojson"
)

#: Drawn in grey behind the data: context, not coverage.
NEIGHBOURS = (
    "CH", "NO", "IS", "AL", "BA", "ME", "MK", "RS", "XK", "MD", "UA",
    "BY", "LI", "AD", "MC", "SM", "TR", "RU", "GE", "AM", "AZ", "DZ", "TN",
    "MA", "LY", "SY", "IQ", "IR", "KZ", "EG", "PS", "IL", "LB", "JO",
)

#: GISCO uses the EU's own two-letter codes; ISO differs for Greece and the UK.
GISCO_TO_ISO = {"EL": "GR", "UK": "GB"}

#: Everything outside this window is cropped away (lon/lat degrees). The Azores,
#: Madeira, the Canaries and the overseas départements are all outside it: left
#: in, they stretch the map's extent across the Atlantic and shrink the part
#: anyone came to look at. Cyprus (34.6°E) is the eastern anchor.
BBOX = (-11.0, 34.0, 36.0, 71.5)

PRECISION = 4  # ~11 m at the equator


def _round(coords):
    if isinstance(coords[0], (int, float)):
        return [round(coords[0], PRECISION), round(coords[1], PRECISION)]
    return [_round(part) for part in coords]


def _ring_in_bbox(ring) -> bool:
    min_lon, min_lat, max_lon, max_lat = BBOX
    for lon, lat in ring:
        if min_lon <= lon <= max_lon and min_lat <= lat <= max_lat:
            return True
    return False


def _clip(geometry: dict) -> dict | None:
    """Drop polygons that lie entirely outside the European window."""
    if geometry["type"] == "Polygon":
        polygons = [geometry["coordinates"]]
    elif geometry["type"] == "MultiPolygon":
        polygons = geometry["coordinates"]
    else:
        return None

    kept = [polygon for polygon in polygons if _ring_in_bbox(polygon[0])]
    if not kept:
        return None
    if len(kept) == 1:
        return {"type": "Polygon", "coordinates": _round(kept[0])}
    return {"type": "MultiPolygon", "coordinates": _round(kept)}


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    out_path = Path(__file__).resolve().parent.parent / "web" / "public" / "data" / "europe.geo.json"

    log.info("downloading %s", SOURCE)
    raw = requests.get(SOURCE, timeout=180).json()

    wanted = set(COVERED) | set(NEIGHBOURS) | {"UK"}
    features = []
    for feature in raw["features"]:
        code = feature["properties"].get("CNTR_ID")
        code = GISCO_TO_ISO.get(code, code)
        if code not in wanted and feature["properties"].get("CNTR_ID") not in wanted:
            continue
        geometry = _clip(feature["geometry"])
        if geometry is None:
            continue
        features.append({
            "type": "Feature",
            "id": code,
            "properties": {"id": code, "covered": code in COVERED},
            "geometry": geometry,
        })

    found = {feature["id"] for feature in features}
    missing = set(COVERED) - found
    if missing:
        raise SystemExit(f"geometry missing for {sorted(missing)}")

    payload = {"type": "FeatureCollection", "features": features}
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, separators=(",", ":")))
    log.info("wrote %s (%d features, %.0f kB)", out_path, len(features), out_path.stat().st_size / 1024)
    return 0


if __name__ == "__main__":
    sys.exit(main())
