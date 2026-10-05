from trips import hos


def _check(events, cycle_used=0):
    """Assert the HOS invariants hold for a planned event list."""
    drive_day = since_break = 0.0
    window = None
    cycle = cycle_used * 60
    for e in events:
        dur = e["end"] - e["start"]
        if e["status"] == hos.DRIVING:
            if window is None:
                window = e["start"]
            drive_day += dur
            since_break += dur
            cycle += dur
            assert drive_day <= 660 + 1e-6
            assert e["end"] <= window + 840 + 1e-6
            assert since_break <= 480 + 1e-6
            assert cycle <= 4200 + 1e-6
        else:
            if e["status"] == hos.ON:
                window = window if window is not None else e["start"]
                cycle += dur
            if dur >= 30:
                since_break = 0.0
            if dur >= 600 or e["kind"] == "restart":
                drive_day, window = 0.0, None
            if e["kind"] == "restart":
                cycle = 0.0


def _contiguous(events):
    for a, b in zip(events, events[1:]):
        assert abs(a["end"] - b["start"]) < 1e-6


def test_short_trip_has_pickup_and_dropoff_no_rest():
    ev, _ = hos.plan_events([50, 100], 8 * 60, 0)
    kinds = [e["kind"] for e in ev]
    assert kinds == ["drive", "pickup", "drive", "dropoff"]
    assert "rest" not in kinds
    _contiguous(ev)
    _check(ev)


def test_long_trip_inserts_breaks_rests_and_fuel():
    ev, _ = hos.plan_events([300, 2400], 6 * 60, 20)
    kinds = [e["kind"] for e in ev]
    assert "break" in kinds and "rest" in kinds and kinds.count("fuel") >= 2
    _contiguous(ev)
    _check(ev, 20)
    total = sum((e["end"] - e["start"]) / 60 * hos.AVG_MPH for e in ev if e["status"] == hos.DRIVING)
    assert abs(total - 2700) < 1


def test_high_cycle_usage_triggers_34h_restart():
    ev, _ = hos.plan_events([200, 1500], 6 * 60, 65)
    assert any(e["kind"] == "restart" for e in ev)
    _contiguous(ev)
    _check(ev, 65)


def test_daily_logs_cover_24h_each_day():
    ev, _ = hos.plan_events([300, 2400], 6 * 60, 0)
    days = hos.build_daily_logs(ev, 6 * 60, 0, lambda e: "x")
    assert len(days) >= 4
    for d in days:
        assert abs(sum(d["totals"].values()) - 24) < 0.05
        assert d["segments"][0]["start"] == 0 and d["segments"][-1]["end"] == 1440


def test_recap_never_exceeds_70_and_resets_after_restart():
    ev, _ = hos.plan_events([200, 3300], 6 * 60, 30)
    assert any(e["kind"] == "restart" for e in ev)
    days = hos.build_daily_logs(ev, 6 * 60, 30, lambda e: "x")
    for d in days:
        assert d["recap"]["a_last_8_days"] <= 70.01
        assert abs(d["recap"]["a_last_8_days"] + d["recap"]["b_available_tomorrow"] - 70) < 0.02 or d["recap"]["b_available_tomorrow"] == 0
    # the day the restart completes starts counting from zero again
    assert days[-1]["recap"]["a_last_8_days"] < days[-1]["recap"]["on_duty_today"] + 30
