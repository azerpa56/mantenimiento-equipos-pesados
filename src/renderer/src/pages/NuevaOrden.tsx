import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ClipboardPlus, TriangleAlert, UserPlus } from 'lucide-react'
import { ETIQUETA_SISTEMA, FASE_INFO, FASES, SISTEMAS, type Prioridad, type TipoOt } from '@shared/dominio'
import { ordenCrearSchema } from '@shared/esquemas'
import { api } from '../lib/api'
import { aInputLocal, num } from '../lib/formato'
import { useCarga, useFormulario } from '../lib/hooks'
import { toast } from '../components/Toasts'
import { EstadoEquipoInsignia } from '../components/insignias'
import { AreaTexto, Aviso, Boton, Buscador, Campo, Dato, Encabezado, Entrada, Interruptor, Segmentos, Selector, Tarjeta } from '../components/ui'

export function NuevaOrden() {
  const [q] = useSearchParams()
  const nav = useNavigate()
  const { data: equipos } = useCarga(() => api.equipos.listar(), [])
  const { data: personal } = useCarga(() => api.personal.listar(), [])

  const f = useFormulario({
    equipo_id: q.get('equipo') ?? '',
    tipo: '' as TipoOt | '',
    prioridad: 'media' as Prioridad,
    descripcion: '',
    sistema_afectado: '',
    solicitado_por: '',
    horometro_ingreso: '',
    equipo_detenido: true,
    fecha_apertura: aInputLocal(),
    responsable_id: '',
    observaciones: ''
  })
  const v = f.valores
  const equipo = equipos?.find((e) => e.id === Number(v.equipo_id))
  const activos = personal?.filter((p) => p.activo) ?? []

  function elegirEquipo(id: number | '') {
    f.set('equipo_id', String(id))
    const e = equipos?.find((x) => x.id === id)
    if (e) f.set('horometro_ingreso', String(e.horometro_actual))
  }

  function elegirTipo(t: TipoOt) {
    f.set('tipo', t)
    if (t === 'emergencia') f.set('prioridad', 'critica')
  }

  const crear = () =>
    f.enviar(ordenCrearSchema, async (datos) => {
      const o = await api.ordenes.crear(datos)
      toast.ok(`Orden ${o.folio} creada`)
      nav(`/ordenes/${o.id}`, { replace: true })
    })

  return (
    <>
      <Encabezado titulo="Nueva orden de trabajo" subtitulo="Fase 1 · Recepción / Solicitud" volver="/ordenes" />
      <form
        className="grid gap-6 xl:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault()
          crear()
        }}
      >
        <div className="space-y-6 xl:col-span-2">
          <Tarjeta titulo="Equipo">
            <Campo etiqueta="Equipo" requerido error={f.errores.equipo_id}>
              <Buscador
                opciones={(equipos ?? []).map((e) => ({ valor: e.id, etiqueta: e.codigo_interno, detalle: `${e.marca} ${e.modelo} · ${e.categoria}` }))}
                valor={Number(v.equipo_id) || ''}
                onChange={elegirEquipo}
                placeholder="Buscar por código, marca o modelo…"
                invalido={!!f.errores.equipo_id}
              />
            </Campo>
            {equipo && (
              <>
                <dl className="mt-4 grid grid-cols-4 gap-4 rounded-lg bg-slate-50 p-3">
                  <Dato etiqueta="Estado"><EstadoEquipoInsignia v={equipo.estado} /></Dato>
                  <Dato etiqueta="Horómetro actual">{num(equipo.horometro_actual)} h</Dato>
                  <Dato etiqueta="Serie">{equipo.numero_serie}</Dato>
                  <Dato etiqueta="Frente">{equipo.frente_actual ?? '—'}</Dato>
                </dl>
                {equipo.ordenes_abiertas > 0 && (
                  <div className="mt-3">
                    <Aviso icono={TriangleAlert}>
                      Este equipo ya tiene {equipo.ordenes_abiertas} orden(es) abierta(s).{' '}
                      <Link className="font-medium underline" to={`/equipos/${equipo.id}`}>Ver historial</Link>
                    </Aviso>
                  </div>
                )}
              </>
            )}
          </Tarjeta>

          <Tarjeta titulo="Clasificación y motivo">
            <div className="grid grid-cols-2 gap-4">
              <Campo etiqueta="Tipo de mantenimiento" requerido error={f.errores.tipo}>
                <Segmentos<TipoOt>
                  valor={v.tipo}
                  onChange={elegirTipo}
                  invalido={!!f.errores.tipo}
                  opciones={[
                    { valor: 'preventivo', etiqueta: 'Preventivo', clase: 'text-sky-700' },
                    { valor: 'correctivo', etiqueta: 'Correctivo', clase: 'text-orange-700' },
                    { valor: 'emergencia', etiqueta: 'Emergencia', clase: 'text-red-700' }
                  ]}
                />
              </Campo>
              <Campo etiqueta="Prioridad" requerido error={f.errores.prioridad}>
                <Segmentos<Prioridad>
                  valor={v.prioridad}
                  onChange={(p) => f.set('prioridad', p)}
                  opciones={[
                    { valor: 'baja', etiqueta: 'Baja' },
                    { valor: 'media', etiqueta: 'Media', clase: 'text-sky-700' },
                    { valor: 'alta', etiqueta: 'Alta', clase: 'text-orange-700' },
                    { valor: 'critica', etiqueta: 'Crítica', clase: 'text-red-700' }
                  ]}
                />
              </Campo>
              <Campo etiqueta={v.tipo === 'preventivo' ? 'Servicio a realizar' : 'Síntoma / falla reportada'} requerido error={f.errores.descripcion} className="col-span-2">
                <AreaTexto
                  {...f.campo('descripcion')}
                  rows={4}
                  placeholder={v.tipo === 'preventivo' ? 'Ej.: Servicio de 500 h — cambio de aceite de motor, filtros y engrase general' : 'Ej.: Pérdida de potencia en subida, humo negro y temperatura alta de motor'}
                />
              </Campo>
              <Campo etiqueta="Sistema afectado (preliminar)" error={f.errores.sistema_afectado} ayuda="Se puede precisar en el diagnóstico.">
                <Selector {...f.campo('sistema_afectado')}>
                  <option value="">— Sin determinar —</option>
                  {SISTEMAS.map((s) => (
                    <option key={s} value={s}>
                      {ETIQUETA_SISTEMA[s]}
                    </option>
                  ))}
                </Selector>
              </Campo>
              <Campo etiqueta="Solicitado por" requerido error={f.errores.solicitado_por} ayuda="Operador o supervisor que reporta.">
                <Entrada {...f.campo('solicitado_por')} />
              </Campo>
            </div>
          </Tarjeta>

          <Tarjeta titulo="Recepción en taller">
            <div className="grid grid-cols-3 gap-4">
              <Campo etiqueta="Fecha y hora de ingreso" requerido error={f.errores.fecha_apertura}>
                <Entrada type="datetime-local" {...f.campo('fecha_apertura')} />
              </Campo>
              <Campo etiqueta="Horómetro de ingreso (h)" error={f.errores.horometro_ingreso}>
                <Entrada type="number" step="0.1" {...f.campo('horometro_ingreso')} />
              </Campo>
              <Campo etiqueta="Recibido por (taller)" requerido error={f.errores.responsable_id}>
                <Selector {...f.campo('responsable_id')}>
                  <option value="">Seleccione…</option>
                  {activos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                      {p.cargo ? ` — ${p.cargo}` : ''}
                    </option>
                  ))}
                </Selector>
              </Campo>
              {personal && activos.length === 0 && (
                <div className="col-span-3">
                  <Aviso icono={UserPlus}>
                    No hay personal registrado. <Link to="/catalogos?tab=personal" className="font-medium underline">Agregue mecánicos y jefes de taller</Link> para poder firmar las fases.
                  </Aviso>
                </div>
              )}
              <div className="col-span-3">
                <Interruptor
                  activo={!!v.equipo_detenido}
                  onChange={(x) => f.set('equipo_detenido', x)}
                  etiqueta="El equipo queda detenido"
                  ayuda="Cuenta como tiempo de inactividad (downtime) y cambia el estado del equipo hasta su liberación."
                />
              </div>
              <Campo etiqueta="Observaciones de recepción" error={f.errores.observaciones} className="col-span-3">
                <AreaTexto {...f.campo('observaciones')} rows={2} placeholder="Estado en que llega, accesorios, nivel de combustible…" />
              </Campo>
            </div>
          </Tarjeta>
        </div>

        <aside className="space-y-6">
          <Tarjeta titulo="Recorrido de la orden">
            <ol className="space-y-3">
              {FASES.map((fase) => (
                <li key={fase} className="flex gap-3">
                  <span className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${fase === 'recepcion' ? 'bg-amber-500 text-slate-950' : 'bg-slate-100 text-slate-500'}`}>
                    {FASE_INFO[fase].n}
                  </span>
                  <div>
                    <div className="text-sm font-medium text-slate-800">{FASE_INFO[fase].nombre}</div>
                    <div className="text-xs text-slate-500">{FASE_INFO[fase].descripcion}</div>
                  </div>
                </li>
              ))}
            </ol>
          </Tarjeta>
          <Boton type="submit" variante="primario" icono={ClipboardPlus} cargando={f.enviando} className="h-11 w-full text-base">
            Crear orden de trabajo
          </Boton>
        </aside>
      </form>
    </>
  )
}
