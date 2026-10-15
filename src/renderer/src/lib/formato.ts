const LOCALE = 'es-VE'

export function num(v: number | null | undefined, dec = 1): string {
  if (v == null || Number.isNaN(v)) return '—'
  return v.toLocaleString(LOCALE, { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

export function dinero(v: number | null | undefined): string {
  if (v == null) return '—'
  return `$ ${v.toLocaleString(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function fechaHora(d: Date | string | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleString(LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** 'YYYY-MM-DD' -> 'DD/MM/YYYY' sin pasar por Date (evita corrimiento de zona). */
export function fecha(s: string | Date | null | undefined): string {
  if (!s) return '—'
  if (s instanceof Date) return s.toLocaleDateString(LOCALE)
  const [y, m, d] = s.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

/** Horas -> "2 d 5 h", "5,5 h" o "40 min". */
export function duracion(horas: number | null | undefined): string {
  if (horas == null) return '—'
  if (horas < 1) return `${Math.round(horas * 60)} min`
  if (horas < 48) return `${num(horas, 1)} h`
  const d = Math.floor(horas / 24)
  const h = Math.round(horas - d * 24)
  return h ? `${d} d ${h} h` : `${d} d`
}

export function horasEntre(a: Date | string, b: Date | string | null): number {
  return ((b ? new Date(b) : new Date()).getTime() - new Date(a).getTime()) / 3_600_000
}

/** Date -> valor para <input type="datetime-local"> en hora local. */
export function aInputLocal(d: Date = new Date()): string {
  const p = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export function hoy(): string {
  return aInputLocal().slice(0, 10)
}
