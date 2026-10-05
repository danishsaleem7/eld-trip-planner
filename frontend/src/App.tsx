import { useEffect, useRef, useState } from 'react'
import { planTrip, reverseLabel } from './api'
import { KIND_META, hoursLabel, stamp } from './format'
import { LogSheet } from './components/LogSheet'
import { RouteMap, type Focus } from './components/RouteMap'
import { TripForm } from './components/TripForm'
import type { DayLog, Meta, Plan, TripInput } from './types'

const EMPTY_META: Meta = { carrier: '', office: '', vehicle: '', shipping: '', driver: '', codriver: '' }
const STEPS = ['Locating your addresses…', 'Finding the best route…', 'Scheduling fuel, breaks and rests…', 'Drawing your log sheets…']

export default function App() {
  const [plan, setPlan] = useState<Plan | null>(null)
  const [meta, setMeta] = useState<Meta>(EMPTY_META)
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState(0)
  const [error, setError] = useState('')
  const [labels, setLabels] = useState<Record<number, string>>({})
  const [day, setDay] = useState(0)
  const [focus, setFocus] = useState<Focus | null>(null)
  const run = useRef(0)
  const mapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    document.title = 'ELD Trip Planner'
  }, [])

  useEffect(() => {
    if (!loading) return
    setStep(0)
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 2200)
    return () => clearInterval(t)
  }, [loading])

  async function submit(input: TripInput, m: Meta) {
    const id = ++run.current
    setLoading(true)
    setError('')
    try {
      const p = await planTrip(input)
      if (id !== run.current) return
      setPlan(p)
      setMeta(m)
      setLabels({})
      setDay(0)
      setFocus(null)
      setLoading(false)
      // Resolve "City, ST" names for rests/fuel/breaks in the background (Nominatim: max 1 request/sec).
      for (const s of p.stops.filter((s) => !s.resolved)) {
        const label = await reverseLabel(s.lat, s.lon)
        if (id !== run.current) return
        if (label) setLabels((l) => ({ ...l, [s.loc_id]: label }))
        await new Promise((r) => setTimeout(r, 1100))
      }
    } catch (e) {
      if (id === run.current) setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (id === run.current) setLoading(false)
    }
  }

  function reset() {
    run.current++ // cancels any in-flight request and background label lookups
    setPlan(null)
    setMeta(EMPTY_META)
    setLabels({})
    setError('')
    setFocus(null)
    setDay(0)
    setLoading(false)
  }

  function flyTo(lat: number, lon: number) {
    setFocus({ lat, lon, n: Date.now() })
    mapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  const from = plan?.waypoints[0].label ?? ''
  const to = plan?.waypoints[2].label ?? ''

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="logo">⛟</span>
          <div>
            <h1>ELD Trip Planner</h1>
            <p>HOS-compliant routes &amp; driver daily logs</p>
          </div>
        </div>
        {plan && (
          <button className="ghost" onClick={() => window.print()}>
            ⎙ Print all logs
          </button>
        )}
      </header>

      <main className="layout">
        <aside className="side">
          <TripForm loading={loading} step={STEPS[step]} onSubmit={submit} onReset={reset} />
          {error && (
            <div className="error" role="alert">
              <b>We couldn&apos;t plan that trip</b>
              <span>{error}</span>
            </div>
          )}
          {plan && <Summary plan={plan} labels={labels} onSelect={flyTo} />}
        </aside>

        <section className="content">
          {!plan ? (
            loading ? <Skeleton step={STEPS[step]} /> : <Empty />
          ) : (
            <>
              <div className="card map-card" ref={mapRef}>
                <RouteMap plan={plan} labels={labels} focus={focus} />
                <Legend />
                {plan.route.approximate && (
                  <div className="notice">Routing service unavailable — showing an approximate straight-line route.</div>
                )}
              </div>

              <div className="card logs-card">
                <div className="card-head">
                  <div>
                    <h2>Daily log sheets</h2>
                    <p className="sub">{plan.days.length} sheet{plan.days.length > 1 ? 's' : ''} · one per calendar day</p>
                  </div>
                  <div className="tabs" role="tablist">
                    {plan.days.map((d, i) => (
                      <button key={d.date} role="tab" aria-selected={i === day} className={i === day ? 'on' : ''} onClick={() => setDay(i)}>
                        Day {i + 1}
                        <small>{d.date.slice(5)}</small>
                      </button>
                    ))}
                  </div>
                </div>
                <DayChips day={plan.days[day]} />
                <div className="sheet-wrap">
                  <LogSheet day={plan.days[day]} meta={meta} from={from} to={to} labels={labels} />
                </div>
                <div className="pager">
                  <button disabled={day === 0} onClick={() => setDay(day - 1)}>← Previous day</button>
                  <button disabled={day === plan.days.length - 1} onClick={() => setDay(day + 1)}>Next day →</button>
                </div>
              </div>

              <div className="print-only">
                {plan.days.map((d) => (
                  <div className="print-page" key={d.date}>
                    <LogSheet day={d} meta={meta} from={from} to={to} labels={labels} />
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  )
}

function Empty() {
  return (
    <div className="empty card">
      <div className="empty-art">⛟</div>
      <h2>Plan a compliant trip in seconds</h2>
      <p>
        Enter where you are, where you pick up and where you deliver. We route it, schedule fuel, breaks and rests under
        the 70 hr / 8 day rule, and fill out every daily log sheet.
      </p>
      <ul className="features">
        <li><b>Route map</b>Every stop, break and rest on the map</li>
        <li><b>Log sheets</b>One filled-out 24-hour grid per day</li>
        <li><b>HOS rules</b>11 hr, 14 hr, 30-min break, 70 hr / 8 day</li>
      </ul>
    </div>
  )
}

function Skeleton({ step }: { step: string }) {
  return (
    <div className="card skeleton" aria-busy="true">
      <div className="sk-map" />
      <p>{step}</p>
    </div>
  )
}

function DayChips({ day }: { day: DayLog }) {
  const t = day.totals
  const ok = (v: boolean, label: string) => (
    <span className={`badge ${v ? 'good' : 'bad'}`}>{v ? '✓' : '!'} {label}</span>
  )
  return (
    <div className="chips">
      <div><b>{Math.round(day.miles_driving)}</b><span>miles</span></div>
      <div><b>{hoursLabel(t.D)}</b><span>driving</span></div>
      <div><b>{hoursLabel(t.ON)}</b><span>on duty</span></div>
      <div><b>{hoursLabel(t.OFF + t.SB)}</b><span>off / sleeper</span></div>
      <div className="badges">
        {ok(t.D <= 11.001, '11-hr driving limit')}
        {ok(day.recap.a_last_8_days <= 70.001, `70-hr cycle (${day.recap.a_last_8_days.toFixed(1)} h)`)}
      </div>
    </div>
  )
}

function Summary({ plan, labels, onSelect }: { plan: Plan; labels: Record<number, string>; onSelect: (lat: number, lon: number) => void }) {
  const s = plan.summary
  return (
    <div className="card">
      <h2>Trip summary</h2>
      <div className="stats">
        <div><b>{Math.round(s.total_miles).toLocaleString()}</b><span>miles</span></div>
        <div><b>{hoursLabel(s.driving_hours)}</b><span>driving</span></div>
        <div><b>{s.days}</b><span>log days</span></div>
        <div><b>{s.fuel_stops}</b><span>fuel stops</span></div>
      </div>
      <ol className="timeline">
        <li>
          <button onClick={() => onSelect(plan.waypoints[0].lat, plan.waypoints[0].lon)}>
            <i style={{ background: KIND_META.start.color }}>{KIND_META.start.icon}</i>
            <div><b>Depart</b><small>{stamp(plan.start_date, plan.start_minute)} · {plan.waypoints[0].label}</small></div>
          </button>
        </li>
        {plan.stops.map((st) => (
          <li key={st.event_id}>
            <button onClick={() => onSelect(st.lat, st.lon)}>
              <i style={{ background: KIND_META[st.kind].color }}>{KIND_META[st.kind].icon}</i>
              <div>
                <b>{KIND_META[st.kind].label} · {hoursLabel(st.duration_min / 60)}</b>
                <small>{stamp(plan.start_date, st.start)} · {labels[st.loc_id] ?? st.label}</small>
              </div>
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}

function Legend() {
  return (
    <div className="legend">
      {['start', 'pickup', 'dropoff', 'fuel', 'break', 'rest', 'restart'].map((k) => (
        <span key={k}><i style={{ background: KIND_META[k].color }} />{KIND_META[k].label}</span>
      ))}
      <span><i className="dash" />To pickup</span>
      <span><i className="solid" />Loaded</span>
    </div>
  )
}
