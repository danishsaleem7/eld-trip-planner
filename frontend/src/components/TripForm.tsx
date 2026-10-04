import { useState } from 'react'
import type { Meta, TripInput } from '../types'

const pad = (n: number) => String(n).padStart(2, '0')
function defaultStart() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T08:00`
}

interface Props {
  loading: boolean
  step?: string
  onSubmit: (t: TripInput, m: Meta) => void
}

export function TripForm({ loading, step, onSubmit }: Props) {
  const [t, setT] = useState<TripInput>({
    current_location: '',
    pickup_location: '',
    dropoff_location: '',
    cycle_used_hours: 0,
    start_time: defaultStart(),
  })
  const [m, setM] = useState<Meta>({ carrier: '', office: '', vehicle: '', shipping: '', driver: '', codriver: '' })
  const set = (k: keyof TripInput) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setT({ ...t, [k]: k === 'cycle_used_hours' ? Number(e.target.value) : e.target.value })
  const setMeta = (k: keyof Meta) => (e: React.ChangeEvent<HTMLInputElement>) => setM({ ...m, [k]: e.target.value })

  const example = () => {
    setT({
      ...t,
      current_location: 'Chicago, IL',
      pickup_location: 'Dallas, TX',
      dropoff_location: 'Los Angeles, CA',
      cycle_used_hours: 30,
    })
    setM({
      carrier: 'Northline Freight LLC',
      office: '120 W Randolph St, Chicago, IL',
      vehicle: 'Truck 214 / Trailer 8841',
      shipping: 'BOL 55120 - Palletized goods',
      driver: 'Alex Morgan',
      codriver: '',
    })
  }

  return (
    <form
      className="card form"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(t, m)
      }}
    >
      <div className="card-head">
        <h2>Trip details</h2>
        <button type="button" className="link" onClick={example}>
          Fill example
        </button>
      </div>

      <label>
        <span><i className="dot s" />Current location</span>
        <input required value={t.current_location} onChange={set('current_location')} placeholder="City, address or lat,lon" />
      </label>
      <label>
        <span><i className="dot p" />Pickup location</span>
        <input required value={t.pickup_location} onChange={set('pickup_location')} placeholder="Where the load is picked up" />
      </label>
      <label>
        <span><i className="dot d" />Drop-off location</span>
        <input required value={t.dropoff_location} onChange={set('dropoff_location')} placeholder="Where the load is delivered" />
      </label>

      <div className="row2">
        <label>
          <span>Cycle used (hrs)</span>
          <input type="number" min={0} max={70} step={0.25} required value={t.cycle_used_hours} onChange={set('cycle_used_hours')} />
        </label>
        <label>
          <span>Departure</span>
          <input type="datetime-local" required value={t.start_time} onChange={set('start_time')} />
        </label>
      </div>
      <p className="hint">70 hr / 8 day cycle · {Math.max(0, 70 - t.cycle_used_hours).toFixed(1)} hrs available</p>

      <details>
        <summary>Log sheet header (optional)</summary>
        <label><span>Carrier name</span><input value={m.carrier} onChange={setMeta('carrier')} /></label>
        <label><span>Main office address</span><input value={m.office} onChange={setMeta('office')} /></label>
        <label><span>Truck / trailer no.</span><input value={m.vehicle} onChange={setMeta('vehicle')} /></label>
        <label><span>Shipper &amp; commodity</span><input value={m.shipping} onChange={setMeta('shipping')} /></label>
        <label><span>Driver (signature)</span><input value={m.driver} onChange={setMeta('driver')} /></label>
        <label><span>Co-driver</span><input value={m.codriver} onChange={setMeta('codriver')} /></label>
      </details>

      <button className="primary" disabled={loading}>
        {loading ? <><span className="spinner" /> {step ?? 'Planning route…'}</> : 'Plan trip & generate logs'}
      </button>
    </form>
  )
}
