import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowRight,
  Ban,
  Check,
  CornerDownLeft,
  Eye,
  FileDown,
  Flag,
  NotebookPen,
  PackageCheck,
  PackagePlus,
  Plus,
  Save,
  SkipForward,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  TriangleAlert,
  UserRound
} from 'lucide-react'
import {
  BITACORA_FASE,
  ETIQUETA_SISTEMA,
  FASE_INFO,
  FASES,
  FASES_CON_REPUESTOS,
  PRIORIDADES,
  ETIQUETA_PRIORIDAD,
  REQUISITO_SALIDA,
  SISTEMAS,
  transicionesPermitidas,
  type AccionFase,
  type Ejecucion,
  type Fase,
  type OrdenDetalle,
  type Personal
} from '@shared/dominio'
import { accionRepuestoSchema, bitacoraSchema, cancelarSchema, datosTecnicosSchema, manoObraSchema, ordenRepuestoSchema } from '@shared/esquemas'
import { api } from '../lib/api'
import { aInputLocal, dinero, duracion, fecha, fechaHora, horasEntre, hoy, num } from '../lib/formato'
import { useCarga, useFormulario } from '../lib/hooks'
import { toast } from '../components/Toasts'
import { LineaTiempo, Stepper, TransicionModal, horasPorFase } from '../components/fases'
import { EstadoOrdenInsignia, EstadoRepuestoInsignia, PrioridadInsignia, TipoInsignia } from '../components/insignias'
import { AreaTexto, Aviso, Boton, Buscador, Campo, Cargando, Dato, Encabezado, Entrada, Insignia, Modal, Pestanas, Segmentos, Selector, Tabla, Tarjeta, Vacio, td, th } from '../components/ui'

type Pestana = 'tecnico' | 'repuestos' | 'mano_obra' | 'trazabilidad'

export function OrdenDetalleVista() {
  const id = Number(useParams().id)
  const { data: o, error, setData } = useCarga(() => api.ordenes.obtener(id), [id])
  const { data: personal } = useCarga(() => api.personal.listar(), [])
  const [pestana, setPestana] = useState<Pestana>('tecnico')
  const [transicion, setTransicion] = useState<{ accion: AccionFase; destino: Fase } | null>(null)
  const [cancelando, setCancelando] = useState(false)
  const [pdf, setPdf] = useState(false)

  if (error) return <p className="text-red-600">{error}</p>
  if (!o || !personal) return <Cargando />
  const abierta = o.estado === 'abierta'

  async function exportarPdf() {
    setPdf(true)
    try {
      const ruta = await api.reportes.exportarPdf(id)
      if (ruta) toast.ok(`PDF guardado en ${ruta}`)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setPdf(false)
    }
  }

  return (
    <>
      <Encabezado
        volver="/ordenes"
        titulo={
          <span className="flex flex-wrap items-center gap-3">
            {o.folio}
            <TipoInsignia v={o.tipo} />
            <PrioridadInsignia v={o.prioridad} />
            <EstadoOrdenInsignia v={o.estado} />
          </span>
        }
        subtitulo={
          <>
            <Link to={`/equipos/${o.equipo_id}`} className="font-medium text-slate-700 hover:underline">
              {o.equipo_codigo}
            </Link>{' '}
            · {o.equipo_descripcion} · Abierta {fechaHora(o.fecha_apertura)}
          </>
        }
        acciones={
          <>
            <Boton icono={Eye} onClick={() => api.reportes.vistaPrevia(id).catch((e: Error) => toast.error(e.message))}>
              Vista previa
            </Boton>
            <Boton icono={FileDown} cargando={pdf} onClick={exportarPdf}>
              PDF
            </Boton>
            {abierta && (
              <Boton variante="peligro" icono={Ban} onClick={() => setCancelando(true)}>
                Cancelar OT
              </Boton>
            )}
          </>
        }
      />

      <Tarjeta className="mb-6">
        <Stepper orden={o} />
      </Tarjeta>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {abierta ? (
            <FaseActual orden={o} onTransicion={(accion, destino) => setTransicion({ accion, destino })} onIrRepuestos={() => setPestana('repuestos')} />
          ) : (
            <Aviso tono={o.estado === 'cerrada' ? 'verde' : 'gris'} icono={o.estado === 'cerrada' ? Flag : Ban}>
              {o.estado === 'cerrada' ? (
                <>
                  Equipo liberado y entregado a <strong>{o.recibido_por}</strong> el {fechaHora(o.fecha_cierre)}
                </>
              ) : (
                <>
                  Orden cancelada el {fechaHora(o.fecha_cierre)}. Motivo: {o.motivo_cancelacion}
                </>
              )}
            </Aviso>
          )}

          <div>
            <Pestanas<Pestana>
              activa={pestana}
              onChange={setPestana}
              items={[
                { id: 'tecnico', etiqueta: 'Datos técnicos', cuenta: o.bitacora.length },
                { id: 'repuestos', etiqueta: 'Repuestos', cuenta: o.repuestos.length },
                { id: 'mano_obra', etiqueta: 'Mano de obra', cuenta: o.mano_obra.length },
                { id: 'trazabilidad', etiqueta: 'Trazabilidad', cuenta: o.fases.length }
              ]}
            />
            {pestana === 'tecnico' && <DatosTecnicos key={o.id} orden={o} personal={personal} onGuardado={setData} />}
            {pestana === 'repuestos' && <Repuestos orden={o} personal={personal} onCambio={setData} />}
            {pestana === 'mano_obra' && <ManoObraTab orden={o} personal={personal} onCambio={setData} />}
            {pestana === 'trazabilidad' && (
              <Tarjeta>
                <LineaTiempo fases={o.fases} />
              </Tarjeta>
            )}
          </div>
        </div>

        <Resumen orden={o} />
      </div>

      {transicion && (
        <TransicionModal
          orden={o}
          accion={transicion.accion}
          destino={transicion.destino}
          personal={personal}
          onCerrar={() => setTransicion(null)}
          onHecho={(x) => {
            setData(x)
            setTransicion(null)
          }}
        />
      )}
      {cancelando && <CancelarModal orden={o} personal={personal} onCerrar={() => setCancelando(false)} onHecho={(x) => (setData(x), setCancelando(false))} />}
    </>
  )
}

// ---------- Panel de la fase actual ----------

function FaseActual({ orden: o, onTransicion, onIrRepuestos }: { orden: OrdenDetalle; onTransicion: (a: AccionFase, d: Fase) => void; onIrRepuestos: () => void }) {
  const fase = o.fase_actual
  const info = FASE_INFO[fase]
  const actual = o.fases.find((f) => !f.fin)
  const t = transicionesPermitidas(fase)
  const req = REQUISITO_SALIDA[fase]
  const falta = req && !o[req.campo]
  const pendientes = o.repuestos.filter((r) => r.estado === 'solicitado' || r.estado === 'aprobado')
  const bloqueaPorRepuestos = pendientes.length > 0 && (t.avanzar === 'ejecucion' || t.avanzar === 'pruebas')

  return (
    <section className="overflow-hidden rounded-xl border border-amber-300 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4 bg-amber-50 px-5 py-4">
        <div>
          <div className="text-xs font-semibold tracking-wide text-amber-700 uppercase">Fase actual · {info.n} de 7</div>
          <h2 className="mt-0.5 text-lg font-semibold text-slate-900">{info.nombre}</h2>
          <p className="text-sm text-slate-600">{info.descripcion}</p>
        </div>
        {actual && (
          <div className="text-right text-sm">
            <div className="flex items-center justify-end gap-1.5 font-medium text-slate-800">
              <UserRound className="size-4 text-slate-400" /> {actual.responsable}
            </div>
            <div className="text-xs text-slate-500">
              Desde {fechaHora(actual.inicio)} · {duracion(horasEntre(actual.inicio, null))}
            </div>
          </div>
        )}
      </div>
      <div className="space-y-3 px-5 py-4">
        {actual?.motivo_retorno && (
          <Aviso tono="naranja" icono={CornerDownLeft}>
            Fase reabierta por retorno: {actual.motivo_retorno}
          </Aviso>
        )}
        {falta && (
          <Aviso tono="azul">
            Para cerrar esta fase se requiere <strong>{req.etiqueta.toLowerCase()}</strong>. Regístrelo en la bitácora (<em>Datos técnicos</em>) o al registrar la transición.
          </Aviso>
        )}
        {bloqueaPorRepuestos && (
          <Aviso tono="rojo" icono={TriangleAlert}>
            {pendientes.length} repuesto(s) pendiente(s) de {pendientes.some((p) => p.estado === 'solicitado') ? 'aprobación o ' : ''}llegada.{' '}
            <button className="font-medium underline" onClick={onIrRepuestos}>
              Gestionar repuestos
            </button>
          </Aviso>
        )}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {t.avanzar && (
            <Boton variante={t.avanzar === 'liberacion' ? 'oscuro' : 'primario'} icono={t.avanzar === 'liberacion' ? Flag : ArrowRight} onClick={() => onTransicion('avanzar', t.avanzar!)} disabled={bloqueaPorRepuestos}>
              {t.avanzar === 'liberacion' ? 'Liberar y entregar a operación' : `Avanzar a ${FASE_INFO[t.avanzar].corto}`}
            </Boton>
          )}
          {t.omitirProcura && (
            <Boton icono={SkipForward} onClick={() => onTransicion('omitir_procura', 'ejecucion')} disabled={pendientes.length > 0}>
              Sin repuestos: pasar a Ejecución
            </Boton>
          )}
          {t.retornos.length > 0 && (
            <div className="ml-auto flex items-center gap-1.5">
              <span className="text-xs text-slate-500">Retornar a:</span>
              {t.retornos.map((r) => (
                <Boton key={r} tamano="sm" variante="fantasma" icono={CornerDownLeft} onClick={() => onTransicion('retornar', r)}>
                  {FASE_INFO[r].corto}
                </Boton>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

// ---------- Datos técnicos ----------

function DatosTecnicos({ orden: o, personal, onGuardado }: { orden: OrdenDetalle; personal: Personal[]; onGuardado: (o: OrdenDetalle) => void }) {
  return (
    <div className="space-y-6">
      <Bitacora orden={o} personal={personal} onCambio={onGuardado} />
      <Clasificacion orden={o} onGuardado={onGuardado} />
    </div>
  )
}

/** Datos que describen la orden completa (no por fase): se editan en cualquier momento. */
function Clasificacion({ orden: o, onGuardado }: { orden: OrdenDetalle; onGuardado: (o: OrdenDetalle) => void }) {
  const abierta = o.estado === 'abierta'
  const f = useFormulario({ orden_id: o.id, prioridad: o.prioridad, sistema_afectado: o.sistema_afectado ?? '', causa_raiz: o.causa_raiz ?? '' })
  // Si una transición actualiza los datos, refrescar el formulario.
  const { setValores } = f
  useEffect(() => {
    setValores({ orden_id: o.id, prioridad: o.prioridad, sistema_afectado: o.sistema_afectado ?? '', causa_raiz: o.causa_raiz ?? '' })
  }, [o, setValores])

  const guardar = () =>
    f.enviar(datosTecnicosSchema, async (v) => {
      onGuardado(await api.ordenes.guardarDatosTecnicos(v))
      toast.ok('Clasificación guardada')
    })

  return (
    <Tarjeta titulo="Clasificación de la orden" acciones={abierta && <Boton tamano="sm" icono={Save} cargando={f.enviando} onClick={guardar}>Guardar</Boton>}>
      <div className="grid grid-cols-2 gap-4">
        <Campo etiqueta="Prioridad" error={f.errores.prioridad}>
          <Selector {...f.campo('prioridad')} disabled={!abierta}>
            {PRIORIDADES.map((p) => (
              <option key={p} value={p}>
                {ETIQUETA_PRIORIDAD[p]}
              </option>
            ))}
          </Selector>
        </Campo>
        <Campo etiqueta="Sistema afectado" error={f.errores.sistema_afectado}>
          <Selector {...f.campo('sistema_afectado')} disabled={!abierta}>
            <option value="">— Sin determinar —</option>
            {SISTEMAS.map((s) => (
              <option key={s} value={s}>
                {ETIQUETA_SISTEMA[s]}
              </option>
            ))}
          </Selector>
        </Campo>
        <Campo etiqueta="Causa raíz" error={f.errores.causa_raiz} className="col-span-2">
          <Entrada {...f.campo('causa_raiz')} disabled={!abierta} placeholder="Desgaste normal, mala operación, falta de mantenimiento, defecto de fábrica…" />
        </Campo>
      </div>
    </Tarjeta>
  )
}

/** Bitácora: cada fase agrega sus entradas; el formulario queda vacío tras cada registro. */
function Bitacora({ orden: o, personal, onCambio }: { orden: OrdenDetalle; personal: Personal[]; onCambio: (o: OrdenDetalle) => void }) {
  const abierta = o.estado === 'abierta'
  const fase = o.fase_actual
  const actual = o.fases.find((x) => !x.fin)
  const vacio = () => ({
    orden_id: o.id,
    fecha_hora: aInputLocal(),
    responsable_id: String(actual?.responsable_id ?? ''),
    descripcion: '',
    ejecucion: 'interno' as Ejecucion,
    taller_externo: ''
  })
  const f = useFormulario(vacio())
  const { setValores } = f
  // Al cambiar de fase el formulario arranca de cero.
  useEffect(() => {
    setValores(vacio())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o.id, fase, setValores])

  const agregar = () =>
    f.enviar(bitacoraSchema, async (v) => {
      onCambio(await api.ordenes.agregarBitacora(v))
      setValores(vacio())
      toast.ok('Registrado en la bitácora')
    })

  async function quitar(id: number) {
    try {
      onCambio(await api.ordenes.eliminarBitacora(id))
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const info = BITACORA_FASE[fase]
  // Más reciente primero.
  const entradas = [...o.bitacora].reverse()

  return (
    <Tarjeta sinPadding titulo="Información técnica de la intervención">
      <div className="border-b border-slate-100 px-5 py-4">
        <div className="text-xs font-semibold text-slate-500 uppercase">Motivo de ingreso</div>
        <p className="mt-1 text-sm whitespace-pre-line text-slate-700">{o.descripcion}</p>
      </div>

      {abierta && (
        <div className="space-y-3 border-b border-slate-100 bg-slate-50/60 px-5 py-4">
          <Campo
            requerido
            error={f.errores.descripcion}
            etiqueta={
              <span className="inline-flex items-center gap-2">
                <Insignia tono="ambar">{FASE_INFO[fase].corto}</Insignia> <span className="text-sm text-slate-800">{info.etiqueta}</span>
              </span>
            }
          >
            <AreaTexto {...f.campo('descripcion')} rows={3} placeholder={info.placeholder} />
          </Campo>
          <div className="grid grid-cols-6 gap-3">
            <Campo etiqueta="Realizado por" className="col-span-2" error={f.errores.ejecucion}>
              <Segmentos<Ejecucion>
                valor={f.valores.ejecucion}
                onChange={(x) => f.set('ejecucion', x)}
                opciones={[
                  { valor: 'interno', etiqueta: 'Interno' },
                  { valor: 'externo', etiqueta: 'Externo', clase: 'text-violet-700' }
                ]}
              />
            </Campo>
            {f.valores.ejecucion === 'externo' && (
              <Campo etiqueta="Taller / proveedor externo" requerido className="col-span-4" error={f.errores.taller_externo}>
                <Entrada {...f.campo('taller_externo')} placeholder="Ej.: Rectificadora Los Andes" />
              </Campo>
            )}
            <Campo etiqueta="Responsable" requerido className="col-span-3" error={f.errores.responsable_id}>
              <Selector {...f.campo('responsable_id')}>{opcionesPersonal(personal)}</Selector>
            </Campo>
            <Campo etiqueta="Fecha y hora" requerido className="col-span-2" error={f.errores.fecha_hora}>
              <Entrada type="datetime-local" {...f.campo('fecha_hora')} />
            </Campo>
            <div className="col-span-1 flex items-end">
              <Boton variante="primario" icono={Plus} cargando={f.enviando} onClick={agregar} className="w-full">
                Agregar
              </Boton>
            </div>
          </div>
        </div>
      )}

      {entradas.length === 0 ? (
        <Vacio icono={NotebookPen} titulo="Sin registros" texto="Cada fase agrega aquí su diagnóstico, trabajo realizado, pruebas o notas." />
      ) : (
        <ol className="divide-y divide-slate-100">
          {entradas.map((b) => (
            <li key={b.id} className="group flex gap-4 px-5 py-3">
              <div className="w-36 shrink-0 space-y-1">
                <Insignia tono="gris">{FASE_INFO[b.fase].corto}</Insignia>
                <div className="text-xs text-slate-500">{fechaHora(b.fecha_hora)}</div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="font-medium text-slate-700">{BITACORA_FASE[b.fase].etiqueta}</span>
                  {b.responsable && <span>· {b.responsable}</span>}
                  {b.ejecucion === 'externo' && <Insignia tono="violeta">Externo · {b.taller_externo}</Insignia>}
                </div>
                <p className="mt-1 text-sm whitespace-pre-line text-slate-800">{b.descripcion}</p>
              </div>
              {abierta && b.fase === fase && (
                <button className="invisible self-start text-slate-400 group-hover:visible hover:text-red-600" title="Quitar" onClick={() => quitar(b.id)}>
                  <Trash2 className="size-4" />
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
    </Tarjeta>
  )
}

// ---------- Repuestos (procura) ----------

const opcionesPersonal = (personal: Personal[]) => (
  <>
    <option value="">Seleccione…</option>
    {personal.filter((p) => p.activo).map((p) => (
      <option key={p.id} value={p.id}>
        {p.nombre}
        {p.cargo ? ` — ${p.cargo}` : ''}
      </option>
    ))}
  </>
)

function Repuestos({ orden: o, personal, onCambio }: { orden: OrdenDetalle; personal: Personal[]; onCambio: (o: OrdenDetalle) => void }) {
  const [agregando, setAgregando] = useState(false)
  const [accion, setAccion] = useState<{ id: number; accion: 'aprobar' | 'rechazar' | 'recibir'; etiqueta: string } | null>(null)
  const abierta = o.estado === 'abierta'
  const puedeSolicitar = abierta && FASES_CON_REPUESTOS.includes(o.fase_actual)
  const total = o.repuestos.filter((r) => r.estado !== 'rechazado').reduce((a, r) => a + r.costo_total, 0)

  async function quitar(id: number) {
    try {
      onCambio(await api.ordenes.eliminarRepuesto(id))
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <Tarjeta
      sinPadding
      titulo="Repuestos solicitados"
      acciones={
        puedeSolicitar ? (
          <Boton tamano="sm" variante="primario" icono={PackagePlus} onClick={() => setAgregando(true)}>
            Solicitar repuesto
          </Boton>
        ) : abierta ? (
          <span className="text-xs text-slate-400">Disponible desde Diagnóstico</span>
        ) : null
      }
    >
      {o.repuestos.length === 0 ? (
        <Vacio icono={PackagePlus} titulo="Sin repuestos" texto="Los repuestos solicitados pasan por aprobación y recepción antes de poder ejecutar el trabajo." />
      ) : (
        <Tabla>
          <thead>
            <tr>
              <th className={th}>Repuesto</th>
              <th className={`${th} text-right`}>Cant.</th>
              <th className={`${th} text-right`}>Costo</th>
              <th className={th}>Estado</th>
              <th className={th}>Trazabilidad</th>
              <th className={th}></th>
            </tr>
          </thead>
          <tbody>
            {o.repuestos.map((r) => (
              <tr key={r.id}>
                <td className={td}>
                  <div className="font-medium">{r.descripcion}</div>
                  <div className="font-mono text-xs text-slate-500">
                    {r.codigo}
                    {r.numero_requisicion && ` · Req. ${r.numero_requisicion}`}
                    {r.proveedor && ` · ${r.proveedor}`}
                  </div>
                </td>
                <td className={`${td} text-right whitespace-nowrap tabular-nums`}>
                  {num(r.cantidad, 2)} {r.unidad}
                </td>
                <td className={`${td} text-right tabular-nums`}>
                  {dinero(r.costo_total)}
                  <div className="text-xs text-slate-400">{dinero(r.costo_unitario)} c/u</div>
                </td>
                <td className={td}>
                  <EstadoRepuestoInsignia v={r.estado} />
                </td>
                <td className={`${td} text-xs leading-5 text-slate-600`}>
                  <div>Solicitó {r.solicitado_por} · {fechaHora(r.fecha_solicitud)}</div>
                  {r.fecha_aprobacion && (
                    <div>
                      {r.estado === 'rechazado' ? 'Rechazó' : 'Aprobó'} {r.aprobado_por} · {fechaHora(r.fecha_aprobacion)}
                    </div>
                  )}
                  {r.fecha_llegada && <div>Recibió {r.recibido_por} · {fechaHora(r.fecha_llegada)}</div>}
                  {r.motivo_rechazo && <div className="text-red-600">Motivo: {r.motivo_rechazo}</div>}
                </td>
                <td className={`${td} whitespace-nowrap`}>
                  {abierta && (
                    <div className="flex justify-end gap-1">
                      {r.estado === 'solicitado' && (
                        <>
                          <Boton tamano="sm" icono={ThumbsUp} onClick={() => setAccion({ id: r.id, accion: 'aprobar', etiqueta: 'Aprobar repuesto' })}>
                            Aprobar
                          </Boton>
                          <Boton tamano="sm" variante="fantasma" icono={Trash2} title="Quitar" onClick={() => quitar(r.id)} />
                        </>
                      )}
                      {r.estado === 'aprobado' && (
                        <Boton tamano="sm" variante="primario" icono={PackageCheck} onClick={() => setAccion({ id: r.id, accion: 'recibir', etiqueta: 'Registrar llegada' })}>
                          Recibir
                        </Boton>
                      )}
                      {(r.estado === 'solicitado' || r.estado === 'aprobado') && (
                        <Boton tamano="sm" variante="fantasma" icono={ThumbsDown} title="Rechazar" onClick={() => setAccion({ id: r.id, accion: 'rechazar', etiqueta: 'Rechazar repuesto' })} />
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="px-3 py-2.5 text-sm font-semibold" colSpan={2}>
                Total (sin rechazados)
              </td>
              <td className="px-3 py-2.5 text-right text-sm font-semibold tabular-nums">{dinero(total)}</td>
              <td colSpan={3} />
            </tr>
          </tfoot>
        </Tabla>
      )}
      {agregando && <AgregarRepuestoModal orden={o} personal={personal} onCerrar={() => setAgregando(false)} onHecho={(x) => (onCambio(x), setAgregando(false))} />}
      {accion && <AccionRepuestoModal {...accion} personal={personal} onCerrar={() => setAccion(null)} onHecho={(x) => (onCambio(x), setAccion(null))} />}
    </Tarjeta>
  )
}

function AgregarRepuestoModal({ orden, personal, onCerrar, onHecho }: { orden: OrdenDetalle; personal: Personal[]; onCerrar: () => void; onHecho: (o: OrdenDetalle) => void }) {
  const { data: catalogo } = useCarga(() => api.repuestos.listar(), [])
  const actual = orden.fases.find((f) => !f.fin)
  const f = useFormulario({
    orden_id: orden.id,
    repuesto_id: '',
    cantidad: '1',
    costo_unitario: '',
    proveedor: '',
    numero_requisicion: '',
    solicitado_por_id: String(actual?.responsable_id ?? ''),
    fecha_solicitud: aInputLocal()
  })
  const sel = catalogo?.find((r) => r.id === Number(f.valores.repuesto_id))
  const guardar = () =>
    f.enviar(ordenRepuestoSchema, async (v) => {
      onHecho(await api.ordenes.agregarRepuesto(v))
      toast.ok('Repuesto solicitado')
    })

  return (
    <Modal
      abierto
      titulo="Solicitar repuesto"
      subtitulo={orden.folio}
      onCerrar={onCerrar}
      pie={
        <>
          <Boton onClick={onCerrar}>Cancelar</Boton>
          <Boton variante="primario" cargando={f.enviando} onClick={guardar}>
            Solicitar
          </Boton>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <Campo etiqueta="Repuesto" requerido error={f.errores.repuesto_id} className="col-span-2" ayuda={<Link to="/catalogos?tab=repuestos" className="underline">Agregar al catálogo</Link>}>
          <Buscador
            opciones={(catalogo ?? []).filter((r) => r.activo).map((r) => ({ valor: r.id, etiqueta: r.descripcion, detalle: `${r.codigo}${r.numero_parte ? ` · N/P ${r.numero_parte}` : ''} · ${r.unidad}` }))}
            valor={Number(f.valores.repuesto_id) || ''}
            onChange={(v) => {
              f.set('repuesto_id', String(v))
              const r = catalogo?.find((x) => x.id === v)
              if (r && !f.valores.costo_unitario) f.set('costo_unitario', String(r.costo_referencia))
            }}
            invalido={!!f.errores.repuesto_id}
            vacio="No está en el catálogo"
          />
        </Campo>
        <Campo etiqueta={`Cantidad${sel ? ` (${sel.unidad})` : ''}`} requerido error={f.errores.cantidad}>
          <Entrada type="number" step="0.01" {...f.campo('cantidad')} />
        </Campo>
        <Campo etiqueta="Costo unitario ($)" requerido error={f.errores.costo_unitario}>
          <Entrada type="number" step="0.01" {...f.campo('costo_unitario')} />
        </Campo>
        <Campo etiqueta="Proveedor" error={f.errores.proveedor}>
          <Entrada {...f.campo('proveedor')} />
        </Campo>
        <Campo etiqueta="N° requisición / OC" error={f.errores.numero_requisicion}>
          <Entrada {...f.campo('numero_requisicion')} />
        </Campo>
        <Campo etiqueta="Solicitado por" requerido error={f.errores.solicitado_por_id}>
          <Selector {...f.campo('solicitado_por_id')}>{opcionesPersonal(personal)}</Selector>
        </Campo>
        <Campo etiqueta="Fecha y hora de solicitud" requerido error={f.errores.fecha_solicitud}>
          <Entrada type="datetime-local" {...f.campo('fecha_solicitud')} />
        </Campo>
      </div>
    </Modal>
  )
}

function AccionRepuestoModal({ id, accion, etiqueta, personal, onCerrar, onHecho }: { id: number; accion: 'aprobar' | 'rechazar' | 'recibir'; etiqueta: string; personal: Personal[]; onCerrar: () => void; onHecho: (o: OrdenDetalle) => void }) {
  const f = useFormulario({ id, accion, responsable_id: '', fecha_hora: aInputLocal(), motivo: '' })
  const guardar = () =>
    f.enviar(accionRepuestoSchema, async (v) => {
      onHecho(await api.ordenes.accionRepuesto(v))
      toast.ok(accion === 'aprobar' ? 'Repuesto aprobado' : accion === 'recibir' ? 'Llegada registrada' : 'Repuesto rechazado')
    })
  return (
    <Modal
      abierto
      titulo={etiqueta}
      onCerrar={onCerrar}
      ancho="max-w-lg"
      pie={
        <>
          <Boton onClick={onCerrar}>Cancelar</Boton>
          <Boton variante={accion === 'rechazar' ? 'peligro' : 'primario'} icono={Check} cargando={f.enviando} onClick={guardar}>
            Confirmar
          </Boton>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <Campo etiqueta="Fecha y hora" requerido error={f.errores.fecha_hora}>
          <Entrada type="datetime-local" {...f.campo('fecha_hora')} />
        </Campo>
        <Campo etiqueta={accion === 'recibir' ? 'Recibido por' : 'Responsable'} requerido error={f.errores.responsable_id}>
          <Selector {...f.campo('responsable_id')}>{opcionesPersonal(personal)}</Selector>
        </Campo>
        {accion === 'rechazar' && (
          <Campo etiqueta="Motivo del rechazo" requerido error={f.errores.motivo} className="col-span-2">
            <AreaTexto {...f.campo('motivo')} rows={2} />
          </Campo>
        )}
      </div>
    </Modal>
  )
}

// ---------- Mano de obra ----------

function ManoObraTab({ orden: o, personal, onCambio }: { orden: OrdenDetalle; personal: Personal[]; onCambio: (o: OrdenDetalle) => void }) {
  const [agregando, setAgregando] = useState(false)
  const abierta = o.estado === 'abierta'
  const porFase = FASES.map((f) => ({ fase: f, horas: o.mano_obra.filter((m) => m.fase === f).reduce((a, m) => a + m.horas, 0) })).filter((x) => x.horas > 0)

  async function quitar(id: number) {
    try {
      onCambio(await api.ordenes.eliminarManoObra(id))
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <Tarjeta
      sinPadding
      titulo="Horas-hombre"
      acciones={abierta && <Boton tamano="sm" variante="primario" icono={Plus} onClick={() => setAgregando(true)}>Registrar horas</Boton>}
    >
      {o.mano_obra.length === 0 ? (
        <Vacio icono={UserRound} titulo="Sin horas registradas" texto="Registre las horas de cada técnico imputadas a la fase en que trabajó." />
      ) : (
        <>
          <div className="flex flex-wrap gap-2 border-b border-slate-100 px-5 py-3">
            {porFase.map((x) => (
              <span key={x.fase} className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700">
                {FASE_INFO[x.fase].corto}: <strong className="tabular-nums">{num(x.horas, 2)} h</strong>
              </span>
            ))}
          </div>
          <Tabla>
            <thead>
              <tr>
                <th className={th}>Fecha</th>
                <th className={th}>Técnico</th>
                <th className={th}>Fase</th>
                <th className={th}>Actividad</th>
                <th className={`${th} text-right`}>Horas</th>
                <th className={`${th} text-right`}>Costo</th>
                <th className={th}></th>
              </tr>
            </thead>
            <tbody>
              {o.mano_obra.map((m) => (
                <tr key={m.id} className="group">
                  <td className={`${td} whitespace-nowrap`}>{fecha(m.fecha)}</td>
                  <td className={`${td} font-medium`}>{m.personal}</td>
                  <td className={td}>{FASE_INFO[m.fase].corto}</td>
                  <td className={`${td} text-slate-600`}>{m.descripcion ?? '—'}</td>
                  <td className={`${td} text-right tabular-nums`}>{num(m.horas, 2)}</td>
                  <td className={`${td} text-right tabular-nums`}>{dinero(m.costo_total)}</td>
                  <td className={`${td} w-10`}>
                    {abierta && (
                      <button className="invisible text-slate-400 group-hover:visible hover:text-red-600" onClick={() => quitar(m.id)}>
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="px-3 py-2.5 text-sm font-semibold" colSpan={4}>
                  Total
                </td>
                <td className="px-3 py-2.5 text-right text-sm font-semibold tabular-nums">{num(o.totales.horas_hombre, 2)}</td>
                <td className="px-3 py-2.5 text-right text-sm font-semibold tabular-nums">{dinero(o.totales.costo_mano_obra)}</td>
                <td />
              </tr>
            </tfoot>
          </Tabla>
        </>
      )}
      {agregando && <ManoObraModal orden={o} personal={personal} onCerrar={() => setAgregando(false)} onHecho={(x) => (onCambio(x), setAgregando(false))} />}
    </Tarjeta>
  )
}

function ManoObraModal({ orden, personal, onCerrar, onHecho }: { orden: OrdenDetalle; personal: Personal[]; onCerrar: () => void; onHecho: (o: OrdenDetalle) => void }) {
  const f = useFormulario({ orden_id: orden.id, personal_id: '', fase: orden.fase_actual as string, fecha: hoy(), horas: '', descripcion: '' })
  const tecnico = personal.find((p) => p.id === Number(f.valores.personal_id))
  const guardar = () =>
    f.enviar(manoObraSchema, async (v) => {
      onHecho(await api.ordenes.agregarManoObra(v))
      toast.ok('Horas registradas')
    })
  return (
    <Modal
      abierto
      titulo="Registrar horas-hombre"
      subtitulo={orden.folio}
      onCerrar={onCerrar}
      ancho="max-w-lg"
      pie={
        <>
          <Boton onClick={onCerrar}>Cancelar</Boton>
          <Boton variante="primario" cargando={f.enviando} onClick={guardar}>
            Registrar
          </Boton>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <Campo etiqueta="Técnico" requerido error={f.errores.personal_id} className="col-span-2" ayuda={tecnico?.costo_hora ? `Costo: ${dinero(tecnico.costo_hora)}/h` : undefined}>
          <Selector {...f.campo('personal_id')}>{opcionesPersonal(personal)}</Selector>
        </Campo>
        <Campo etiqueta="Fase" requerido error={f.errores.fase}>
          <Selector {...f.campo('fase')}>
            {FASES.map((x) => (
              <option key={x} value={x}>
                {FASE_INFO[x].n}. {FASE_INFO[x].corto}
              </option>
            ))}
          </Selector>
        </Campo>
        <Campo etiqueta="Fecha" requerido error={f.errores.fecha}>
          <Entrada type="date" max={hoy()} {...f.campo('fecha')} />
        </Campo>
        <Campo etiqueta="Horas" requerido error={f.errores.horas}>
          <Entrada type="number" step="0.25" {...f.campo('horas')} />
        </Campo>
        <Campo etiqueta="Actividad" error={f.errores.descripcion} className="col-span-2">
          <Entrada {...f.campo('descripcion')} />
        </Campo>
      </div>
    </Modal>
  )
}

// ---------- Cancelar ----------

function CancelarModal({ orden, personal, onCerrar, onHecho }: { orden: OrdenDetalle; personal: Personal[]; onCerrar: () => void; onHecho: (o: OrdenDetalle) => void }) {
  const f = useFormulario({ orden_id: orden.id, fecha_hora: aInputLocal(), responsable_id: '', motivo: '' })
  const guardar = () =>
    f.enviar(cancelarSchema, async (v) => {
      onHecho(await api.ordenes.cancelar(v))
      toast.ok('Orden cancelada')
    })
  return (
    <Modal
      abierto
      titulo={`Cancelar ${orden.folio}`}
      subtitulo="Los repuestos no recibidos quedarán rechazados. Esta acción no se puede deshacer."
      onCerrar={onCerrar}
      ancho="max-w-lg"
      pie={
        <>
          <Boton onClick={onCerrar}>Volver</Boton>
          <Boton variante="peligro" icono={Ban} cargando={f.enviando} onClick={guardar}>
            Cancelar orden
          </Boton>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <Campo etiqueta="Fecha y hora" requerido error={f.errores.fecha_hora}>
          <Entrada type="datetime-local" {...f.campo('fecha_hora')} />
        </Campo>
        <Campo etiqueta="Responsable" requerido error={f.errores.responsable_id}>
          <Selector {...f.campo('responsable_id')}>{opcionesPersonal(personal)}</Selector>
        </Campo>
        <Campo etiqueta="Motivo" requerido error={f.errores.motivo} className="col-span-2">
          <AreaTexto {...f.campo('motivo')} rows={2} />
        </Campo>
      </div>
    </Modal>
  )
}

// ---------- Resumen lateral ----------

function Resumen({ orden: o }: { orden: OrdenDetalle }) {
  const h = horasPorFase(o.fases)
  return (
    <aside className="space-y-6">
      <Tarjeta titulo="Resumen">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Dato etiqueta="Solicitado por">{o.solicitado_por}</Dato>
          <Dato etiqueta="Equipo detenido">{o.equipo_detenido ? 'Sí' : 'No'}</Dato>
          <Dato etiqueta="Horómetro ingreso">{o.horometro_ingreso != null ? `${num(o.horometro_ingreso)} h` : '—'}</Dato>
          <Dato etiqueta="Horómetro salida">{o.horometro_salida != null ? `${num(o.horometro_salida)} h` : '—'}</Dato>
          <Dato etiqueta="Apertura">{fechaHora(o.fecha_apertura)}</Dato>
          <Dato etiqueta="Cierre">{fechaHora(o.fecha_cierre)}</Dato>
        </dl>
      </Tarjeta>
      <Tarjeta titulo="Tiempos y costos">
        <dl className="space-y-2 text-sm">
          {[
            ['Downtime', duracion(o.totales.downtime_horas)],
            ['Reparación efectiva', duracion(o.totales.horas_reparacion)],
            ['Horas-hombre', `${num(o.totales.horas_hombre, 2)} h`],
            ['Repuestos', dinero(o.totales.costo_repuestos)],
            ['Mano de obra', dinero(o.totales.costo_mano_obra)]
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between">
              <dt className="text-slate-500">{k}</dt>
              <dd className="font-medium tabular-nums">{v}</dd>
            </div>
          ))}
          <div className="flex justify-between border-t border-slate-100 pt-2 text-base">
            <dt className="font-semibold">Costo total</dt>
            <dd className="font-semibold tabular-nums">{dinero(o.totales.costo_repuestos + o.totales.costo_mano_obra)}</dd>
          </div>
        </dl>
      </Tarjeta>
      <Tarjeta titulo="Tiempo por fase">
        <dl className="space-y-1.5 text-sm">
          {FASES.filter((f) => o.fases.some((x) => x.fase === f)).map((f) => (
            <div key={f} className="flex justify-between">
              <dt className="text-slate-500">
                {FASE_INFO[f].n}. {FASE_INFO[f].corto}
              </dt>
              <dd className="font-medium tabular-nums">{o.fases.filter((x) => x.fase === f).every((x) => x.omitida) ? 'Omitida' : duracion(h[f])}</dd>
            </div>
          ))}
        </dl>
      </Tarjeta>
    </aside>
  )
}
