import { Link, useNavigate } from 'react-router-dom'
import { Ban, ClipboardList, PackageSearch, Plus, Timer, Truck, Wrench } from 'lucide-react'
import { FASE_INFO, FASES } from '@shared/dominio'
import { api } from '../lib/api'
import { dinero, duracion, fechaHora } from '../lib/formato'
import { useCarga } from '../lib/hooks'
import { FaseInsignia, PrioridadInsignia, TipoInsignia } from '../components/insignias'
import { BotonLink, Cargando, Encabezado, Indicador, Tabla, Tarjeta, Vacio, td, th } from '../components/ui'

export function Panel() {
  const { data: d, error } = useCarga(() => api.metricas.dashboard(), [])
  const nav = useNavigate()
  if (error) return <p className="text-red-600">{error}</p>
  if (!d) return <Cargando />

  const enTaller = d.equipos_por_estado.en_mantenimiento + d.equipos_por_estado.en_reparacion
  const disponibilidad = d.total_equipos ? (d.equipos_por_estado.operativo / d.total_equipos) * 100 : 0
  const abiertas = Object.values(d.ordenes_por_fase).reduce((a, b) => a + b, 0)

  return (
    <>
      <Encabezado
        titulo="Panel de taller"
        subtitulo={new Date().toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        acciones={
          <BotonLink to="/ordenes/nueva" variante="primario" icono={Plus}>
            Nueva orden
          </BotonLink>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Indicador etiqueta="Flota operativa" valor={`${disponibilidad.toFixed(0)} %`} detalle={`${d.equipos_por_estado.operativo} de ${d.total_equipos} equipos`} icono={Truck} tono="verde" />
        <Indicador etiqueta="Equipos en taller" valor={enTaller} detalle={`${d.equipos_por_estado.en_reparacion} reparación · ${d.equipos_por_estado.en_mantenimiento} mantenimiento`} icono={Wrench} tono="naranja" />
        <Indicador etiqueta="Fuera de servicio" valor={d.equipos_por_estado.fuera_servicio} icono={Ban} tono="rojo" />
        <Indicador etiqueta="Órdenes abiertas" valor={abiertas} detalle={`${d.ultimos_30.ordenes} abiertas en 30 días`} icono={ClipboardList} tono="ambar" />
        <Indicador etiqueta="Repuestos pendientes" valor={d.repuestos_pendientes} detalle="Sin aprobar o sin recibir" icono={PackageSearch} tono="azul" />
      </div>

      {/* Embudo de fases */}
      <Tarjeta titulo="Órdenes abiertas por fase" className="mt-6">
        <div className="grid grid-cols-7 gap-2">
          {FASES.map((f) => (
            <button
              key={f}
              onClick={() => nav(`/ordenes?fase=${f}`)}
              className="group rounded-lg border border-slate-200 p-3 text-left transition-colors hover:border-amber-400 hover:bg-amber-50"
            >
              <div className="text-[11px] font-medium text-slate-400">FASE {FASE_INFO[f].n}</div>
              <div className="truncate text-sm font-medium text-slate-700">{FASE_INFO[f].corto}</div>
              <div className={`mt-1 text-2xl font-semibold tabular-nums ${d.ordenes_por_fase[f] ? 'text-slate-900' : 'text-slate-300'}`}>{d.ordenes_por_fase[f]}</div>
            </button>
          ))}
        </div>
      </Tarjeta>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Tarjeta titulo="Órdenes abiertas (por prioridad)" className="xl:col-span-2" sinPadding acciones={<Link to="/ordenes" className="text-xs font-medium text-amber-700 hover:underline">Ver todas</Link>}>
          {d.ordenes_abiertas.length === 0 ? (
            <Vacio icono={ClipboardList} titulo="No hay órdenes abiertas" texto="Toda la flota está liberada." />
          ) : (
            <Tabla>
              <thead>
                <tr>
                  <th className={th}>Folio</th>
                  <th className={th}>Equipo</th>
                  <th className={th}>Tipo</th>
                  <th className={th}>Prioridad</th>
                  <th className={th}>Fase</th>
                  <th className={th}>En taller</th>
                </tr>
              </thead>
              <tbody>
                {d.ordenes_abiertas.map((o) => (
                  <tr key={o.id} className="cursor-pointer hover:bg-slate-50" onClick={() => nav(`/ordenes/${o.id}`)}>
                    <td className={`${td} font-medium whitespace-nowrap`}>{o.folio}</td>
                    <td className={td}>
                      <div className="font-medium">{o.equipo_codigo}</div>
                      <div className="text-xs text-slate-500">{o.equipo_descripcion}</div>
                    </td>
                    <td className={td}><TipoInsignia v={o.tipo} /></td>
                    <td className={td}><PrioridadInsignia v={o.prioridad} /></td>
                    <td className={td}><FaseInsignia fase={o.fase_actual} estado={o.estado} /></td>
                    <td className={`${td} text-xs whitespace-nowrap text-slate-600`} title={`Desde ${fechaHora(o.fecha_apertura)}`}>
                      {duracion(o.downtime_horas || (Date.now() - new Date(o.fecha_apertura).getTime()) / 3_600_000)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
        </Tarjeta>

        <div className="space-y-6">
          <Tarjeta titulo="Últimos 30 días">
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-xs text-slate-500">Órdenes abiertas</dt>
                <dd className="text-xl font-semibold tabular-nums">{d.ultimos_30.ordenes}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Liberadas</dt>
                <dd className="text-xl font-semibold tabular-nums">{d.ultimos_30.cerradas}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Downtime</dt>
                <dd className="text-xl font-semibold tabular-nums">{duracion(d.ultimos_30.downtime_horas)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Costo</dt>
                <dd className="text-xl font-semibold tabular-nums">{dinero(d.ultimos_30.costo)}</dd>
              </div>
            </dl>
          </Tarjeta>
          <Tarjeta titulo="Mayor tiempo de inactividad" sinPadding>
            {d.top_downtime.length === 0 ? (
              <Vacio icono={Timer} titulo="Sin inactividad registrada" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {d.top_downtime.map((e) => (
                  <li key={e.equipo_id}>
                    <Link to={`/equipos/${e.equipo_id}`} className="flex items-center justify-between px-5 py-2.5 hover:bg-slate-50">
                      <div>
                        <div className="text-sm font-medium">{e.codigo}</div>
                        <div className="text-xs text-slate-500">{e.descripcion} · {e.fallas} falla(s)</div>
                      </div>
                      <span className="text-sm font-semibold tabular-nums">{duracion(e.downtime_horas)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>
        </div>
      </div>
    </>
  )
}
