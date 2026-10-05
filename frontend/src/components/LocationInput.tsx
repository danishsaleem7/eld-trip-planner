import { useEffect, useId, useRef, useState } from 'react'
import type { Point } from '../types'

interface Suggestion {
  label: string
  point: Point
}

interface Props {
  label: string
  dot: 's' | 'p' | 'd'
  value: string
  placeholder: string
  onChange: (text: string, point: Point | null) => void
}

// Photon (by Komoot, built on OpenStreetMap) is a geocoder meant for search-as-you-type.
// The public Nominatim server forbids autocomplete, so it is only used for the final lookup on the server.
const PHOTON = 'https://photon.komoot.io/api/'

async function search(q: string, signal: AbortSignal): Promise<Suggestion[]> {
  const res = await fetch(`${PHOTON}?q=${encodeURIComponent(q)}&limit=6&lang=en`, { signal })
  if (!res.ok) return []
  const data = await res.json()
  const seen = new Set<string>()
  const out: Suggestion[] = []
  for (const f of data.features ?? []) {
    const p = f.properties ?? {}
    const parts = [p.name, p.city && p.city !== p.name ? p.city : null, p.state, p.country].filter(Boolean)
    const label = [...new Set(parts)].join(', ')
    if (!label || seen.has(label) || !f.geometry?.coordinates) continue
    seen.add(label)
    out.push({ label, point: { lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] } })
  }
  return out
}

export function LocationInput({ label, dot, value, placeholder, onChange }: Props) {
  const id = useId()
  const [items, setItems] = useState<Suggestion[]>([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [active, setActive] = useState(-1)
  const timer = useRef<number>(0)
  const abort = useRef<AbortController | null>(null)
  const picked = useRef(false)
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  useEffect(() => () => abort.current?.abort(), [])

  function type(text: string) {
    picked.current = false
    onChange(text, null)
    window.clearTimeout(timer.current)
    abort.current?.abort()
    if (text.trim().length < 3) {
      setItems([])
      setOpen(false)
      setBusy(false)
      return
    }
    setBusy(true)
    timer.current = window.setTimeout(async () => {
      const ctl = new AbortController()
      abort.current = ctl
      try {
        const res = await search(text.trim(), ctl.signal)
        setItems(res)
        setActive(-1)
        setOpen(!picked.current && res.length > 0)
      } catch {
        /* aborted or offline: the server can still geocode the typed text */
      } finally {
        if (abort.current === ctl) setBusy(false)
      }
    }, 350)
  }

  function pick(s: Suggestion) {
    picked.current = true
    window.clearTimeout(timer.current)
    abort.current?.abort()
    onChange(s.label, s.point)
    setOpen(false)
    setBusy(false)
  }

  function onKey(e: React.KeyboardEvent) {
    if (!open || items.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => (a + 1) % items.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => (a <= 0 ? items.length - 1 : a - 1))
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault()
      pick(items[active])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="field loc" ref={wrap}>
      <label htmlFor={id}>
        <i className={`dot ${dot}`} />
        {label}
      </label>
      <div className="loc-box">
        <input
          id={id}
          required
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          value={value}
          placeholder={placeholder}
          onChange={(e) => type(e.target.value)}
          onFocus={() => items.length > 0 && !picked.current && setOpen(true)}
          onKeyDown={onKey}
        />
        {busy && <span className="mini-spin" aria-hidden />}
      </div>
      {open && (
        <ul className="suggest" role="listbox">
          {items.map((s, i) => (
            <li key={s.label} role="option" aria-selected={i === active} className={i === active ? 'on' : ''}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(s)}>
                <span className="pin-ico">⌖</span>
                {s.label}
              </button>
            </li>
          ))}
          <li className="attrib">Suggestions by Photon · OpenStreetMap</li>
        </ul>
      )}
    </div>
  )
}
