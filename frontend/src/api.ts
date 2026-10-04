import type { Plan, TripInput } from './types'

export const API = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000'

export async function planTrip(input: TripInput): Promise<Plan> {
  let res: Response
  try {
    res = await fetch(`${API}/api/plan/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
  } catch {
    throw new Error('Cannot reach the server. If it is hosted on a free tier it may be waking up — try again in a minute.')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const first = typeof data === 'object' && data ? Object.values(data)[0] : null
    throw new Error(data.error ?? (Array.isArray(first) ? String(first[0]) : 'Something went wrong planning this trip.'))
  }
  return data as Plan
}

export async function reverseLabel(lat: number, lon: number): Promise<string | null> {
  try {
    const res = await fetch(`${API}/api/reverse/?lat=${lat}&lon=${lon}`)
    return res.ok ? ((await res.json()).label as string | null) : null
  } catch {
    return null
  }
}
