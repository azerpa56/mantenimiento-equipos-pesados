import { useEffect, useMemo, useState } from 'react'
import { Gauge, Save, Trash2 } from 'lucide-react'
import type { Equipo } from '@shared/dominio'
import { ApiError, api } from '../lib/api'
import { fecha as fFecha, hoy, num } from '../lib/formato'
import { useCarga } from '../lib/hooks'
import { toast } from '../components/Toasts'
import { Boton, Buscador, Campo, Cargando, Encabezado, Entrada, Pestanas, Selector, Tabla, Tarjeta, Vacio, cx, td, th } from '../components/ui'

type Pestana = 'parte' | 'historial'

export function Horometros() {
  const [pestana, setPestana] = useState<Pestana>('parte')
  return (
    <>
      <Encabezado titulo="Horómetros" subtitulo="Control de uso diario de la flota" />
      <Pestanas<Pestana>
        activa={pestana}
        onChange={setPestana}
        items={[
          { id: 'parte', etiqueta: 'Parte diario' },
          { id: 'historial', etiqueta: 'Historial' }
        ]}
      />
      {pestana === 'parte' ? <ParteDiario /> : <Historial />}
    </>
  )
}

type Fila = { inicial: string; final: string; frente_id: string; actividad: string; operador: string }

function ParteDiario() {
  const [dia, setDia] = useState(hoy())
  const [filtro, setFiltro] = useState('')
  const [filas, setFilas] = useState<Record<number, Fila>>({})
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [guardando, setGuardando] = useState(false)
  const { data: frentes } = useCarga(() => api.frentes.listar(), [])
  const { data, cargando, recargar } = useCarga(() => api.horometros.parteDiario(dia), [dia])

  useEffect(() => {
    if (!data) return
    const r: Record<number, Fila> = {}
    for (const e of data.equipos)
      r[e.id] = { inicial: String(e.horometro_actual), final: '', frente_id: e.frente_actual_id?.toString() ?? '', actividad: '', operador: '' }
    setFilas(r)
    setErrores({})
  }, [data])

  const registradas = useMemo(() => {
    const m = new Map<number, number>()
    for (const r of data?.registros ?? []) m.set(r.equipo_id, (m.get(r.equipo_id) ?? 0) + r.horas_trabajadas)
    return m
  }, [data])

  const equipos = (data?.equipos ?? []).filter((e) => !filtro || `${e.codigo_interno} ${e.marca} ${e.modelo}`.toLowerCase().includes(filtro.toLowerCase()))
  const conLectura = Object.entries(filas).filter(([, f]) => f.final.trim() !== '')
  const set = (id: number, k: keyof Fila, v: string) => setFilas((p) => ({ ...p, [id]: { ...p[id], [k]: v } }))
  const errorDe = (e: Equipo, k: string) => errores[`${e.id}.${k}`]

  async function guardar() {
    const ids = conLectura.map(([id]) => Number(id))
    const items = conLectura.map(([id, f]) => ({
      equipo_id: Number(id),
      fecha: dia,
      horometro_inicial: f.inicial,
      horometro_final: f.final,
      frente_id: f.frente_id,
      actividad: f.actividad,
      operador: f.operador
    }))
    setGuardando(true)
    try {
      const n = await api.horometros.registrarLote(items)
      toast.ok(`${n} lectura(s) registradas`)
      recargar()
    } catch (e) {
      // Los errores llegan como "indice.campo": se re-indexan por equipo.
      if (e instanceof ApiError && e.campos) {
        const r: Record<string, string> = {}
        for (const [k, v] of Object.entries(e.campos)) {
          const [i, campo] = k.split('.')
          r[`${ids[Number(i)]}.${campo}`] = v
        }
        setErrores(r)
      }
      toast.error((e as Error).message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Tarjeta sinPadding>
      <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 p-4">
        <Campo etiqueta="Fecha">
          <Entrada type="date" max={hoy()} value={dia} onChange={(e) => setDia(e.target.value)} className="w-44" />
        </Campo>
        <Campo etiqueta="Filtrar equipos">
          <Entrada value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Código, marca o modelo" className="w-64" />
        </Campo>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-slate-500">{conLectura.length} lectura(s) por registrar</span>
          <Boton variante="primario" icono={Save} cargando={guardando} disabled={!conLectura.length} onClick={guardar}>
            Registrar parte
          </Boton>
        </div>
      </div>
      {cargando && !data ? (
        <Cargando />
      ) : !equipos.length ? (
        <Vacio icono={Gauge} titulo="No hay equipos activos" />
      ) : (
        <Tabla>
          <thead>
            <tr>
              <th className={th}>Equipo</th>
              <th className={`${th} text-right`}>Registrado hoy</th>
              <th className={`${th} w-32`}>Inicial</th>
              <th className={`${th} w-32`}>Final</th>
              <th className={`${th} w-20 text-right`}>Horas</th>
              <th className={`${th} w-48`}>Frente</th>
              <th className={th}>Actividad</th>
              <th className={`${th} w-44`}>Operador</th>
            </tr>
          </thead>
          <tbody>
            {equipos.map((e) => {
              const f = filas[e.id]
              if (!f) return null
              const horas = f.final ? Number(f.final) - Number(f.inicial) : null
              const err = errorDe(e, 'horometro_inicial') || errorDe(e, 'horometro_final') || errorDe(e, 'frente_id') || errorDe(e, 'fecha')
              return (
                <tr key={e.id} className={cx(f.final && 'bg-amber-50/40')}>
                  <td className={td}>
                    <div className="font-semibold">{e.codigo_interno}</div>
                    <div className="text-xs text-slate-500">{e.marca} {e.modelo}</div>
                    {err && <div className="mt-1 max-w-sm text-xs text-red-600">{err}</div>}
                  </td>
                  <td className={`${td} text-right text-xs tabular-nums text-slate-500`}>{registradas.has(e.id) ? `${num(registradas.get(e.id))} h` : ''}</td>
                  <td className={td}>
                    <Entrada type="number" step="0.1" value={f.inicial} invalido={!!errorDe(e, 'horometro_inicial')} onChange={(x) => set(e.id, 'inicial', x.target.value)} />
                  </td>
                  <td className={td}>
                    <Entrada type="number" step="0.1" value={f.final} invalido={!!errorDe(e, 'horometro_final')} onChange={(x) => set(e.id, 'final', x.target.value)} placeholder="—" />
                  </td>
                  <td className={cx(td, 'text-right font-medium tabular-nums', horas != null && (horas < 0 || horas > 24) && 'text-red-600')}>
                    {horas != null && !Number.isNaN(horas) ? num(horas) : ''}
                  </td>
                  <td className={td}>
                    <Selector value={f.frente_id} onChange={(x) => set(e.id, 'frente_id', x.target.value)}>
                      <option value="">—</option>
                      {frentes?.filter((x) => x.activo).map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.nombre}
                        </option>
                      ))}
                    </Selector>
                  </td>
                  <td className={td}>
                    <Entrada value={f.actividad} onChange={(x) => set(e.id, 'actividad', x.target.value)} placeholder="Excavación, acarreo…" />
                  </td>
                  <td className={td}>
                    <Entrada value={f.operador} onChange={(x) => set(e.id, 'operador', x.target.value)} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </Tabla>
      )}
    </Tarjeta>
  )
}

function Historial() {
  const [equipoId, setEquipoId] = useState<number | ''>('')
  const [frenteId, setFrenteId] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const { data: equipos } = useCarga(() => api.equipos.listar(), [])
  const { data: frentes } = useCarga(() => api.frentes.listar(), [])
  const { data, cargando, recargar } = useCarga(
    () => api.horometros.listar({ equipo_id: equipoId || undefined, frente_id: Number(frenteId) || undefined, desde: desde || undefined, hasta: hasta || undefined }),
    [equipoId, frenteId, desde, hasta]
  )
  const total = (data ?? []).reduce((a, r) => a + r.horas_trabajadas, 0)

  async function eliminar(id: number) {
    if (!confirm('¿Eliminar esta lectura?')) return
    try {
      await api.horometros.eliminar(id)
      toast.ok('Lectura eliminada')
      recargar()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <Tarjeta sinPadding>
      <div className="grid grid-cols-4 gap-3 border-b border-slate-100 p-4">
        <Campo etiqueta="Equipo">
          <Buscador
            opciones={(equipos ?? []).map((e) => ({ valor: e.id, etiqueta: e.codigo_interno, detalle: `${e.marca} ${e.modelo}` }))}
            valor={equipoId}
            onChange={setEquipoId}
            placeholder="Todos"
          />
        </Campo>
        <Campo etiqueta="Frente">
          <Selector value={frenteId} onChange={(e) => setFrenteId(e.target.value)}>
            <option value="">Todos</option>
            {frentes?.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nombre}
              </option>
            ))}
          </Selector>
        </Campo>
        <Campo etiqueta="Desde">
          <Entrada type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </Campo>
        <Campo etiqueta="Hasta">
          <Entrada type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </Campo>
      </div>
      {cargando && !data ? (
        <Cargando />
      ) : !data?.length ? (
        <Vacio icono={Gauge} titulo="Sin lecturas" />
      ) : (
        <Tabla>
          <thead>
            <tr>
              <th className={th}>Fecha</th>
              <th className={th}>Equipo</th>
              <th className={`${th} text-right`}>Inicial</th>
              <th className={`${th} text-right`}>Final</th>
              <th className={`${th} text-right`}>Horas</th>
              <th className={th}>Frente</th>
              <th className={th}>Actividad</th>
              <th className={th}>Operador</th>
              <th className={th}></th>
            </tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.id} className="group">
                <td className={`${td} whitespace-nowrap`}>{fFecha(r.fecha)}</td>
                <td className={`${td} font-medium`}>{r.equipo_codigo}</td>
                <td className={`${td} text-right tabular-nums`}>{num(r.horometro_inicial)}</td>
                <td className={`${td} text-right tabular-nums`}>{num(r.horometro_final)}</td>
                <td className={`${td} text-right font-medium tabular-nums`}>{num(r.horas_trabajadas)}</td>
                <td className={td}>{r.frente ?? '—'}</td>
                <td className={td}>{r.actividad ?? '—'}</td>
                <td className={td}>{r.operador ?? '—'}</td>
                <td className={`${td} w-10`}>
                  <button className="invisible text-slate-400 group-hover:visible hover:text-red-600" title="Eliminar" onClick={() => eliminar(r.id)}>
                    <Trash2 className="size-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="px-3 py-2.5 text-sm font-semibold" colSpan={4}>
                Total ({data.length} registros)
              </td>
              <td className="px-3 py-2.5 text-right text-sm font-semibold tabular-nums">{num(total)} h</td>
              <td colSpan={4} />
            </tr>
          </tfoot>
        </Tabla>
      )}
    </Tarjeta>
  )
}
