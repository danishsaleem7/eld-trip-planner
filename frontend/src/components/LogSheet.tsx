import type { DayLog, Meta, Segment, Status } from '../types'
import { hm } from '../format'

const ROWS: { status: Status; label: string; sub?: string }[] = [
  { status: 'OFF', label: '1. Off Duty' },
  { status: 'SB', label: '2. Sleeper', sub: 'Berth' },
  { status: 'D', label: '3. Driving' },
  { status: 'ON', label: '4. On Duty', sub: '(not driving)' },
]
const ROW_INDEX: Record<Status, number> = { OFF: 0, SB: 1, D: 2, ON: 3 }
const STATUS_NAME: Record<Status, string> = { OFF: 'Off duty', SB: 'Sleeper berth', D: 'Driving', ON: 'On duty' }

// Layout (SVG viewBox units)
const W = 850
const H = 940
const GX = 112
const GW = 600
const GY = 216
const RH = 30
const HOUR = GW / 24
const GB = GY + RH * 4 // grid bottom
const x = (min: number) => GX + (min / 60) * HOUR
const rowY = (i: number) => GY + i * RH + RH / 2
const FONT = 'Arial, Helvetica, sans-serif'

interface Props {
  day: DayLog
  meta: Meta
  from: string
  to: string
  labels: Record<number, string>
}

export function LogSheet({ day, meta, from, to, labels }: Props) {
  const [yy, mm, dd] = day.date.split('-')
  const segs = day.segments
  const place = (s: Segment) => (s.loc_id != null && labels[s.loc_id]) || s.location

  // Duty-status line: horizontal run per segment, vertical joins between rows.
  let path = ''
  segs.forEach((s, i) => {
    const y = rowY(ROW_INDEX[s.status])
    path += `${i === 0 ? 'M' : 'L'}${x(s.start)},${y}L${x(s.end)},${y}`
  })

  // A remark is required at every change of duty status (page 17 of the FMCSA guide).
  // Segments that merely carry over from the previous day, and midnight padding, are not changes.
  const remarks = segs.filter((s) => s.kind !== 'pad' && !s.continued)
  const hrs = (h: number) => (h === 0 ? '' : String(Math.round(h * 100) / 100))
  const total = Object.values(day.totals).reduce((a, b) => a + b, 0)
  const carried = segs[0]?.continued

  return (
    <svg className="log-sheet" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Driver's daily log for ${day.date}`}>
      <rect width={W} height={H} fill="#fff" />
      <g fontFamily={FONT} fill="#111">
        {/* ---------- Header ---------- */}
        <text x="24" y="34" fontSize="24" fontWeight="700">Drivers Daily Log</text>
        <text x="24" y="52" fontSize="10">(24 hours)</text>
        <g fontSize="15" textAnchor="middle" fontWeight="600">
          <text x="294" y="28">{mm}</text>
          <text x="380" y="28">{dd}</text>
          <text x="462" y="28">{yy}</text>
        </g>
        <g stroke="#111" strokeWidth="0.8">
          <line x1="262" y1="34" x2="326" y2="34" />
          <line x1="350" y1="34" x2="410" y2="34" />
          <line x1="434" y1="34" x2="490" y2="34" />
          <line x1="64" y1="80" x2="316" y2="80" />
          <line x1="346" y1="80" x2="500" y2="80" />
        </g>
        <g fontSize="8" textAnchor="middle">
          <text x="294" y="44">(month)</text>
          <text x="380" y="44">(day)</text>
          <text x="462" y="44">(year)</text>
        </g>
        <text x="560" y="22" fontSize="8">Original - File at home terminal.</text>
        <text x="560" y="34" fontSize="8">Duplicate - Driver retains in his/her possession for 8 days.</text>
        <text x="24" y="76" fontSize="11" fontWeight="700">From:</text>
        <text x="64" y="76" fontSize="11">{clip(from, 40)}</text>
        <text x="324" y="76" fontSize="11" fontWeight="700">To:</text>
        <text x="346" y="76" fontSize="11">{clip(to, 26)}</text>

        {/* Mileage boxes */}
        <g stroke="#111" strokeWidth="1" fill="none">
          <rect x="24" y="96" width="96" height="40" />
          <rect x="128" y="96" width="96" height="40" />
        </g>
        <g fontSize="17" fontWeight="700" textAnchor="middle">
          <text x="72" y="122">{Math.round(day.miles_driving)}</text>
          <text x="176" y="122">{Math.round(day.miles_driving)}</text>
        </g>
        <g fontSize="8" textAnchor="middle">
          <text x="72" y="148">Total Miles Driving Today</text>
          <text x="176" y="148">Total Mileage Today</text>
        </g>

        {/* Carrier block */}
        <g stroke="#111" strokeWidth="0.8">
          <line x1="250" y1="108" x2="826" y2="108" />
          <line x1="250" y1="132" x2="826" y2="132" />
          <line x1="250" y1="156" x2="826" y2="156" />
          <line x1="24" y1="170" x2="224" y2="170" />
        </g>
        <g fontSize="11">
          <text x="256" y="104">{clip(meta.carrier, 64)}</text>
          <text x="256" y="128">{clip(meta.office, 64)}</text>
          <text x="256" y="152">{clip(meta.office, 64)}</text>
          <text x="30" y="166">{clip(meta.vehicle, 30)}</text>
        </g>
        <g fontSize="8" textAnchor="middle">
          <text x="538" y="120">Name of Carrier or Carriers</text>
          <text x="538" y="144">Main Office Address</text>
          <text x="538" y="168">Home Terminal Address</text>
          <text x="124" y="181">Truck/Tractor and Trailer Numbers or</text>
          <text x="124" y="191">License Plate(s)/State (show each unit)</text>
        </g>

        {/* ---------- Grid labels ---------- */}
        <g fontSize="9" textAnchor="middle" fontWeight="600">
          {Array.from({ length: 23 }, (_, i) => i + 1).map((h) => (
            <text key={h} x={GX + h * HOUR} y={GY - 5}>{h === 12 ? 'Noon' : h % 12}</text>
          ))}
          {[0, 24].map((h) => (
            <g key={h}>
              <text x={GX + h * HOUR + (h === 0 ? -2 : 2)} y={GY - 15}>Mid-</text>
              <text x={GX + h * HOUR + (h === 0 ? -2 : 2)} y={GY - 5}>night</text>
            </g>
          ))}
        </g>
        <text x={GX + GW + 41} y={GY - 5} fontSize="8" textAnchor="middle">Total Hours</text>
      </g>

      {/* ---------- Grid ---------- */}
      <g fill="none" stroke="#111">
        {Array.from({ length: 24 * 4 + 1 }, (_, q) => {
          const hour = q % 4 === 0
          const half = q % 2 === 0
          const len = hour ? RH : half ? 13 : 8
          return ROWS.map((_, r) => (
            <line
              key={`${q}-${r}`}
              x1={GX + (q * HOUR) / 4}
              x2={GX + (q * HOUR) / 4}
              y1={GY + (r + 1) * RH - len}
              y2={GY + (r + 1) * RH}
              strokeWidth={hour ? 0.8 : 0.6}
              stroke={hour ? '#444' : '#666'}
            />
          ))
        })}
        {[1, 2, 3].map((r) => (
          <line key={r} x1={GX} x2={GX + GW} y1={GY + r * RH} y2={GY + r * RH} strokeWidth="1" />
        ))}
        <rect x={GX} y={GY} width={GW} height={RH * 4} strokeWidth="1.6" />
      </g>

      {/* Row labels + per-status totals */}
      <g fontFamily={FONT} fontSize="10" fill="#111">
        {ROWS.map((r, i) => (
          <g key={r.status}>
            <text x="24" y={GY + i * RH + (r.sub ? 14 : 19)}>{r.label}</text>
            {r.sub && <text x="24" y={GY + i * RH + 25} fontSize={r.sub.startsWith('(') ? 8 : 10}>{r.sub}</text>}
            <line x1={GX + GW + 10} x2={GX + GW + 74} y1={GY + (i + 1) * RH - 6} y2={GY + (i + 1) * RH - 6} stroke="#111" strokeWidth="0.8" />
            <text x={GX + GW + 42} y={GY + (i + 1) * RH - 9} textAnchor="middle" fontWeight="700">{hrs(day.totals[r.status])}</text>
          </g>
        ))}
        <text x={GX + GW + 42} y={GB + 16} textAnchor="middle" fontWeight="700" fontSize="11">= {Math.round(total)}</text>
      </g>

      {/* Duty-status line, drawn last so it sits over the ticks */}
      <path d={path} fill="none" stroke="#0b3d91" strokeWidth="2.8" strokeLinejoin="miter" strokeLinecap="butt" />

      {/* ---------- Remarks (angled labels under each change of duty status) ---------- */}
      <g fontFamily={FONT} fill="#111">
        <rect x="24" y={GB + 4} width="802" height="112" fill="none" stroke="#111" strokeWidth="1" />
        <text x="30" y={GB + 20} fontSize="12" fontWeight="700">Remarks</text>
        {carried && (
          <text x="30" y={GB + 36} fontSize="8" fill="#555">Carried over from previous day</text>
        )}
        {remarks.map((s, n) => (
          <g key={n}>
            <line x1={x(s.start)} x2={x(s.start)} y1={GB} y2={GB + 14} stroke="#0b3d91" strokeWidth="1.1" />
            {!(n > 0 && place(remarks[n - 1]) === place(s) && x(s.start) - x(remarks[n - 1].start) < 90) && (
              <text transform={`translate(${x(s.start) + 3},${GB + 22}) rotate(52)`} fontSize="9" fontWeight="600">
                {clip(place(s), 26)}
              </text>
            )}
          </g>
        ))}
        {remarks.length === 0 && (
          <text x="126" y={GB + 40} fontSize="9.5" fill="#555">
            No change of duty status today — continuing {segs.some((s) => s.status === 'SB') ? 'sleeper berth' : 'off-duty'} period.
          </text>
        )}
        <text x="425" y={GB + 130} fontSize="8" textAnchor="middle">
          Enter name of place you reported and where released from work and when and where each change of duty occurred.
        </text>
        <text x="425" y={GB + 141} fontSize="8" textAnchor="middle">Use time standard of home terminal.</text>

        {/* Duty-status change log (extra detail the paper form allows in Remarks) */}
        <text x="24" y={GB + 170} fontSize="11" fontWeight="700">Duty status changes</text>
        <line x1="24" y1={GB + 176} x2="826" y2={GB + 176} stroke="#999" strokeWidth="0.6" />
        {remarks.slice(0, 10).map((s, n) => (
          <g key={n} fontSize="9.5" transform={`translate(0,${GB + 191 + n * 15})`}>
            <text x="30" fontWeight="700">{hm(s.start)}</text>
            <text x="76" fill={s.status === 'D' ? '#0b3d91' : '#111'} fontWeight="600">{STATUS_NAME[s.status]}</text>
            <text x="170">{s.kind === 'drive' ? (s.event_id === 0 ? 'Depart' : 'Resume driving') : s.note}</text>
            <text x="430">{clip(place(s), 52)}</text>
          </g>
        ))}
        {remarks.length > 10 && (
          <text x="30" y={GB + 191 + 10 * 15} fontSize="9" fill="#555">+ {remarks.length - 10} more</text>
        )}

        {/* ---------- Shipping + certification ---------- */}
        <text x="24" y="704" fontSize="10" fontWeight="700">Shipping Documents:</text>
        <line x1="24" y1="732" x2="260" y2="732" stroke="#111" strokeWidth="0.8" />
        <text x="24" y="744" fontSize="8">DVL or Manifest No.</text>
        <text x="24" y="758" fontSize="8">or</text>
        <line x1="24" y1="784" x2="260" y2="784" stroke="#111" strokeWidth="0.8" />
        <text x="28" y="780" fontSize="10">{clip(meta.shipping, 40)}</text>
        <text x="24" y="796" fontSize="8">Shipper &amp; Commodity</text>

        <text x="320" y="704" fontSize="9">I certify that these entries are true and correct:</text>
        <line x1="320" y1="738" x2="826" y2="738" stroke="#111" strokeWidth="0.8" />
        <text x="326" y="733" fontSize="15" fontStyle="italic" fontFamily="'Brush Script MT', 'Segoe Script', cursive">{clip(meta.driver, 40)}</text>
        <text x="320" y="750" fontSize="8">Driver&apos;s signature in full</text>
        <line x1="320" y1="784" x2="826" y2="784" stroke="#111" strokeWidth="0.8" />
        <text x="326" y="780" fontSize="11">{clip(meta.codriver, 50)}</text>
        <text x="320" y="796" fontSize="8">Name of co-driver</text>

        {/* ---------- Recap ---------- */}
        <line x1="24" y1="822" x2="826" y2="822" stroke="#111" strokeWidth="1.2" />
        <text x="24" y="840" fontSize="9">Recap: Complete at</text>
        <text x="24" y="851" fontSize="9">end of day</text>
        <text x="150" y="840" fontSize="9" fontWeight="700">70 Hour / 8 Day Drivers</text>
        <g fontSize="9">
          <text x="64" y="878" textAnchor="middle" fontWeight="700" fontSize="12">{day.recap.on_duty_today.toFixed(1)}</text>
          <text x="64" y="890" textAnchor="middle">On duty hours today,</text>
          <text x="64" y="901" textAnchor="middle">total lines 3 &amp; 4</text>
          {(
            [
              ['A', day.recap.a_last_8_days, 'Total hours on duty last 8 days including today.'],
              ['B', day.recap.b_available_tomorrow, 'Total hours available tomorrow, 70 hr. minus A*'],
              ['C', day.recap.c_last_5_days, 'Total hours on duty last 5 days including today.'],
            ] as [string, number, string][]
          ).map(([k, v, t], i) => (
            <g key={k}>
              <text x={176 + i * 150} y="868" fontWeight="700">{k}.</text>
              <rect x={192 + i * 150} y="856" width="60" height="18" fill="none" stroke="#111" />
              <text x={222 + i * 150} y="869" textAnchor="middle" fontWeight="700">{v.toFixed(1)}</text>
              <foreignObject x={176 + i * 150} y="880" width="136" height="40">
                <div style={{ fontSize: 8.5, lineHeight: 1.25, fontFamily: 'Arial', color: '#111' }}>{t}</div>
              </foreignObject>
            </g>
          ))}
          <text x="640" y="840" fontSize="8">*If you took 34 consecutive hours off duty</text>
          <text x="640" y="851" fontSize="8">you have 60/70 hours available</text>
        </g>
        <text x="24" y="930" fontSize="7.5" fill="#777">
          Generated by ELD Trip Planner · Property-carrying driver, 70 hr / 8 day, no adverse conditions · Log day {day.day_index + 1}
        </text>
      </g>
    </svg>
  )
}

function clip(s: string | undefined, n: number) {
  const v = s ?? ''
  return v.length > n ? v.slice(0, n - 1) + '…' : v
}
