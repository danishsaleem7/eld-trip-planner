import { useEffect, useRef, useState } from 'react'
import type { Meta, Point, TripInput } from '../types'
import { validate, type Errors, type FieldKey } from '../validate'
import { LocationInput } from './LocationInput'

const pad = (n: number) => String(n).padStart(2, '0')
const blankMeta: Meta = { carrier: '', office: '', vehicle: '', shipping: '', driver: '', codriver: '' }

function defaultStart() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T08:00`
}

const blankTrip = (): TripInput => ({
  current_location: '',
  pickup_location: '',
  dropoff_location: '',
  cycle_used_hours: 0,
  start_time: defaultStart(),
})

interface Props {
  loading: boolean
  step?: string
  /** field messages that came back from the server */
  serverErrors: Errors
  onSubmit: (t: TripInput, m: Meta) => void
  onReset: () => void
}

export function TripForm({ loading, step, serverErrors, onSubmit, onReset }: Props) {
  const [t, setT] = useState<TripInput>(blankTrip)
  const [m, setM] = useState<Meta>(blankMeta)
  const [cycleText, setCycleText] = useState('0')
  const [errors, setErrors] = useState<Errors>({})
  const [formKey, setFormKey] = useState(0) // bumping this remounts the location inputs on reset
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (Object.keys(serverErrors).length) setErrors((prev) => ({ ...prev, ...serverErrors }))
  }, [serverErrors])

  const clear = (k: FieldKey) => setErrors((prev) => (prev[k] ? { ...prev, [k]: undefined } : prev))
  const setPlace = (k: 'current' | 'pickup' | 'dropoff') => (text: string, point: Point | null) => {
    setT((prev) => ({ ...prev, [`${k}_location`]: text, [`${k}_point`]: point }))
    clear(k)
    if (k === 'pickup' || k === 'dropoff') clear('dropoff')
  }
  const setMeta = (k: keyof Meta) => (e: React.ChangeEvent<HTMLInputElement>) => setM({ ...m, [k]: e.target.value })

  const example = () => {
    setT({
      ...t,
      current_location: 'Chicago, IL',
      pickup_location: 'Dallas, TX',
      dropoff_location: 'Los Angeles, CA',
      current_point: null,
      pickup_point: null,
      dropoff_point: null,
    })
    setCycleText('30')
    setErrors({})
    setFormKey((k) => k + 1)
    setM({
      carrier: 'Northline Freight LLC',
      office: '120 W Randolph St, Chicago, IL',
      vehicle: 'Truck 214 / Trailer 8841',
      shipping: 'BOL 55120 - Palletized goods',
      driver: 'Alex Morgan',
      codriver: '',
    })
  }

  const reset = () => {
    setT(blankTrip())
    setM(blankMeta)
    setCycleText('0')
    setErrors({})
    setFormKey((k) => k + 1)
    onReset()
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const found = validate(t, cycleText)
    setErrors(found)
    if (Object.keys(found).length) {
      // Move focus to the first invalid field so keyboard and screen-reader users land on it.
      setTimeout(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0)
      return
    }
    onSubmit({ ...t, cycle_used_hours: Number(cycleText) }, m)
  }

  const cycleNum = Number(cycleText)
  const available = Number.isFinite(cycleNum) ? Math.max(0, 70 - cycleNum) : 70

  return (
    <form className="card form" ref={formRef} onSubmit={submit} noValidate>
      <div className="card-head">
        <h2>Trip details</h2>
        <div className="head-actions">
          <button type="button" className="link" onClick={example}>
            Fill example
          </button>
          <button type="button" className="link muted" onClick={reset}>
            Reset
          </button>
        </div>
      </div>

      <LocationInput key={`c${formKey}`} label="Current location" dot="s" value={t.current_location} matched={!!t.current_point} error={errors.current} onChange={setPlace('current')} placeholder="Start typing a city or address" />
      <LocationInput key={`p${formKey}`} label="Pickup location" dot="p" value={t.pickup_location} matched={!!t.pickup_point} error={errors.pickup} onChange={setPlace('pickup')} placeholder="Where the load is picked up" />
      <LocationInput key={`d${formKey}`} label="Drop-off location" dot="d" value={t.dropoff_location} matched={!!t.dropoff_point} error={errors.dropoff} onChange={setPlace('dropoff')} placeholder="Where the load is delivered" />

      <div className="row2">
        <div className="field">
          <label htmlFor="cycle">Cycle used (hrs)</label>
          <input
            id="cycle"
            inputMode="decimal"
            value={cycleText}
            aria-invalid={errors.cycle ? true : undefined}
            aria-describedby={errors.cycle ? 'cycle-msg' : undefined}
            onChange={(e) => {
              setCycleText(e.target.value)
              clear('cycle')
            }}
          />
          {errors.cycle && <p className="field-error" id="cycle-msg" role="alert">{errors.cycle}</p>}
        </div>
        <div className="field">
          <label htmlFor="start">Departure</label>
          <input
            id="start"
            type="datetime-local"
            value={t.start_time}
            aria-invalid={errors.start ? true : undefined}
            aria-describedby={errors.start ? 'start-msg' : undefined}
            onChange={(e) => {
              setT({ ...t, start_time: e.target.value })
              clear('start')
            }}
          />
          {errors.start && <p className="field-error" id="start-msg" role="alert">{errors.start}</p>}
        </div>
      </div>
      <p className="hint">70 hr / 8 day cycle · {available.toFixed(1)} hrs available</p>

      <details>
        <summary>Log sheet header (optional)</summary>
        <div className="field"><label htmlFor="m-carrier">Carrier name</label><input id="m-carrier" value={m.carrier} onChange={setMeta('carrier')} /></div>
        <div className="field"><label htmlFor="m-office">Main office address</label><input id="m-office" value={m.office} onChange={setMeta('office')} /></div>
        <div className="field"><label htmlFor="m-vehicle">Truck / trailer no.</label><input id="m-vehicle" value={m.vehicle} onChange={setMeta('vehicle')} /></div>
        <div className="field"><label htmlFor="m-ship">Shipper &amp; commodity</label><input id="m-ship" value={m.shipping} onChange={setMeta('shipping')} /></div>
        <div className="field"><label htmlFor="m-driver">Driver (signature)</label><input id="m-driver" value={m.driver} onChange={setMeta('driver')} /></div>
        <div className="field"><label htmlFor="m-co">Co-driver</label><input id="m-co" value={m.codriver} onChange={setMeta('codriver')} /></div>
      </details>

      <button className="primary" disabled={loading} aria-live="polite">
        {loading ? <><span className="spinner" /> {step ?? 'Planning route…'}</> : 'Plan trip & generate logs'}
      </button>
    </form>
  )
}
