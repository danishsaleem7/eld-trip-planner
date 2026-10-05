from datetime import datetime, timedelta

from rest_framework import serializers
from rest_framework.decorators import api_view
from rest_framework.response import Response

from . import geo, hos

class PointSerializer(serializers.Serializer):
    lat = serializers.FloatField(min_value=-90, max_value=90)
    lon = serializers.FloatField(min_value=-180, max_value=180)


class PlanRequest(serializers.Serializer):
    current_location = serializers.CharField(max_length=200)
    pickup_location = serializers.CharField(max_length=200)
    dropoff_location = serializers.CharField(max_length=200)
    cycle_used_hours = serializers.FloatField(min_value=0, max_value=70)
    # Optional exact coordinates (chosen from the search suggestions); skips geocoding when present.
    current_point = PointSerializer(required=False, allow_null=True)
    pickup_point = PointSerializer(required=False, allow_null=True)
    dropoff_point = PointSerializer(required=False, allow_null=True)
    start_time = serializers.DateTimeField(required=False, input_formats=["iso-8601", "%Y-%m-%dT%H:%M"])


@api_view(["GET"])
def health(_request):
    return Response({"status": "ok"})


def _sample(coords, n=600):
    step = max(1, len(coords) // n)
    out = coords[::step]
    if out[-1] != coords[-1]:
        out.append(coords[-1])
    return [[round(a, 5), round(b, 5)] for a, b in out]


def _nearest_index(points, target):
    return min(range(len(points)), key=lambda i: (points[i][0] - target[0]) ** 2 + (points[i][1] - target[1]) ** 2)


@api_view(["GET"])
def reverse(request):
    try:
        lat, lon = float(request.query_params["lat"]), float(request.query_params["lon"])
    except (KeyError, ValueError):
        return Response({"error": "lat and lon are required"}, status=400)
    return Response({"label": geo.reverse_label(round(lat, 2), round(lon, 2))})


@api_view(["POST"])
def plan(request):
    ser = PlanRequest(data=request.data)
    ser.is_valid(raise_exception=True)
    d = ser.validated_data

    try:
        places = []
        for key in ("current", "pickup", "dropoff"):
            text, pt = d[f"{key}_location"].strip(), d.get(f"{key}_point")
            places.append((pt["lat"], pt["lon"], text) if pt else geo.geocode(text))
        rt = geo.route([(p[0], p[1]) for p in places])
    except geo.GeoError as e:
        return Response({"error": str(e)}, status=422)

    start = d.get("start_time") or datetime.now().replace(hour=8, minute=0, second=0, microsecond=0)
    start = start.replace(tzinfo=None)
    start_min = start.hour * 60 + start.minute

    events, _ = hos.plan_events(rt["legs_mi"], start_min, d["cycle_used_hours"])
    total_mi = sum(rt["legs_mi"])
    line = hos.Polyline(rt["coords"])
    names = {
        "start": d["current_location"].strip(),
        "pickup": d["pickup_location"].strip(),
        "dropoff": d["dropoff_location"].strip(),
    }
    coords_of = {"start": places[0][:2], "pickup": places[1][:2], "dropoff": places[2][:2]}

    # Position + provisional label for each event. Friendly "City, ST" names are resolved lazily by the
    # client through /api/reverse/ (Nominatim allows 1 request/second, so we keep /plan fast).
    for i, e in enumerate(events):
        e["id"] = i
        kind = e["kind"]
        if kind in ("pickup", "dropoff") or i == 0:
            key = kind if kind in ("pickup", "dropoff") else "start"
            e["lat"], e["lon"] = coords_of[key]
            e["label"] = names[key]
            e["resolved"] = True
            e["loc_id"] = i
            continue
        if kind == "drive":
            # Driving resumes where the previous stop happened, so share its place name.
            prev = events[i - 1]
            e["lat"], e["lon"], e["label"] = prev["lat"], prev["lon"], prev["label"]
            e["resolved"], e["loc_id"] = prev["resolved"], prev["loc_id"]
            continue
        e["lat"], e["lon"] = line.at(e["mile"] / total_mi if total_mi else 0)
        e["label"] = f"Mile {round(e['mile'])} of route"
        e["resolved"] = False
        e["loc_id"] = i

    geometry = _sample(rt["coords"])
    days = hos.build_daily_logs(events, start_min, d["cycle_used_hours"], lambda e: e["label"])
    base = start.replace(hour=0, minute=0, second=0, microsecond=0)
    for day in days:
        day["date"] = (base + timedelta(days=day["day_index"])).date().isoformat()

    stops = [
        {
            "kind": e["kind"],
            "label": e["label"],
            "lat": round(e["lat"], 5),
            "lon": round(e["lon"], 5),
            "start": e["start"],
            "end": e["end"],
            "duration_min": round(e["end"] - e["start"]),
            "note": e["note"],
            "mile": round(e["mile"], 1),
            "event_id": e["id"],
            "loc_id": e["loc_id"],
            "resolved": e["resolved"],
        }
        for e in events
        if e["kind"] != "drive"
    ]
    drive_h = sum((e["end"] - e["start"]) for e in events if e["status"] == hos.DRIVING) / 60
    return Response(
        {
            "start_date": base.date().isoformat(),
            "start_minute": start_min,
            "route": {
                "geometry": geometry,
                "pickup_index": _nearest_index(geometry, coords_of["pickup"]),
                "total_miles": round(total_mi, 1),
                "leg_miles": [round(x, 1) for x in rt["legs_mi"]],
                "approximate": rt["approximate"],
            },
            "waypoints": [
                {"kind": k, "label": names[k], "lat": coords_of[k][0], "lon": coords_of[k][1]}
                for k in ("start", "pickup", "dropoff")
            ],
            "events": [
                {k: (round(v, 2) if isinstance(v, float) else v) for k, v in e.items()} for e in events
            ],
            "stops": stops,
            "days": days,
            "summary": {
                "total_miles": round(total_mi, 1),
                "driving_hours": round(drive_h, 1),
                "trip_hours": round((events[-1]["end"] - start_min) / 60, 1),
                "days": len(days),
                "fuel_stops": sum(1 for e in events if e["kind"] == "fuel"),
                "rests": sum(1 for e in events if e["kind"] in ("rest", "restart")),
            },
        }
    )
