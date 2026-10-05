import type { FieldKey } from './validate'
import type { Plan, TripInput } from './types'

// Strip trailing slashes so "https://host/" and "https://host" both work.
export const API = ((import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000').replace(/\/+$/, '')

const TIMEOUT_MS = 90_000 // free hosting can take ~60s to wake up

export class ApiError extends Error {
  /** Per-field messages from the server, keyed like the form. */
  fields: Partial<Record<FieldKey, string>>
  /** True when trying again might help (network failure / timeout / 5xx). */
  retryable: boolean
  constructor(message: string, opts: { fields?: Partial<Record<FieldKey, string>>; retryable?: boolean } = {}) {
    super(message)
    this.fields = opts.fields ?? {}
    this.retryable = opts.retryable ?? false
  }
}

const SERVER_FIELD: Record<string, FieldKey> = {
  current_location: 'current',
  pickup_location: 'pickup',
  dropoff_location: 'dropoff',
  cycle_used_hours: 'cycle',
  start_time: 'start',
}

async function post(input: TripInput): Promise<Response> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  try {
    return await fetch(`${API}/api/plan/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: ctl.signal,
    })
  } finally {
    clearTimeout(timer)
  }
}

export async function planTrip(input: TripInput): Promise<Plan> {
  let res: Response
  try {
    try {
      res = await post(input)
    } catch {
      // One automatic retry: the first call often just wakes the sleeping server.
      await new Promise((r) => setTimeout(r, 3000))
      res = await post(input)
    }
  } catch (e) {
    const timedOut = e instanceof DOMException && e.name === 'AbortError'
    throw new ApiError(
      timedOut
        ? 'The server took too long to respond. It may still be waking up — please try again.'
        : 'Cannot reach the server. Check your connection, or try again in a moment if it is waking up.',
      { retryable: true },
    )
  }

  const data = await res.json().catch(() => ({}))
  if (res.ok) return data as Plan

  if (res.status >= 500) {
    throw new ApiError('The server hit a problem while planning this trip. Please try again.', { retryable: true })
  }
  const fields: Partial<Record<FieldKey, string>> = {}
  for (const [k, v] of Object.entries(data)) {
    const key = SERVER_FIELD[k]
    if (key) fields[key] = Array.isArray(v) ? String(v[0]) : String(v)
  }
  if (typeof data.error === 'string') {
    // Geocoding failures name the place; attach them to the matching field when we can.
    const lower = data.error.toLowerCase()
    for (const [name, key] of [['current', 'current'], ['pickup', 'pickup'], ['dropoff', 'dropoff']] as const) {
      const q = (input[`${name}_location` as keyof TripInput] as string).trim().toLowerCase()
      if (lower.includes(`'${q}'`)) fields[key] = 'We could not find this place. Try a nearby city or pick a suggestion.'
    }
    throw new ApiError(data.error, { fields })
  }
  throw new ApiError(
    Object.keys(fields).length ? 'Please fix the highlighted fields.' : 'Something went wrong planning this trip.',
    { fields },
  )
}

export async function reverseLabel(lat: number, lon: number): Promise<string | null> {
  try {
    const res = await fetch(`${API}/api/reverse/?lat=${lat}&lon=${lon}`)
    return res.ok ? ((await res.json()).label as string | null) : null
  } catch {
    return null
  }
}
