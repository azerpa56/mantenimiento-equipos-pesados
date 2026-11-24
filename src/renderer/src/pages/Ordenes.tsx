import { useNavigate, useSearchParams } from 'react-router-dom'
import { ClipboardList, Plus, Search } from 'lucide-react'
import { ETIQUETA_TIPO_OT, FASE_INFO, FASES, TIPOS_OT } from '@shared/dominio'
import { api } from '../lib/api'
import { dinero, duracion, fechaHora } from '../lib/formato'
import { useCarga } from '../lib/hooks'
import { EstadoOrdenInsignia, FaseInsignia, PrioridadInsignia, TipoInsignia } from '../components/insignias'
import { BotonLink, Cargando, Encabezado, Entrada, Selector, Tabla, Tarjeta, Vacio, td, th } from '../components/ui'

export function Ordenes() {
  const [q, setQ] = useSearchParams({ estado: 'abierta' })
  const nav = useNavigate()
  const estado = q.get('estado') ?? ''
  const fase = q.get('fase') ?? ''
  const tipo = q.get('tipo') ?? ''
  const texto = q.get('texto') ?? ''
  const flota = q.get('flota') ?? ''
  const set = (k: string, v: string) =>
    setQ((p) => {
      const n = new URLSearchParams(p)
      if (v) n.set(k, v)
      else n.delete(k)
      if (k === 'estado' && !v) n.set('estado', '')
      return n
    }, { replace: true })

  const { data, cargando } = useCarga(
    () =>
      api.ordenes.listar({
        estado: estado || undefined,
        fase: fase || undefined,
        tipo: tipo || undefined,
        texto: texto.trim() || undefined,
        flota: flota || undefined
      }),
    [estado, fase, tipo, texto, flota]
  )

  return (
    <>
      <Encabezado
        titulo="Órdenes de trabajo"
        subtitulo="Mantenimientos y reparaciones"
        acciones={
          <BotonLink to="/ordenes/nueva" variante="primario" icono={Plus}>
            Nueva orden
          </BotonLink>
        }
      />
      <Tarjeta sinPadding>
        <div className="flex flex-wrap gap-3 border-b border-slate-100 p-4">
          <div className="relative w-72">
            <Search className="absolute top-2.5 left-3 size-4 text-slate-400" />
            <Entrada className="pl-9" placeholder="Folio, equipo o motivo" value={texto} onChange={(e) => set('texto', e.target.value)} />
          </div>
          <div className="w-40">
            <Selector value={estado} onChange={(e) => set('estado', e.target.value)}>
              <option value="">Todas</option>
              <option value="abierta">Abiertas</option>
              <option value="cerrada">Cerradas</option>
              <option value="cancelada">Canceladas</option>
            </Selector>
          </div>
          <div className="w-52">
            <Selector value={fase} onChange={(e) => set('fase', e.target.value)}>
              <option value="">Todas las fases</option>
              {FASES.map((f) => (
                <option key={f} value={f}>
                  {FASE_INFO[f].n}. {FASE_INFO[f].corto}
                </option>
              ))}
            </Selector>
          </div>
          <div className="w-44">
            <Selector value={flota} onChange={(e) => set('flota', e.target.value)}>
              <option value="">Toda la flota</option>
              <option value="liviana">Flota liviana</option>
              <option value="pesada">Flota pesada</option>
            </Selector>
          </div>
          <div className="w-44">
            <Selector value={tipo} onChange={(e) => set('tipo', e.target.value)}>
              <option value="">Todos los tipos</option>
              {TIPOS_OT.map((t) => (
                <option key={t} value={t}>
                  {ETIQUETA_TIPO_OT[t]}
                </option>
              ))}
            </Selector>
          </div>
        </div>
        {cargando && !data ? (
          <Cargando />
        ) : !data?.length ? (
          <Vacio icono={ClipboardList} titulo="No hay órdenes con estos filtros" accion={<BotonLink to="/ordenes/nueva" variante="primario" icono={Plus}>Nueva orden</BotonLink>} />
        ) : (
          <Tabla>
            <thead>
              <tr>
                <th className={th}>Folio</th>
                <th className={th}>Equipo</th>
                <th className={th}>Tipo</th>
                <th className={th}>Prioridad</th>
                <th className={th}>Motivo</th>
                <th className={th}>Fase</th>
                <th className={th}>Responsable</th>
                <th className={th}>Apertura</th>
                <th className={`${th} text-right`}>Downtime</th>
                <th className={`${th} text-right`}>Costo</th>
              </tr>
            </thead>
            <tbody>
              {data.map((o) => (
                <tr key={o.id} className="cursor-pointer hover:bg-slate-50" onClick={() => nav(`/ordenes/${o.id}`)}>
                  <td className={`${td} font-semibold whitespace-nowrap`}>{o.folio}</td>
                  <td className={td}>
                    <div className="font-medium">{o.equipo_codigo}</div>
                    <div className="text-xs text-slate-500">{o.equipo_descripcion}</div>
                  </td>
                  <td className={td}><TipoInsignia v={o.tipo} /></td>
                  <td className={td}><PrioridadInsignia v={o.prioridad} /></td>
                  <td className={`${td} max-w-64 truncate`} title={o.descripcion}>{o.descripcion}</td>
                  <td className={td}>{o.estado === 'abierta' ? <FaseInsignia fase={o.fase_actual} estado={o.estado} /> : <EstadoOrdenInsignia v={o.estado} />}</td>
                  <td className={`${td} text-slate-600`}>{o.responsable_actual ?? '—'}</td>
                  <td className={`${td} whitespace-nowrap text-slate-600`}>{fechaHora(o.fecha_apertura)}</td>
                  <td className={`${td} text-right tabular-nums`}>{o.equipo_detenido ? duracion(o.downtime_horas) : '—'}</td>
                  <td className={`${td} text-right tabular-nums`}>{dinero(o.costo_total)}</td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </Tarjeta>
    </>
  )
}
