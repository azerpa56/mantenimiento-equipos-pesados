import { Check, CornerDownLeft, Flag, SkipForward, TriangleAlert } from 'lucide-react'
import {
  ETIQUETA_SISTEMA,
  FASE_INFO,
  FASES,
  REQUISITO_SALIDA,
  SISTEMAS,
  type AccionFase,
  type Fase,
  type FaseOrden,
  type OrdenDetalle,
  type Personal
} from '@shared/dominio'
import { transicionSchema } from '@shared/esquemas'
import { api } from '../lib/api'
import { aInputLocal, duracion, fechaHora, horasEntre, num } from '../lib/formato'
import { useFormulario } from '../lib/hooks'
import { toast } from './Toasts'
import { AreaTexto, Aviso, Boton, Campo, Entrada, Modal, Selector, cx } from './ui'

/** Horas acumuladas por fase (sumando visitas por retrabajo). */
export function horasPorFase(fases: FaseOrden[]): Record<Fase, number> {
  const r = Object.fromEntries(FASES.map((f) => [f, 0])) as Record<Fase, number>
  for (const f of fases) r[f.fase] += horasEntre(f.inicio, f.fin)
  return r
}

export function Stepper({ orden }: { orden: OrdenDetalle }) {
  const actualIdx = FASES.indexOf(orden.fase_actual)
  const horas = horasPorFase(orden.fases)
  return (
    <ol className="grid grid-cols-7 gap-1">
      {FASES.map((f, i) => {
        const visitas = orden.fases.filter((x) => x.fase === f)
        const omitida = visitas.length > 0 && visitas.every((v) => v.omitida)
        const cerrada = orden.estado === 'cerrada'
        const estado =
          orden.estado === 'abierta' && i === actualIdx
            ? 'actual'
            : omitida
              ? 'omitida'
              : (cerrada || i < actualIdx) && visitas.length
                ? 'hecha'
                : orden.estado === 'cancelada' && i === actualIdx
                  ? 'cancelada'
                  : 'pendiente'
        return (
          <li key={f} className="relative flex flex-col items-center text-center">
            {i > 0 && <span className={cx('absolute top-[15px] right-1/2 -left-1/2 h-0.5', i <= actualIdx || cerrada ? 'bg-amber-400' : 'bg-slate-200')} />}
            <span
              className={cx(
                'relative z-10 flex size-8 items-center justify-center rounded-full border-2 text-sm font-semibold',
                estado === 'hecha' && 'border-amber-500 bg-amber-500 text-slate-950',
                estado === 'actual' && 'border-amber-500 bg-white text-amber-600 ring-4 ring-amber-100',
                estado === 'omitida' && 'border-dashed border-slate-300 bg-white text-slate-400',
                estado === 'pendiente' && 'border-slate-200 bg-white text-slate-400',
                estado === 'cancelada' && 'border-red-300 bg-red-50 text-red-500'
              )}
            >
              {estado === 'hecha' ? <Check className="size-4" /> : estado === 'omitida' ? <SkipForward className="size-3.5" /> : i + 1}
            </span>
            <span className={cx('mt-2 text-xs font-medium', estado === 'actual' ? 'text-slate-900' : 'text-slate-500')}>{FASE_INFO[f].corto}</span>
            <span className="text-[11px] text-slate-400 tabular-nums">
              {omitida ? 'Omitida' : visitas.length ? duracion(horas[f]) : ''}
              {visitas.filter((v) => !v.omitida).length > 1 && ` · ${visitas.length} veces`}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

export function LineaTiempo({ fases }: { fases: FaseOrden[] }) {
  return (
    <ol className="relative ml-3 border-l-2 border-slate-200">
      {fases.map((f) => (
        <li key={f.id} className="relative mb-5 ml-6 last:mb-0">
          <span
            className={cx(
              'absolute -left-[33px] flex size-5 items-center justify-center rounded-full ring-4 ring-white',
              f.fin ? 'bg-amber-500 text-slate-950' : 'bg-white text-amber-600 ring-amber-100 outline-2 outline-amber-500',
              f.omitida && 'bg-slate-300'
            )}
          >
            {f.fin && <Check className="size-3" />}
          </span>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4">
            <h3 className="text-sm font-semibold text-slate-900">
              {FASE_INFO[f.fase].n}. {FASE_INFO[f.fase].nombre}
              {f.omitida && <span className="ml-2 text-xs font-normal text-slate-400">(omitida)</span>}
              {!f.fin && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">En curso</span>}
            </h3>
            <span className="text-xs text-slate-500 tabular-nums">{f.omitida ? '' : duracion(horasEntre(f.inicio, f.fin))}</span>
          </div>
          {f.motivo_retorno && (
            <p className="mt-1 flex items-center gap-1 text-xs font-medium text-orange-700">
              <CornerDownLeft className="size-3.5" /> Retorno: {f.motivo_retorno}
            </p>
          )}
          <dl className="mt-1.5 grid grid-cols-2 gap-x-6 gap-y-0.5 text-xs text-slate-600">
            <div>
              <dt className="inline text-slate-400">Inicio: </dt>
              <dd className="inline">{fechaHora(f.inicio)} · {f.responsable}</dd>
            </div>
            <div>
              <dt className="inline text-slate-400">Cierre: </dt>
              <dd className="inline">{f.fin ? `${fechaHora(f.fin)} · ${f.cerrado_por ?? ''}` : '—'}</dd>
            </div>
          </dl>
          {f.observaciones && <p className="mt-1.5 rounded-md bg-slate-50 px-2.5 py-1.5 text-xs whitespace-pre-line text-slate-700">{f.observaciones}</p>}
        </li>
      ))}
    </ol>
  )
}

// ---------- Modal de transición ----------

const TITULO_ACCION: Record<AccionFase, string> = { avanzar: 'Avanzar fase', omitir_procura: 'Omitir procura', retornar: 'Retornar a fase anterior' }

export function TransicionModal({
  orden,
  accion,
  destino,
  personal,
  onCerrar,
  onHecho
}: {
  orden: OrdenDetalle
  accion: AccionFase
  destino: Fase
  personal: Personal[]
  onCerrar: () => void
  onHecho: (o: OrdenDetalle) => void
}) {
  const abierta = orden.fases.find((f) => !f.fin)
  const actual = orden.fase_actual
  const req = accion !== 'retornar' ? REQUISITO_SALIDA[actual] : undefined
  const yaRegistrado = orden.bitacora.some((b) => b.fase === actual)
  const pendientes = orden.repuestos.filter((r) => r.estado === 'solicitado' || r.estado === 'aprobado').length
  const bloqueaRepuestos = accion !== 'retornar' && (destino === 'ejecucion' || destino === 'pruebas') && pendientes > 0
  const activos = personal.filter((p) => p.activo)

  const f = useFormulario({
    orden_id: orden.id,
    accion,
    destino,
    fecha_hora: aInputLocal(),
    cerrado_por_id: String(abierta?.responsable_id ?? ''),
    responsable_id: String(abierta?.responsable_id ?? ''),
    observaciones: '',
    motivo_retorno: '',
    // El texto técnico se agrega a la bitácora: arranca vacío.
    diagnostico: '',
    causa_raiz: orden.causa_raiz ?? '',
    sistema_afectado: orden.sistema_afectado ?? '',
    trabajo_realizado: '',
    resultado_pruebas: '',
    recibido_por: '',
    horometro_salida: destino === 'liberacion' ? String(orden.equipo.horometro_actual) : ''
  })

  const guardar = () =>
    f.enviar(transicionSchema, async (v) => {
      const o = await api.ordenes.transicionar(v)
      toast.ok(destino === 'liberacion' ? `Orden ${o.folio} liberada y cerrada` : `Orden en ${FASE_INFO[destino].corto}`)
      onHecho(o)
    })

  const opcionesPersonal = (
    <>
      <option value="">Seleccione…</option>
      {activos.map((p) => (
        <option key={p.id} value={p.id}>
          {p.nombre}
          {p.cargo ? ` — ${p.cargo}` : ''}
        </option>
      ))}
    </>
  )

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={TITULO_ACCION[accion]}
      subtitulo={
        <span className="inline-flex items-center gap-1.5">
          {FASE_INFO[actual].nombre} → <strong className="text-slate-800">{FASE_INFO[destino].nombre}</strong>
        </span>
      }
      pie={
        <>
          <Boton onClick={onCerrar}>Cancelar</Boton>
          <Boton variante={destino === 'liberacion' ? 'oscuro' : 'primario'} icono={destino === 'liberacion' ? Flag : undefined} cargando={f.enviando} disabled={bloqueaRepuestos} onClick={guardar}>
            {destino === 'liberacion' ? 'Liberar y cerrar orden' : 'Registrar transición'}
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        {bloqueaRepuestos && (
          <Aviso tono="rojo" icono={TriangleAlert}>
            Hay {pendientes} repuesto(s) sin aprobar o sin recibir. Recíbalos o recházelos en la pestaña <strong>Repuestos</strong> antes de pasar a {FASE_INFO[destino].corto}.
          </Aviso>
        )}
        {accion === 'omitir_procura' && <Aviso tono="azul">La fase de Procura quedará registrada como omitida (sin repuestos requeridos).</Aviso>}

        <div className="grid grid-cols-3 gap-3">
          <Campo etiqueta="Fecha y hora de la transición" requerido error={f.errores.fecha_hora}>
            <Entrada type="datetime-local" {...f.campo('fecha_hora')} />
          </Campo>
          <Campo etiqueta={`Entrega ${FASE_INFO[actual].corto}`} requerido error={f.errores.cerrado_por_id}>
            <Selector {...f.campo('cerrado_por_id')}>{opcionesPersonal}</Selector>
          </Campo>
          <Campo etiqueta={destino === 'liberacion' ? 'Entrega el equipo' : `Responsable de ${FASE_INFO[destino].corto}`} requerido error={f.errores.responsable_id}>
            <Selector {...f.campo('responsable_id')}>{opcionesPersonal}</Selector>
          </Campo>
        </div>

        {accion === 'retornar' && (
          <Campo etiqueta="Motivo del retorno" requerido error={f.errores.motivo_retorno}>
            <AreaTexto {...f.campo('motivo_retorno')} rows={2} placeholder="Ej.: prueba de presión fallida, fuga persiste en cilindro de levante" />
          </Campo>
        )}

        {/* Datos técnicos exigidos al salir de la fase: si ya hay registros en la bitácora, es opcional agregar otro. */}
        {req && yaRegistrado && (
          <Aviso tono="verde">
            Ya hay {req.etiqueta.toLowerCase()} en la bitácora. Puede agregar otra entrada abajo (opcional).
          </Aviso>
        )}
        {req?.campo === 'diagnostico' && (
          <div className="space-y-3 rounded-lg border border-slate-200 p-3">
            <Campo etiqueta="Diagnóstico técnico" requerido={!yaRegistrado} error={f.errores.diagnostico}>
              <AreaTexto {...f.campo('diagnostico')} rows={3} />
            </Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo etiqueta="Sistema afectado" error={f.errores.sistema_afectado}>
                <Selector {...f.campo('sistema_afectado')}>
                  <option value="">—</option>
                  {SISTEMAS.map((s) => (
                    <option key={s} value={s}>
                      {ETIQUETA_SISTEMA[s]}
                    </option>
                  ))}
                </Selector>
              </Campo>
              <Campo etiqueta="Causa raíz" error={f.errores.causa_raiz}>
                <Entrada {...f.campo('causa_raiz')} />
              </Campo>
            </div>
          </div>
        )}
        {req?.campo === 'trabajo_realizado' && (
          <Campo etiqueta="Trabajo realizado" requerido={!yaRegistrado} error={f.errores.trabajo_realizado}>
            <AreaTexto {...f.campo('trabajo_realizado')} rows={4} />
          </Campo>
        )}
        {req?.campo === 'resultado_pruebas' && (
          <Campo etiqueta="Resultado de las pruebas" requerido={!yaRegistrado} error={f.errores.resultado_pruebas}>
            <AreaTexto {...f.campo('resultado_pruebas')} rows={3} placeholder="Pruebas de banco/campo realizadas y resultado" />
          </Campo>
        )}

        {destino === 'liberacion' && (
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 p-3">
            <Campo etiqueta="Recibido por (operaciones)" requerido error={f.errores.recibido_por}>
              <Entrada {...f.campo('recibido_por')} placeholder="Nombre de quien recibe el equipo" />
            </Campo>
            <Campo etiqueta="Horómetro de salida" error={f.errores.horometro_salida} ayuda={orden.horometro_ingreso != null ? `Ingreso: ${num(orden.horometro_ingreso)} h` : undefined}>
              <Entrada type="number" step="0.1" {...f.campo('horometro_salida')} />
            </Campo>
          </div>
        )}

        <Campo etiqueta={`Observaciones de cierre de ${FASE_INFO[actual].corto}`} error={f.errores.observaciones}>
          <AreaTexto {...f.campo('observaciones')} rows={2} />
        </Campo>
      </div>
    </Modal>
  )
}
