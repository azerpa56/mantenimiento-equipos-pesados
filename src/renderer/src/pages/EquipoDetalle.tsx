import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Activity, Ban, CircleCheck, ClipboardList, Clock, DollarSign, Gauge, Pencil, Plus, Repeat, Timer, Trash2, Wrench } from 'lucide-react'
import { ETIQUETA_SISTEMA } from '@shared/dominio'
import { api } from '../lib/api'
import { dinero, duracion, fecha, fechaHora, num } from '../lib/formato'
import { useCarga } from '../lib/hooks'
import { toast } from '../components/Toasts'
import { EstadoEquipoInsignia, EstadoOrdenInsignia, FlotaInsignia, FaseInsignia, TipoInsignia } from '../components/insignias'
import { Boton, BotonLink, Cargando, Dato, Encabezado, Indicador, Pestanas, Tabla, Tarjeta, Vacio, td, th } from '../components/ui'

type Pestana = 'intervenciones' | 'fallas' | 'repuestos' | 'uso'

export function EquipoDetalle() {
  const id = Number(useParams().id)
  const nav = useNavigate()
  const [pestana, setPestana] = useState<Pestana>('intervenciones')
  const { data: h, error, recargar } = useCarga(() => api.equipos.historial(id), [id])
  if (error) return <p className="text-red-600">{error}</p>
  if (!h) return <Cargando />
  const { equipo: e, metricas: m } = h

  async function cambiarEstado(estado: 'operativo' | 'fuera_servicio') {
    try {
      await api.equipos.cambiarEstado({ id, estado })
      toast.ok('Estado actualizado')
      recargar()
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  async function eliminar() {
    if (!confirm(`¿Eliminar el equipo ${e.codigo_interno}? Esta acción no se puede deshacer.`)) return
    try {
      await api.equipos.eliminar(id)
      toast.ok('Equipo eliminado')
      nav('/equipos')
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  return (
    <>
      <Encabezado
        volver="/equipos"
        titulo={
          <span className="flex items-center gap-3">
            {e.codigo_interno} <EstadoEquipoInsignia v={e.estado} /> <FlotaInsignia v={e.flota} />
          </span>
        }
        subtitulo={[`${e.marca} ${e.modelo}`, e.anio, e.categoria, e.placa && `Placa ${e.placa}`, e.numero_serie && `Serial ${e.numero_serie}`].filter(Boolean).join(' · ')}
        acciones={
          <>
            {e.estado === 'fuera_servicio' ? (
              <Boton icono={CircleCheck} onClick={() => cambiarEstado('operativo')}>Marcar operativo</Boton>
            ) : e.estado === 'operativo' ? (
              <Boton icono={Ban} onClick={() => cambiarEstado('fuera_servicio')}>Fuera de servicio</Boton>
            ) : null}
            {m.total_ordenes === 0 && <Boton variante="peligro" icono={Trash2} onClick={eliminar}>Eliminar</Boton>}
            <BotonLink to={`/equipos/${id}/editar`} icono={Pencil}>Editar</BotonLink>
            <BotonLink to={`/ordenes/nueva?equipo=${id}`} variante="primario" icono={Plus}>Nueva orden</BotonLink>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Indicador etiqueta="MTBF (entre fallas)" valor={m.mtbf_horas != null ? `${num(m.mtbf_horas, 0)} h` : '—'} detalle={`${num(m.horas_operadas, 0)} h operadas / ${m.total_fallas} falla(s)`} icono={Activity} tono="verde" />
        <Indicador etiqueta="MTTR (reparación)" valor={m.mttr_horas != null ? duracion(m.mttr_horas) : '—'} detalle="Promedio ejecución + pruebas" icono={Wrench} tono="azul" />
        <Indicador etiqueta="Tiempo medio fuera" valor={m.mdt_horas != null ? duracion(m.mdt_horas) : '—'} detalle="Ingreso a liberación (incluye esperas)" icono={Timer} tono="naranja" />
        <Indicador etiqueta="Disponibilidad inherente" valor={m.disponibilidad_pct != null ? `${num(m.disponibilidad_pct, 1)} %` : '—'} detalle="MTBF / (MTBF + MTTR)" icono={CircleCheck} tono="verde" />
        <Indicador etiqueta="Ingresos a taller" valor={m.total_ordenes} detalle={`${m.total_fallas} fallas · ${m.total_preventivos} preventivos · ${m.ordenes_abiertas} abiertas`} icono={ClipboardList} />
        <Indicador etiqueta="Downtime acumulado" valor={duracion(m.downtime_horas)} icono={Clock} tono="rojo" />
        <Indicador etiqueta="Costo acumulado" valor={dinero(m.costo_repuestos + m.costo_mano_obra)} detalle={`Repuestos ${dinero(m.costo_repuestos)} · M.O. ${dinero(m.costo_mano_obra)}`} icono={DollarSign} tono="ambar" />
        <Indicador etiqueta="Horómetro actual" valor={`${num(e.horometro_actual)} h`} detalle={e.frente_actual ? `Frente: ${e.frente_actual}` : 'Sin frente asignado'} icono={Gauge} />
      </div>

      <div className="mt-6">
        <Pestanas<Pestana>
          activa={pestana}
          onChange={setPestana}
          items={[
            { id: 'intervenciones', etiqueta: 'Intervenciones', cuenta: h.ordenes.length },
            { id: 'fallas', etiqueta: 'Fallas recurrentes', cuenta: h.fallas_por_sistema.length },
            { id: 'repuestos', etiqueta: 'Repuestos utilizados', cuenta: h.repuestos_usados.length },
            { id: 'uso', etiqueta: 'Uso mensual' }
          ]}
        />

        {pestana === 'intervenciones' && (
          <Tarjeta sinPadding>
            {h.ordenes.length === 0 ? (
              <Vacio icono={ClipboardList} titulo="Sin intervenciones" texto="Este equipo nunca ha entrado a taller." />
            ) : (
              <Tabla>
                <thead>
                  <tr>
                    <th className={th}>Folio</th>
                    <th className={th}>Apertura</th>
                    <th className={th}>Tipo</th>
                    <th className={th}>Motivo</th>
                    <th className={th}>Sistema</th>
                    <th className={th}>Fase / estado</th>
                    <th className={`${th} text-right`}>Downtime</th>
                    <th className={`${th} text-right`}>Costo</th>
                  </tr>
                </thead>
                <tbody>
                  {h.ordenes.map((o) => (
                    <tr key={o.id} className="cursor-pointer hover:bg-slate-50" onClick={() => nav(`/ordenes/${o.id}`)}>
                      <td className={`${td} font-medium whitespace-nowrap`}>{o.folio}</td>
                      <td className={`${td} whitespace-nowrap text-slate-600`}>{fechaHora(o.fecha_apertura)}</td>
                      <td className={td}><TipoInsignia v={o.tipo} /></td>
                      <td className={`${td} max-w-xs truncate`} title={o.descripcion}>{o.descripcion}</td>
                      <td className={`${td} text-slate-600`}>{o.sistema_afectado ? ETIQUETA_SISTEMA[o.sistema_afectado] : '—'}</td>
                      <td className={td}>{o.estado === 'abierta' ? <FaseInsignia fase={o.fase_actual} estado={o.estado} /> : <EstadoOrdenInsignia v={o.estado} />}</td>
                      <td className={`${td} text-right tabular-nums`}>{duracion(o.downtime_horas)}</td>
                      <td className={`${td} text-right tabular-nums`}>{dinero(o.costo_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </Tabla>
            )}
          </Tarjeta>
        )}

        {pestana === 'fallas' && (
          <Tarjeta sinPadding>
            {h.fallas_por_sistema.length === 0 ? (
              <Vacio icono={Repeat} titulo="Sin fallas registradas" texto="Solo cuentan órdenes correctivas y de emergencia." />
            ) : (
              <Tabla>
                <thead>
                  <tr>
                    <th className={th}>Sistema afectado</th>
                    <th className={`${th} text-right`}>N° de fallas</th>
                    <th className={`${th} text-right`}>% del total</th>
                    <th className={`${th} text-right`}>Downtime causado</th>
                  </tr>
                </thead>
                <tbody>
                  {h.fallas_por_sistema.map((f) => (
                    <tr key={f.sistema ?? 'sin'}>
                      <td className={`${td} font-medium`}>
                        {f.sistema ? ETIQUETA_SISTEMA[f.sistema] : <span className="text-slate-400">Sin clasificar</span>}
                        {f.cantidad >= 3 && <span className="ml-2 rounded bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-700">Recurrente</span>}
                      </td>
                      <td className={`${td} text-right tabular-nums`}>{f.cantidad}</td>
                      <td className={`${td} text-right tabular-nums`}>{num((f.cantidad / m.total_fallas) * 100, 0)} %</td>
                      <td className={`${td} text-right tabular-nums`}>{duracion(f.downtime_horas)}</td>
                    </tr>
                  ))}
                </tbody>
              </Tabla>
            )}
          </Tarjeta>
        )}

        {pestana === 'repuestos' && (
          <Tarjeta sinPadding>
            {h.repuestos_usados.length === 0 ? (
              <Vacio icono={Wrench} titulo="Sin repuestos recibidos" />
            ) : (
              <Tabla>
                <thead>
                  <tr>
                    <th className={th}>Código</th>
                    <th className={th}>Descripción</th>
                    <th className={`${th} text-right`}>Cantidad</th>
                    <th className={`${th} text-right`}>Costo total</th>
                  </tr>
                </thead>
                <tbody>
                  {h.repuestos_usados.map((r) => (
                    <tr key={r.codigo}>
                      <td className={`${td} font-mono text-xs`}>{r.codigo}</td>
                      <td className={td}>{r.descripcion}</td>
                      <td className={`${td} text-right tabular-nums`}>{num(r.cantidad, 2)} {r.unidad}</td>
                      <td className={`${td} text-right tabular-nums`}>{dinero(r.costo)}</td>
                    </tr>
                  ))}
                </tbody>
              </Tabla>
            )}
          </Tarjeta>
        )}

        {pestana === 'uso' && (
          <Tarjeta sinPadding>
            {h.uso_mensual.length === 0 ? (
              <Vacio icono={Clock} titulo="Sin horas registradas" texto="Registre el uso diario en Horómetros." accion={<BotonLink to="/horometros">Ir a horómetros</BotonLink>} />
            ) : (
              <Tabla>
                <thead>
                  <tr>
                    <th className={th}>Mes</th>
                    <th className={`${th} text-right`}>Horas trabajadas</th>
                  </tr>
                </thead>
                <tbody>
                  {h.uso_mensual.map((u) => (
                    <tr key={u.mes}>
                      <td className={td}>{new Date(`${u.mes}-01T12:00`).toLocaleDateString('es-VE', { month: 'long', year: 'numeric' })}</td>
                      <td className={`${td} text-right tabular-nums`}>{num(u.horas)} h</td>
                    </tr>
                  ))}
                </tbody>
              </Tabla>
            )}
          </Tarjeta>
        )}
      </div>

      <Tarjeta titulo="Ficha del equipo" className="mt-6">
        <dl className="grid grid-cols-4 gap-4">
          <Dato etiqueta="Código interno">{e.codigo_interno}</Dato>
          <Dato etiqueta="Placa">{e.placa ?? '—'}</Dato>
          <Dato etiqueta="Serial de chasis / equipo">{e.numero_serie ?? '—'}</Dato>
          <Dato etiqueta="Serial de motor">{e.serial_motor ?? '—'}</Dato>
          <Dato etiqueta="Capacidad">{e.capacidad ?? '—'}</Dato>
          <Dato etiqueta="Marca / modelo">{e.marca} {e.modelo}</Dato>
          <Dato etiqueta="Año">{e.anio ?? '—'}</Dato>
          <Dato etiqueta="Categoría">{e.categoria}</Dato>
          <Dato etiqueta="Frente actual">{e.frente_actual ?? '—'}</Dato>
          <Dato etiqueta="Registrado">{fecha(new Date(e.creado_en))}</Dato>
          <Dato etiqueta="Última actualización">{fechaHora(e.actualizado_en)}</Dato>
          {e.observaciones && <Dato etiqueta="Observaciones" className="col-span-4"><span className="whitespace-pre-line">{e.observaciones}</span></Dato>}
        </dl>
      </Tarjeta>
    </>
  )
}
