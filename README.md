# ELD Trip Planner

Plan a trip, get the route, and get the driver's daily log sheets filled in automatically.

**Live app:** https://danishsaleem7.github.io/eld-trip-planner/
**API health check:** https://eld-trip-planner-api-lb5c.onrender.com/api/health/

> The API runs on a free Render instance that sleeps when idle. The first request after a quiet period can take up to a minute while it wakes up; the app shows a message while it waits and retries once on its own.

## What it does

Enter four things: **current location, pickup, drop-off, and cycle hours already used**. The app returns:

1. **A route map** with the whole trip drawn on it (dashed to pickup, solid while loaded) and every pickup, drop-off, fuel stop, 30-minute break, 10-hour rest and 34-hour restart marked. Click a stop in the timeline to jump to it on the map.
2. **Driver's Daily Log sheets**, one per calendar day, drawn on the standard 24-hour grid and filled in: duty-status line, per-status totals (adding up to 24), total miles, remarks with a place name at every change of duty status, driver certification, and the 70 hr / 8 day recap. Logs can be printed, one sheet per page.

Assumptions from the brief: property-carrying driver on the 70 hr / 8 day cycle, no adverse driving conditions, fueling at least every 1,000 miles, and 1 hour on duty for pickup and for drop-off.

## Tech

| Layer | Stack |
|---|---|
| Backend | Python, Django, Django REST Framework |
| Frontend | React, TypeScript, Vite, Leaflet |
| Maps and geocoding | OpenStreetMap tiles, Nominatim (geocoding and reverse geocoding), Photon (search-as-you-type), OSRM (routing) |
| Hosting | Frontend on GitHub Pages (built by GitHub Actions), backend on Render |

All map and routing services are free and need no API key.

## How the hours-of-service scheduler works

The scheduling logic lives in `backend/trips/hos.py`. It walks the trip forward in time and inserts a stop whenever a limit from the FMCSA *Interstate Truck Driver's Guide to Hours of Service* (49 CFR 395.3) is about to be reached.

| Rule | How it is applied |
|---|---|
| 11-hour driving limit | Driving is capped at 11 hours since the last 10-hour rest. |
| 14-hour driving window | The window opens at the first on-duty time. No driving after it closes. |
| 30-minute break | Required after 8 cumulative hours of driving. Any 30-minute or longer stop that is not driving (fuel, pickup, drop-off) also counts. |
| 10 hours off duty | Logged as sleeper berth. It resets the 11-hour and 14-hour clocks. |
| 70 hours in 8 days | The hours already used count toward the limit. Before the cycle would be exceeded, a 34-hour restart is scheduled, which resets the cycle. |
| Fuel | A 30-minute on-duty fuel stop at least every 1,000 miles. |
| Pickup and drop-off | 1 hour each, logged as on duty (not driving). |

Driving time is estimated at an average of 55 mph, since car routing times are too optimistic for a truck. The event timeline is then sliced at midnight into daily logs, padded with off-duty time so each sheet covers 24 hours.

### Limitations

- The app takes a single "cycle used" number rather than a day-by-day history, so hours do not roll off the 8-day window during a trip. The 34-hour restart is the only thing that resets the cycle. The recap's "last 5 days" line counts trip days only.
- Rests use the full 10-hour sleeper-berth period. Split-sleeper pairing is not modelled.
- The 55 mph average is an estimate.
- Place names for rests and fuel stops come from reverse geocoding the point on the route. In open country this can be a county rather than a town.

## Project structure

```
backend/
  config/          Django settings and URLs
  trips/
    geo.py         geocoding, reverse geocoding, routing (with a straight-line fallback)
    hos.py         the scheduler and the daily-log builder
    views.py       POST /api/plan/, GET /api/reverse/, GET /api/health/
  tests/           scheduler tests
frontend/
  src/
    components/    TripForm, LocationInput (autocomplete), RouteMap, LogSheet (SVG)
    validate.ts    form validation rules
    api.ts         API client: timeout, one retry, field-level errors
render.yaml        Render service definition
.github/workflows  GitHub Pages deploy for the frontend
```

## API

`POST /api/plan/`

```json
{
  "current_location": "Chicago, IL",
  "pickup_location": "Dallas, TX",
  "dropoff_location": "Los Angeles, CA",
  "cycle_used_hours": 30,
  "start_time": "2026-10-06T08:00"
}
```

Optional `current_point`, `pickup_point` and `dropoff_point` (`{lat, lon}`) skip geocoding when a suggestion was picked in the UI. The response contains the route geometry, waypoints, stops, daily logs and a summary.

`GET /api/reverse/?lat=..&lon=..` returns a "City, ST" label for a point. `GET /api/health/` returns `{"status": "ok"}`.

## Run locally

Backend (Python 3.11 or newer):

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python manage.py runserver 8000
```

Tests:

```bash
pip install pytest
pytest tests
```

Frontend (Node 18 or newer):

```bash
cd frontend
npm install
npm run dev
```

The frontend reads the API address from `VITE_API_URL` and defaults to `http://localhost:8000`.

## Deployment

**Backend (Render).** A web service with root directory `backend`, build command `pip install -r requirements.txt` and start command `gunicorn config.wsgi --timeout 60 --bind 0.0.0.0:$PORT` (see `render.yaml`). Environment variables: `DJANGO_DEBUG=false`, `DJANGO_SECRET_KEY`, `DJANGO_ALLOWED_HOSTS`, and `CORS_ALLOWED_ORIGINS` set to the frontend origin.

**Frontend (GitHub Pages).** `.github/workflows/deploy-frontend.yml` builds `frontend/` on every push to `main` and publishes it. In the repository settings, Pages uses the "GitHub Actions" source, and the repository variable `VITE_API_URL` holds the backend URL.

## Credits

Map data © OpenStreetMap contributors. Geocoding by Nominatim, search suggestions by Photon, routing by OSRM. Hours-of-service rules from the FMCSA driver's guide.
