// Inline SVG icons (24x24, stroke based) so markers look identical on every device — no emoji.
const PATHS: Record<string, string> = {
  start: '<path d="M3 11l19-9-9 19-2-8-8-2z"/>',
  pickup: '<path d="M12 19V5"/><path d="M5 12l7-7 7 7"/>',
  dropoff: '<path d="M4 22V4"/><path d="M4 4h14l-3 4 3 4H4"/>',
  fuel: '<path d="M3 22V5a2 2 0 012-2h7a2 2 0 012 2v17"/><path d="M2 22h13"/><path d="M6 8h5"/><path d="M14 10h2a2 2 0 012 2v3a2 2 0 004 0V9l-3-3"/>',
  rest: '<path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/>',
  restart: '<path d="M21 12a9 9 0 11-3-6.7"/><path d="M21 3v6h-6"/>',
  break: '<path d="M17 8h1a4 4 0 010 8h-1"/><path d="M3 8h14v9a4 4 0 01-4 4H7a4 4 0 01-4-4V8z"/><path d="M7 2v3M11 2v3M15 2v3"/>',
  truck: '<path d="M1 4h13v11H1z"/><path d="M14 8h4l4 4v3h-8"/><circle cx="6" cy="17.5" r="2"/><circle cx="17.5" cy="17.5" r="2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/>',
  print: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0116 0z"/><circle cx="12" cy="10" r="3"/>',
}

const svg = (name: string, size: number, stroke: string, sw: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] ?? ''}</svg>`

/** SVG markup string (used for Leaflet div icons). */
export const iconHtml = (name: string, size = 16, stroke = '#fff', sw = 2.2) => svg(name, size, stroke, sw)

export function Icon({ name, size = 16, sw = 2.2 }: { name: string; size?: number; sw?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: PATHS[name] ?? '' }} />
  )
}
