"""Hours-of-Service planner for a property-carrying driver (70 hr / 8 day, no adverse conditions).

Rules modelled (FMCSA 49 CFR 395.3):
  * 11-hour driving limit            * 14-hour driving window (starts at first on-duty time)
  * 30-min break after 8 cum. driving hours (any >=30 min non-driving period satisfies it)
  * 10 consecutive hours off duty (sleeper berth) resets the daily clocks
  * 70 hours on duty in 8 days; a 34-hour restart resets the cycle
Trip assumptions from the brief: fuel at least every 1,000 miles, 1 hour for pickup and for drop-off.
All times are minutes from midnight of the trip's start date.
"""
from bisect import bisect_left

from .geo import haversine_mi

DRIVE_LIMIT = 11 * 60
WINDOW = 14 * 60
BREAK_AFTER = 8 * 60
BREAK_LEN = 30
REST = 10 * 60
CYCLE = 70 * 60
RESTART = 34 * 60
FUEL_EVERY_MI = 1000.0
FUEL_STOP = 30
HANDLING = 60
AVG_MPH = 55.0
EPS = 1e-6

OFF, SB, DRIVING, ON = "OFF", "SB", "D", "ON"


class Polyline:
    def __init__(self, coords):
        self.coords = coords
        self.cum = [0.0]
        for a, b in zip(coords, coords[1:]):
            self.cum.append(self.cum[-1] + haversine_mi(a, b))
        self.total = self.cum[-1] or 1e-9

    def at(self, frac):
        """Point at a fraction (0..1) of the way along the line."""
        d = max(0.0, min(1.0, frac)) * self.total
        i = min(max(bisect_left(self.cum, d), 1), len(self.cum) - 1)
        seg = self.cum[i] - self.cum[i - 1] or 1e-9
        f = (d - self.cum[i - 1]) / seg
        (la1, lo1), (la2, lo2) = self.coords[i - 1], self.coords[i]
        return la1 + (la2 - la1) * f, lo1 + (lo2 - lo1) * f


class Planner:
    def __init__(self, start_min, cycle_used_hours):
        self.t = float(start_min)
        self.cycle = cycle_used_hours * 60.0
        self.window_start = None
        self.drive_day = 0.0
        self.since_break = 0.0
        self.since_fuel = 0.0
        self.mile = 0.0
        self.events = []

    def _add(self, status, dur, kind, note=""):
        self.events.append(
            {"status": status, "start": self.t, "end": self.t + dur, "kind": kind, "note": note, "mile": self.mile}
        )
        self.t += dur

    def _window_expired(self):
        return self.window_start is not None and self.t >= self.window_start + WINDOW - EPS

    def on_duty(self, dur, kind, note=""):
        if self.window_start is None:
            self.window_start = self.t
        self._add(ON, dur, kind, note)
        self.cycle += dur
        if dur >= BREAK_LEN:
            self.since_break = 0.0

    def rest(self):
        self._add(SB, REST, "rest", "10-hr off-duty (sleeper berth)")
        self.window_start, self.drive_day, self.since_break = None, 0.0, 0.0

    def restart(self):
        self._add(OFF, RESTART, "restart", "34-hr restart: 70-hr cycle reset")
        self.cycle = 0.0
        self.window_start, self.drive_day, self.since_break = None, 0.0, 0.0

    def break_30(self):
        self._add(OFF, BREAK_LEN, "break", "30-min break (8 hrs driving)")
        self.since_break = 0.0

    def fuel(self):
        self.on_duty(FUEL_STOP, "fuel", "Fueling")
        self.since_fuel = 0.0

    def drive(self, miles):
        remaining = miles
        while remaining > EPS:
            if CYCLE - self.cycle <= EPS:
                self.restart()
                continue
            if self.drive_day >= DRIVE_LIMIT - EPS or self._window_expired():
                self.rest()
                continue
            if BREAK_AFTER - self.since_break <= EPS:
                self.break_30()
                continue
            if FUEL_EVERY_MI - self.since_fuel <= EPS:
                if self.cycle + FUEL_STOP > CYCLE:  # the stop itself would push the cycle past 70 h
                    self.restart()
                self.fuel()
                continue
            if self.window_start is None:
                self.window_start = self.t
            chunk = min(
                DRIVE_LIMIT - self.drive_day,
                self.window_start + WINDOW - self.t,
                BREAK_AFTER - self.since_break,
                CYCLE - self.cycle,
                remaining / AVG_MPH * 60,
                (FUEL_EVERY_MI - self.since_fuel) / AVG_MPH * 60,
            )
            mi = chunk / 60 * AVG_MPH
            self._add(DRIVING, chunk, "drive")
            self.mile += mi
            remaining -= mi
            self.since_fuel += mi
            self.drive_day += chunk
            self.since_break += chunk
            self.cycle += chunk

    def stop(self, kind, note):
        if self.cycle + HANDLING > CYCLE:  # keep the 70 h cycle honest: reset before work that would exceed it
            self.restart()
        if self._window_expired():
            self.rest()
        self.on_duty(HANDLING, kind, note)


def plan_events(leg_miles, start_min, cycle_used_hours):
    """leg_miles = [current->pickup, pickup->dropoff]. Returns (events, pickup_mile)."""
    p = Planner(start_min, cycle_used_hours)
    p.drive(leg_miles[0])
    pickup_mile = p.mile
    p.stop("pickup", "Pickup (1 hr)")
    p.drive(leg_miles[1])
    p.stop("dropoff", "Drop-off (1 hr)")
    return p.events, pickup_mile


def _pad(status_start, status_end):
    return {"status": OFF, "start": status_start, "end": status_end, "kind": "pad", "note": "", "location": "", "loc_id": None,
            "continued": False}


def build_daily_logs(events, start_min, initial_cycle_hours, label_for):
    """Slice events into calendar days (midnight to midnight) and pad with off-duty time."""
    end = events[-1]["end"]
    first_day, last_day = int(start_min // 1440), int((end - EPS) // 1440)
    # Recap (70 hr / 8 day): `cycle` mirrors the planner's own cycle clock, so a completed 34-hour restart
    # wipes everything before it; `since_restart` holds each day's on-duty hours after the last restart.
    days, cycle, since_restart = [], float(initial_cycle_hours), []
    for d in range(first_day, last_day + 1):
        lo, hi = d * 1440, (d + 1) * 1440
        segs, miles, day_post = [], 0.0, 0.0
        for e in events:
            s, f = max(e["start"], lo), min(e["end"], hi)
            if f - s <= EPS:
                continue
            if e["status"] in (DRIVING, ON):
                cycle += (f - s) / 60
                day_post += (f - s) / 60
            elif e["kind"] == "restart" and e["end"] <= hi + EPS:
                cycle, day_post, since_restart = 0.0, 0.0, []
            segs.append(
                {
                    "status": e["status"],
                    "start": round(s - lo, 2),
                    "end": round(f - lo, 2),
                    "kind": e["kind"],
                    "note": e["note"],
                    "location": label_for(e),
                    "event_id": e.get("id"),
                    "loc_id": e.get("loc_id", e.get("id")),
                    "continued": e["start"] < lo,
                }
            )
            if e["status"] == DRIVING:
                miles += (f - s) / 60 * AVG_MPH
        if segs and segs[0]["start"] > EPS:
            segs.insert(0, _pad(0, segs[0]["start"]))
        if segs and segs[-1]["end"] < 1440 - EPS:
            tail = _pad(segs[-1]["end"], 1440)
            if d == last_day:  # trip finished: going off duty is a logged change of duty status
                last = events[-1]
                tail.update(kind="end", note="Off duty - trip complete", location=label_for(last),
                            loc_id=last.get("loc_id", last.get("id")))
            segs.append(tail)
        totals = {k: 0.0 for k in (OFF, SB, DRIVING, ON)}
        for s in segs:
            totals[s["status"]] += (s["end"] - s["start"]) / 60
        on_hours = totals[DRIVING] + totals[ON]
        since_restart.append(day_post)
        days.append(
            {
                "day_index": d - first_day,
                "minute_offset": d * 1440,
                "segments": segs,
                "totals": {k: round(v, 2) for k, v in totals.items()},
                "miles_driving": round(miles, 1),
                "recap": {
                    "on_duty_today": round(on_hours, 2),
                    "a_last_8_days": round(cycle, 2),
                    "b_available_tomorrow": round(max(0.0, 70 - cycle), 2),
                    "c_last_5_days": round(sum(since_restart[-5:]), 2),
                },
            }
        )
    return days
