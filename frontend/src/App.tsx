import { useEffect, useRef, useState } from 'react'
import { ApiError, planTrip, reverseLabel } from './api'
import { KIND_META, hoursLabel, stamp } from './format'
import { Icon } from './icons'
import { LogSheet } from './components/LogSheet'
import { RouteMap, type Focus } from './components/RouteMap'
import { TripForm } from './components/TripForm'
import type { Errors } from './validate'
import type { DayLog, Meta, Plan, TripInput } from './types'

const EMPTY_META: Meta = { carrier: '', office: '', vehicle: '', shipping: '', driver: '', codriver: '' }
const STEPS = ['Locating your addresses…', 'Finding the best route…', 'Scheduling fuel, breaks and rests…', 'Drawing your log sheets…']
const WAKING = 'Still working — the free server may be waking up (up to a minute)…'

type Theme = 'light' | 'dark'
const prefersDark = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches

function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem('theme')
      if (saved === 'light' || saved === 'dark') return saved
    } catch {
      /* storage unavailable */
    }
    return prefersDark() ? 'dark' : 'light'
  })
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])
  const toggle = () =>
    setTheme((t) => {
      const next = t === 'dark' ? 'light' : 'dark'
      try {
        localStorage.setItem('theme', next)
      } catch {
        /* ignore */
      }
      return next
    })
  return [theme, toggle]
}

export default function App() {
  const [theme, toggleTheme] = useTheme()
  const [plan, setPlan] = useState<Plan | null>(null)
  const [meta, setMeta] = useState<Meta>(EMPTY_META)
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState(0)
  const [slow, setSlow] = useState(false)
  const [error, setError] = useState<{ message: string; retryable: boolean } | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Errors>({})
  const [labels, setLabels] = useState<Record<number, string>>({})
  const [day, setDay] = useState(0)
  const [focus, setFocus] = useState<Focus | null>(null)
  const run = useRef(0)
  const last = useRef<{ input: TripInput; meta: Meta } | null>(null)
  const mapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    document.title = 'ELD Trip Planner'
  }, [])

  useEffect(() => {
    if (!loading) return
    setStep(0)
    setSlow(false)
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 2200)
    const w = setTimeout(() => setSlow(true), 8000)
    return () => {
      clearInterval(t)
      clearTimeout(w)
    }
  }, [loading])

  async function submit(input: TripInput, m: Meta) {
    last.current = { input, meta: m }
    const id = ++run.current
    setLoading(true)
    setError(null)
    setFieldErrors({})
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
      if (id !== run.current) return
      const err = e instanceof ApiError ? e : new ApiError(e instanceof Error ? e.message : String(e))
      setError({ message: err.message, retryable: err.retryable })
      setFieldErrors(err.fields)
    } finally {
      if (id === run.current) setLoading(false)
    }
  }

  function retry() {
    if (last.current) submit(last.current.input, last.current.meta)
  }

  function reset() {
    run.current++ // cancels any in-flight request and background label lookups
    setPlan(null)
    setMeta(EMPTY_META)
    setLabels({})
    setError(null)
    setFieldErrors({})
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
  const stepText = slow ? WAKING : STEPS[step]

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="logo"><Icon name="truck" size={24} sw={1.8} /></span>
          <div>
            <h1>ELD Trip Planner</h1>
            <p>HOS-compliant routes &amp; driver daily logs</p>
          </div>
        </div>
        <div className="top-actions">
          {plan && (
            <button className="ghost" onClick={() => window.print()}>
              <Icon name="print" size={16} /> <span>Print all logs</span>
            </button>
          )}
          <button
            className="ghost icon-only"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          >
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={17} />
          </button>
        </div>
      </header>

      <main className="layout">
        <aside className="side">
          <TripForm loading={loading} step={stepText} serverErrors={fieldErrors} onSubmit={submit} onReset={reset} />
          {error && (
            <div className="error" role="alert">
              <Icon name="alert" size={20} />
              <div>
                <b>We couldn&apos;t plan that trip</b>
                <span>{error.message}</span>
                {error.retryable && (
                  <button className="retry" onClick={retry} disabled={loading}>
                    Try again
                  </button>
                )}
              </div>
            </div>
          )}
          {plan && <Summary plan={plan} labels={labels} onSelect={flyTo} />}
        </aside>

        <section className="content" aria-live="polite">
          {!plan ? (
            loading ? <Skeleton step={stepText} /> : <Empty />
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
                <p className="scroll-hint">Swipe sideways to see the whole sheet →</p>
                <div className="sheet-wrap" tabIndex={0} aria-label="Daily log sheet, scrollable">
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
      <footer className="foot">Map data © OpenStreetMap contributors · Routing by OSRM · Rules: FMCSA 49 CFR 395 (property-carrying, 70 hr / 8 day)</footer>
    </div>
  )
}

function Empty() {
  return (
    <div className="empty card">
      <svg className="empty-art" viewBox="0 0 220 110" role="img" aria-label="Route with pickup and drop-off pins">
        <path d="M20 85 C60 85 60 30 110 40 S170 85 200 30" fill="none" stroke="currentColor" strokeWidth="4" strokeDasharray="2 9" strokeLinecap="round" opacity=".55" />
        <circle cx="20" cy="85" r="9" fill="#2563eb" />
        <circle cx="110" cy="40" r="9" fill="#16a34a" />
        <circle cx="200" cy="30" r="9" fill="#dc2626" />
      </svg>
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
      <p className="tip">Tap a stop to find it on the map.</p>
      <ol className="timeline">
        <li>
          <button onClick={() => onSelect(plan.waypoints[0].lat, plan.waypoints[0].lon)}>
            <i style={{ background: KIND_META.start.color }}><Icon name="start" size={15} /></i>
            <div><b>Depart</b><small>{stamp(plan.start_date, plan.start_minute)} · {plan.waypoints[0].label}</small></div>
          </button>
        </li>
        {plan.stops.map((st) => (
          <li key={st.event_id}>
            <button onClick={() => onSelect(st.lat, st.lon)}>
              <i style={{ background: KIND_META[st.kind].color }}><Icon name={KIND_META[st.kind].icon} size={15} /></i>
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
