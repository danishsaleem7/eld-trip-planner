import type { Point, TripInput } from './types'

export type FieldKey = 'current' | 'pickup' | 'dropoff' | 'cycle' | 'start'
export type Errors = Partial<Record<FieldKey, string>>

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

function km(a: Point, b: Point) {
  const r = Math.PI / 180
  const h =
    Math.sin(((b.lat - a.lat) * r) / 2) ** 2 +
    Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2
  return 12742 * Math.asin(Math.sqrt(h))
}

/** Validate the form. `cycleText` is the raw text of the cycle-hours box. */
export function validate(t: TripInput, cycleText: string): Errors {
  const e: Errors = {}
  const places = [
    ['current', 'Enter your current location', t.current_location],
    ['pickup', 'Enter the pickup location', t.pickup_location],
    ['dropoff', 'Enter the drop-off location', t.dropoff_location],
  ] as const
  for (const [key, msg, v] of places) {
    if (v.trim().length < 2) e[key] = msg
    else if (v.length > 200) e[key] = 'That is too long — use a city or address'
  }

  // Pickup and drop-off must be different places.
  if (!e.pickup && !e.dropoff) {
    const same =
      norm(t.pickup_location) === norm(t.dropoff_location) ||
      (t.pickup_point && t.dropoff_point && km(t.pickup_point, t.dropoff_point) < 0.5)
    if (same) e.dropoff = 'Drop-off must be a different place from pickup'
  }

  const raw = cycleText.trim()
  const cycle = Number(raw)
  if (raw === '') e.cycle = 'Enter hours used (0 if none)'
  else if (!Number.isFinite(cycle)) e.cycle = 'Enter a number, e.g. 12.5'
  else if (cycle < 0 || cycle > 70) e.cycle = 'Must be between 0 and 70 hours'

  if (!t.start_time || Number.isNaN(new Date(t.start_time).getTime())) e.start = 'Pick a departure date and time'
  return e
}
