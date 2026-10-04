"""Geocoding + routing against free services (Nominatim / OSRM), with graceful fallbacks."""
import math
import re
from functools import lru_cache

import requests

NOMINATIM = "https://nominatim.openstreetmap.org"
OSRM = "https://router.project-osrm.org"
HEADERS = {"User-Agent": "eld-trip-planner/1.0 (assessment project)"}
M_PER_MI = 1609.344
_COORD_RE = re.compile(r"^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$")


class GeoError(Exception):
    pass


def haversine_mi(a, b):
    (lat1, lon1), (lat2, lon2) = a, b
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * 3958.8 * math.asin(math.sqrt(h))


@lru_cache(maxsize=512)
def geocode(query: str):
    """Return (lat, lon, display_name). Accepts 'lat,lon' directly."""
    m = _COORD_RE.match(query)
    if m:
        lat, lon = float(m.group(1)), float(m.group(2))
        return lat, lon, f"{lat:.4f}, {lon:.4f}"
    try:
        r = requests.get(
            f"{NOMINATIM}/search",
            params={"q": query, "format": "jsonv2", "limit": 1, "countrycodes": "us,ca,mx"},
            headers=HEADERS,
            timeout=10,
        )
        r.raise_for_status()
        data = r.json()
    except requests.RequestException as e:
        raise GeoError(f"Geocoding service unavailable: {e}") from e
    if not data:
        raise GeoError(f"Could not find location: '{query}'")
    return float(data[0]["lat"]), float(data[0]["lon"]), data[0]["display_name"]


@lru_cache(maxsize=512)
def reverse_label(lat: float, lon: float):
    """Short 'City, ST' label; returns None on failure (callers fall back)."""
    try:
        r = requests.get(
            f"{NOMINATIM}/reverse",
            params={"lat": lat, "lon": lon, "format": "jsonv2", "zoom": 12, "addressdetails": 1},
            headers=HEADERS,
            timeout=4,
        )
        r.raise_for_status()
        a = r.json().get("address", {})
    except (requests.RequestException, ValueError):
        return None
    # FMCSA 395.8 remarks: city, town or village + State abbreviation; fall back to county if none nearby.
    place = next((a[k] for k in ("city", "town", "village", "hamlet", "municipality", "suburb") if a.get(k)), None)
    if not place and a.get("county"):
        place = a["county"].replace(" County", " Co.")
    state = a.get("ISO3166-2-lvl4", "").split("-")[-1] or a.get("state")
    return f"{place}, {state}" if place and state else (place or state)


def _fallback_route(points):
    """Straight-line route (x1.2 road factor) used only if OSRM is unreachable."""
    coords, legs = [points[0]], []
    for a, b in zip(points, points[1:]):
        legs.append(haversine_mi(a, b) * 1.2)
        steps = 40
        for i in range(1, steps + 1):
            f = i / steps
            coords.append((a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f))
    return {"coords": coords, "legs_mi": legs, "approximate": True}


def route(points):
    """points: [(lat, lon), ...]. Returns {coords:[(lat,lon)], legs_mi:[...], approximate:bool}."""
    path = ";".join(f"{lon},{lat}" for lat, lon in points)
    try:
        r = requests.get(
            f"{OSRM}/route/v1/driving/{path}",
            params={"overview": "full", "geometries": "geojson", "steps": "false"},
            headers=HEADERS,
            timeout=20,
        )
        r.raise_for_status()
        data = r.json()
        if data.get("code") != "Ok":
            raise GeoError(f"No drivable route found between the given locations ({data.get('code')}).")
        rt = data["routes"][0]
        return {
            "coords": [(lat, lon) for lon, lat in rt["geometry"]["coordinates"]],
            "legs_mi": [leg["distance"] / M_PER_MI for leg in rt["legs"]],
            "approximate": False,
        }
    except (requests.RequestException, ValueError, KeyError):
        return _fallback_route(points)
