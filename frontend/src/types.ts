export type Status = 'OFF' | 'SB' | 'D' | 'ON'

export interface Point {
  lat: number
  lon: number
}

export interface TripInput {
  current_location: string
  pickup_location: string
  dropoff_location: string
  cycle_used_hours: number
  start_time: string
  current_point?: Point | null
  pickup_point?: Point | null
  dropoff_point?: Point | null
}

export interface Meta {
  carrier: string
  office: string
  vehicle: string
  shipping: string
  driver: string
  codriver: string
}

export interface Segment {
  status: Status
  start: number
  end: number
  kind: string
  note: string
  location: string
  event_id: number | null
  loc_id: number | null
  continued: boolean
}

export interface DayLog {
  day_index: number
  date: string
  segments: Segment[]
  totals: Record<Status, number>
  miles_driving: number
  recap: { on_duty_today: number; a_last_8_days: number; b_available_tomorrow: number; c_last_5_days: number }
}

export interface Stop {
  kind: 'pickup' | 'dropoff' | 'fuel' | 'rest' | 'break' | 'restart' | 'drive'
  label: string
  lat: number
  lon: number
  start: number
  end: number
  duration_min: number
  note: string
  mile: number
  event_id: number
  loc_id: number
  resolved: boolean
}

export interface Waypoint {
  kind: 'start' | 'pickup' | 'dropoff'
  label: string
  lat: number
  lon: number
}

export interface Plan {
  start_date: string
  start_minute: number
  route: { geometry: [number, number][]; pickup_index: number; total_miles: number; leg_miles: number[]; approximate: boolean }
  waypoints: Waypoint[]
  stops: Stop[]
  days: DayLog[]
  summary: { total_miles: number; driving_hours: number; trip_hours: number; days: number; fuel_stops: number; rests: number }
}
