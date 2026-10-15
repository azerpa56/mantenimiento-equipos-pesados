import { useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ChevronDown, Loader2, X, type LucideIcon } from 'lucide-react'

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

// ---------- Botón ----------
const VARIANTES = {
  primario: 'bg-amber-500 text-slate-950 hover:bg-amber-400 border-amber-500 shadow-sm',
  oscuro: 'bg-slate-800 text-white hover:bg-slate-700 border-slate-800 shadow-sm',
  secundario: 'bg-white text-slate-700 hover:bg-slate-50 border-slate-300 shadow-sm',
  peligro: 'bg-white text-red-700 hover:bg-red-50 border-red-300',
  fantasma: 'bg-transparent text-slate-600 hover:bg-slate-200/60 border-transparent'
}

export function Boton({
  variante = 'secundario',
  tamano = 'md',
  icono: Icono,
  cargando,
  children,
  className,
  disabled,
  ...p
}: ComponentProps<'button'> & { variante?: keyof typeof VARIANTES; tamano?: 'sm' | 'md'; icono?: LucideIcon; cargando?: boolean }) {
  return (
    <button
      type="button"
      {...p}
      disabled={disabled || cargando}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        tamano === 'sm' ? 'h-8 px-2.5 text-xs' : 'h-9 px-3.5 text-sm',
        VARIANTES[variante],
        className
      )}
    >
      {cargando ? <Loader2 className="size-4 animate-spin" /> : Icono && <Icono className="size-4" />}
      {children}
    </button>
  )
}

export function BotonLink({ to, icono: Icono, children, variante = 'secundario' }: { to: string; icono?: LucideIcon; children: ReactNode; variante?: keyof typeof VARIANTES }) {
  return (
    <Link to={to} className={cx('inline-flex h-9 items-center gap-1.5 rounded-lg border px-3.5 text-sm font-medium transition-colors', VARIANTES[variante])}>
      {Icono && <Icono className="size-4" />}
      {children}
    </Link>
  )
}

// ---------- Contenedores ----------
export function Tarjeta({ titulo, acciones, children, className, sinPadding }: { titulo?: ReactNode; acciones?: ReactNode; children: ReactNode; className?: string; sinPadding?: boolean }) {
  return (
    <section className={cx('rounded-xl border border-slate-200 bg-white shadow-sm', className)}>
      {(titulo || acciones) && (
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-900">{titulo}</h2>
          <div className="flex items-center gap-2">{acciones}</div>
        </header>
      )}
      <div className={sinPadding ? '' : 'p-5'}>{children}</div>
    </section>
  )
}

export function Encabezado({ titulo, subtitulo, acciones, volver }: { titulo: ReactNode; subtitulo?: ReactNode; acciones?: ReactNode; volver?: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {volver && (
          <Link to={volver} className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800">
            <ArrowLeft className="size-3.5" /> Volver
          </Link>
        )}
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{titulo}</h1>
        {subtitulo && <div className="mt-1 text-sm text-slate-500">{subtitulo}</div>}
      </div>
      {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
    </div>
  )
}

// ---------- Formularios ----------
export function Campo({ etiqueta, error, ayuda, requerido, children, className }: { etiqueta: ReactNode; error?: string; ayuda?: ReactNode; requerido?: boolean; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1 block text-xs font-medium text-slate-600">
        {etiqueta}
        {requerido && <span className="ml-0.5 text-red-500">*</span>}
      </span>
      {children}
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : ayuda && <span className="mt-1 block text-xs text-slate-400">{ayuda}</span>}
    </label>
  )
}

const base =
  'w-full rounded-lg border bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 disabled:bg-slate-50 disabled:text-slate-500'
const borde = (inv?: boolean) => (inv ? 'border-red-400 focus:ring-red-200' : 'border-slate-300 focus:border-amber-500 focus:ring-amber-200')

export function Entrada({ invalido, className, ...p }: ComponentProps<'input'> & { invalido?: boolean }) {
  return <input {...p} className={cx(base, 'h-9', borde(invalido), className)} />
}

export function Selector({ invalido, className, children, ...p }: ComponentProps<'select'> & { invalido?: boolean }) {
  return (
    <div className="relative">
      <select {...p} className={cx(base, 'h-9 appearance-none pr-8', borde(invalido), className)}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-2.5 right-2.5 size-4 text-slate-400" />
    </div>
  )
}

export function AreaTexto({ invalido, className, ...p }: ComponentProps<'textarea'> & { invalido?: boolean }) {
  return <textarea rows={3} {...p} className={cx(base, 'py-2', borde(invalido), className)} />
}

export function Interruptor({ activo, onChange, etiqueta, ayuda }: { activo: boolean; onChange: (v: boolean) => void; etiqueta: ReactNode; ayuda?: ReactNode }) {
  return (
    <button type="button" onClick={() => onChange(!activo)} className="flex items-start gap-3 text-left">
      <span className={cx('mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors', activo ? 'bg-amber-500' : 'bg-slate-300')}>
        <span className={cx('size-4 rounded-full bg-white shadow transition-transform', activo && 'translate-x-4')} />
      </span>
      <span>
        <span className="block text-sm font-medium text-slate-800">{etiqueta}</span>
        {ayuda && <span className="block text-xs text-slate-500">{ayuda}</span>}
      </span>
    </button>
  )
}

/** Grupo de opciones tipo "segmented control". */
export function Segmentos<T extends string>({ opciones, valor, onChange, invalido }: { opciones: { valor: T; etiqueta: ReactNode; clase?: string }[]; valor: T | ''; onChange: (v: T) => void; invalido?: boolean }) {
  return (
    <div className={cx('grid gap-1 rounded-lg border bg-slate-50 p-1', invalido ? 'border-red-400' : 'border-slate-300')} style={{ gridTemplateColumns: `repeat(${opciones.length}, minmax(0, 1fr))` }}>
      {opciones.map((o) => (
        <button
          key={o.valor}
          type="button"
          onClick={() => onChange(o.valor)}
          className={cx(
            'h-8 rounded-md text-sm font-medium transition-colors',
            valor === o.valor ? cx('bg-white shadow-sm ring-1 ring-slate-200', o.clase ?? 'text-slate-900') : 'text-slate-500 hover:text-slate-800'
          )}
        >
          {o.etiqueta}
        </button>
      ))}
    </div>
  )
}

/** Selector con búsqueda para listas largas (equipos, repuestos). */
export function Buscador({
  opciones,
  valor,
  onChange,
  placeholder = 'Buscar…',
  invalido,
  vacio = 'Sin resultados'
}: {
  opciones: { valor: number; etiqueta: string; detalle?: string }[]
  valor: number | '' | null | undefined
  onChange: (v: number | '') => void
  placeholder?: string
  invalido?: boolean
  vacio?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const actual = opciones.find((o) => o.valor === valor)
  const filtradas = useMemo(() => {
    const t = texto.trim().toLowerCase()
    const r = t ? opciones.filter((o) => `${o.etiqueta} ${o.detalle ?? ''}`.toLowerCase().includes(t)) : opciones
    return r.slice(0, 80)
  }, [opciones, texto])

  useEffect(() => {
    const fuera = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setAbierto(false)
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [])

  return (
    <div ref={ref} className="relative">
      <input
        className={cx(base, 'h-9 pr-8', borde(invalido))}
        placeholder={actual ? undefined : placeholder}
        value={abierto ? texto : actual ? `${actual.etiqueta}${actual.detalle ? ` — ${actual.detalle}` : ''}` : ''}
        onFocus={() => {
          setTexto('')
          setAbierto(true)
        }}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && filtradas[0]) {
            e.preventDefault()
            onChange(filtradas[0].valor)
            setAbierto(false)
          }
          if (e.key === 'Escape') setAbierto(false)
        }}
      />
      {actual && !abierto ? (
        <button type="button" className="absolute top-2.5 right-2.5 text-slate-400 hover:text-slate-700" onClick={() => onChange('')}>
          <X className="size-4" />
        </button>
      ) : (
        <ChevronDown className="pointer-events-none absolute top-2.5 right-2.5 size-4 text-slate-400" />
      )}
      {abierto && (
        <ul className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {filtradas.length === 0 && <li className="px-3 py-2 text-sm text-slate-400">{vacio}</li>}
          {filtradas.map((o) => (
            <li key={o.valor}>
              <button
                type="button"
                className={cx('flex w-full flex-col px-3 py-1.5 text-left hover:bg-amber-50', o.valor === valor && 'bg-amber-50')}
                onClick={() => {
                  onChange(o.valor)
                  setAbierto(false)
                }}
              >
                <span className="text-sm font-medium text-slate-900">{o.etiqueta}</span>
                {o.detalle && <span className="text-xs text-slate-500">{o.detalle}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ---------- Estado / feedback ----------
export const TONOS = {
  gris: 'bg-slate-100 text-slate-700 ring-slate-200',
  verde: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  ambar: 'bg-amber-50 text-amber-800 ring-amber-200',
  naranja: 'bg-orange-50 text-orange-700 ring-orange-200',
  rojo: 'bg-red-50 text-red-700 ring-red-200',
  azul: 'bg-sky-50 text-sky-700 ring-sky-200',
  violeta: 'bg-violet-50 text-violet-700 ring-violet-200'
}
export type Tono = keyof typeof TONOS

export function Insignia({ tono = 'gris', children, punto }: { tono?: Tono; children: ReactNode; punto?: boolean }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset', TONOS[tono])}>
      {punto && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
      <Loader2 className="size-4 animate-spin" /> {texto}
    </div>
  )
}

export function Aviso({ tono = 'ambar', icono: Icono, children }: { tono?: Tono; icono?: LucideIcon; children: ReactNode }) {
  return (
    <div className={cx('flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm ring-1 ring-inset', TONOS[tono])}>
      {Icono && <Icono className="mt-0.5 size-4 shrink-0" />}
      <div className="min-w-0">{children}</div>
    </div>
  )
}

export function Vacio({ icono: Icono, titulo, texto, accion }: { icono: LucideIcon; titulo: string; texto?: ReactNode; accion?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 rounded-full bg-slate-100 p-3">
        <Icono className="size-6 text-slate-400" />
      </div>
      <p className="font-medium text-slate-800">{titulo}</p>
      {texto && <p className="mt-1 max-w-md text-sm text-slate-500">{texto}</p>}
      {accion && <div className="mt-4">{accion}</div>}
    </div>
  )
}

export function Dato({ etiqueta, children, className }: { etiqueta: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-xs text-slate-500">{etiqueta}</dt>
      <dd className="mt-0.5 text-sm font-medium text-slate-900">{children}</dd>
    </div>
  )
}

export function Indicador({ etiqueta, valor, detalle, icono: Icono, tono = 'gris' }: { etiqueta: string; valor: ReactNode; detalle?: ReactNode; icono?: LucideIcon; tono?: Tono }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500">{etiqueta}</span>
        {Icono && (
          <span className={cx('rounded-md p-1.5 ring-1 ring-inset', TONOS[tono])}>
            <Icono className="size-4" />
          </span>
        )}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">{valor}</div>
      {detalle && <div className="mt-0.5 text-xs text-slate-500">{detalle}</div>}
    </div>
  )
}

export function Pestanas<T extends string>({ items, activa, onChange }: { items: { id: T; etiqueta: string; cuenta?: number }[]; activa: T; onChange: (id: T) => void }) {
  return (
    <div className="mb-4 flex gap-1 border-b border-slate-200">
      {items.map((i) => (
        <button
          key={i.id}
          type="button"
          onClick={() => onChange(i.id)}
          className={cx(
            '-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
            activa === i.id ? 'border-amber-500 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'
          )}
        >
          {i.etiqueta}
          {i.cuenta != null && <span className="rounded-full bg-slate-100 px-1.5 text-xs text-slate-600">{i.cuenta}</span>}
        </button>
      ))}
    </div>
  )
}

// ---------- Tabla ----------
export function Tabla({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx('overflow-x-auto', className)}>
      <table className="w-full text-sm">{children}</table>
    </div>
  )
}
export const th = 'border-b border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase whitespace-nowrap'
export const td = 'border-b border-slate-100 px-3 py-2.5 align-top'

// ---------- Modal ----------
export function Modal({ abierto, titulo, subtitulo, onCerrar, children, pie, ancho = 'max-w-2xl' }: { abierto: boolean; titulo: ReactNode; subtitulo?: ReactNode; onCerrar: () => void; children: ReactNode; pie?: ReactNode; ancho?: string }) {
  useEffect(() => {
    if (!abierto) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [abierto, onCerrar])
  if (!abierto) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-6 pt-[8vh]" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className={cx('w-full rounded-xl bg-white shadow-2xl', ancho)}>
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{titulo}</h2>
            {subtitulo && <p className="mt-0.5 text-sm text-slate-500">{subtitulo}</p>}
          </div>
          <button type="button" onClick={onCerrar} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="size-5" />
          </button>
        </header>
        <div className="px-6 py-5">{children}</div>
        {pie && <footer className="flex justify-end gap-2 rounded-b-xl border-t border-slate-100 bg-slate-50 px-6 py-3">{pie}</footer>}
      </div>
    </div>
  )
}
