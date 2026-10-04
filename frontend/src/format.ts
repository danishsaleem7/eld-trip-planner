export const pad = (n: number) => String(n).padStart(2, '0')

/** minutes-of-day -> "HH:MM" (1440 renders as 24:00) */
export function hm(min: number): string {
  const m = Math.round(min)
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
}

export function hoursLabel(h: number): string {
  const whole = Math.floor(h)
  const m = Math.round((h - whole) * 60)
  return m === 0 ? `${whole}h` : whole === 0 ? `${m}m` : `${whole}h ${m}m`
}

/** Absolute trip minute (from midnight of start date) -> readable local date/time */
export function stamp(startDate: string, minute: number): string {
  const d = new Date(`${startDate}T00:00:00`)
  d.setMinutes(d.getMinutes() + Math.round(minute))
  return d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export const KIND_META: Record<string, { label: string; color: string; icon: string }> = {
  start: { label: 'Start', color: '#2563eb', icon: 'S' },
  pickup: { label: 'Pickup', color: '#16a34a', icon: 'P' },
  dropoff: { label: 'Drop-off', color: '#dc2626', icon: 'D' },
  fuel: { label: 'Fuel stop', color: '#f59e0b', icon: '⛽' },
  rest: { label: '10-hr rest', color: '#7c3aed', icon: '☾' },
  restart: { label: '34-hr restart', color: '#be185d', icon: '⟳' },
  break: { label: '30-min break', color: '#0891b2', icon: '☕' },
}
