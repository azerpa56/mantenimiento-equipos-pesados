import { useEffect, useState, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { FileDown, Printer } from 'lucide-react'
import {
  ETIQUETA_ESTADO_ORDEN,
  ETIQUETA_ESTADO_REPUESTO,
  ETIQUETA_PRIORIDAD,
  ETIQUETA_SISTEMA,
  ETIQUETA_TIPO_OT,
  FASE_INFO,
  FASES
} from '@shared/dominio'
import { api } from '../lib/api'
import { dinero, duracion, fecha, fechaHora, horasEntre, num } from '../lib/formato'
import { useCarga } from '../lib/hooks'
import { horasPorFase } from '../components/fases'
import { Boton, Cargando } from '../components/ui'

const celda = 'border border-slate-300 px-2 py-1 align-top'
const cab = 'border border-slate-300 bg-slate-100 px-2 py-1 text-left font-semibold'

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="mt-4 break-inside-avoid">
      <h2 className="mb-1.5 border-b-2 border-slate-800 pb-0.5 text-[11px] font-bold tracking-wider text-slate-800 uppercase">{titulo}</h2>
      {children}
    </section>
  )
}

function Texto({ etiqueta, valor }: { etiqueta: string; valor: string | null }) {
  return (
    <div className="mb-2 break-inside-avoid">
      <div className="text-[10px] font-semibold text-slate-500 uppercase">{etiqueta}</div>
      <div className="min-h-5 whitespace-pre-line">{valor || '—'}</div>
    </div>
  )
}

/** Informe formal de la OT. Se usa tanto para la vista previa como para generar el PDF. */
export function Reporte() {
  const id = Number(useParams().id)
  const { data: o, error } = useCarga(() => api.ordenes.obtener(id), [id])
  const [generando, setGenerando] = useState(false)

  useEffect(() => {
    if (!o) return
    document.title = `${o.folio} — Informe de orden de trabajo`
    // Dos frames: asegura que el layout ya se pintó antes de imprimir a PDF.
    requestAnimationFrame(() => requestAnimationFrame(() => window.puente.reporteListo()))
  }, [o])

  if (error) return <p className="p-8 text-red-600">{error}</p>
  if (!o) return <Cargando />

  const h = horasPorFase(o.fases)
  const hhFase = (f: string) => o.mano_obra.filter((m) => m.fase === f).reduce((a, m) => a + m.horas, 0)
  const repuestos = o.repuestos.filter((r) => r.estado !== 'rechazado')
  const total = o.totales.costo_repuestos + o.totales.costo_mano_obra

  return (
    <div className="min-h-full bg-slate-200 print:min-h-0 print:bg-white">
      <div className="sticky top-0 z-10 flex justify-center gap-2 border-b border-slate-300 bg-white/90 py-2 backdrop-blur print:hidden">
        <Boton icono={Printer} onClick={() => window.print()}>
          Imprimir
        </Boton>
        <Boton
          variante="primario"
          icono={FileDown}
          cargando={generando}
          onClick={async () => {
            setGenerando(true)
            await api.reportes.exportarPdf(id).finally(() => setGenerando(false))
          }}
        >
          Guardar PDF
        </Boton>
      </div>

      <article className="mx-auto my-6 w-[8.5in] bg-white px-[0.5in] py-[0.45in] text-[11px] leading-snug text-slate-900 shadow-lg print:m-0 print:w-auto print:p-0 print:shadow-none">
        {/* Encabezado */}
        <header className="flex items-start justify-between border-b-4 border-amber-500 pb-3">
          <div>
            <div className="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">Taller de equipos pesados</div>
            <h1 className="text-xl font-bold">Informe de Orden de Trabajo</h1>
            <div className="mt-0.5 text-slate-600">
              {ETIQUETA_TIPO_OT[o.tipo]} · Prioridad {ETIQUETA_PRIORIDAD[o.prioridad].toLowerCase()} · {ETIQUETA_ESTADO_ORDEN[o.estado]}
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold tabular-nums">{o.folio}</div>
            <div className="text-slate-600">Emitido {fechaHora(new Date())}</div>
          </div>
        </header>

        <Seccion titulo="Equipo">
          <table className="w-full border-collapse">
            <tbody>
              <tr>
                <th className={cab}>Código</th>
                <td className={celda}>{o.equipo.codigo_interno}</td>
                <th className={cab}>Marca / modelo</th>
                <td className={celda}>
                  {o.equipo.marca} {o.equipo.modelo} {o.equipo.anio ?? ''}
                </td>
              </tr>
              <tr>
                <th className={cab}>Placa / serial</th>
                <td className={celda}>{[o.equipo.placa, o.equipo.numero_serie].filter(Boolean).join(' · ')}</td>
                <th className={cab}>Categoría</th>
                <td className={celda}>{o.equipo.categoria}</td>
              </tr>
              <tr>
                <th className={cab}>Horómetro ingreso</th>
                <td className={celda}>{o.horometro_ingreso != null ? `${num(o.horometro_ingreso)} h` : '—'}</td>
                <th className={cab}>Horómetro salida</th>
                <td className={celda}>{o.horometro_salida != null ? `${num(o.horometro_salida)} h` : '—'}</td>
              </tr>
              <tr>
                <th className={cab}>Ingreso a taller</th>
                <td className={celda}>{fechaHora(o.fecha_apertura)}</td>
                <th className={cab}>{o.estado === 'cancelada' ? 'Cancelación' : 'Liberación'}</th>
                <td className={celda}>{fechaHora(o.fecha_cierre)}</td>
              </tr>
              <tr>
                <th className={cab}>Solicitado por</th>
                <td className={celda}>{o.solicitado_por}</td>
                <th className={cab}>Recibido por (operación)</th>
                <td className={celda}>{o.recibido_por ?? '—'}</td>
              </tr>
            </tbody>
          </table>
        </Seccion>

        <Seccion titulo="Resumen de la intervención">
          <div className="grid grid-cols-2 gap-x-6">
            <Texto etiqueta="Motivo de ingreso / síntoma" valor={o.descripcion} />
            <Texto etiqueta="Sistema afectado" valor={o.sistema_afectado ? ETIQUETA_SISTEMA[o.sistema_afectado] : null} />
            <Texto etiqueta="Diagnóstico técnico" valor={o.diagnostico} />
            <Texto etiqueta="Causa raíz" valor={o.causa_raiz} />
            <Texto etiqueta="Trabajo realizado" valor={o.trabajo_realizado} />
            <Texto etiqueta="Resultado de pruebas" valor={o.resultado_pruebas} />
          </div>
          {o.motivo_cancelacion && <Texto etiqueta="Motivo de cancelación" valor={o.motivo_cancelacion} />}
        </Seccion>

        <Seccion titulo="Horas invertidas por fase">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={cab}>Fase</th>
                <th className={`${cab} text-right`}>Tiempo transcurrido</th>
                <th className={`${cab} text-right`}>Horas-hombre</th>
              </tr>
            </thead>
            <tbody>
              {FASES.map((f) => {
                const visitas = o.fases.filter((x) => x.fase === f)
                return (
                  <tr key={f}>
                    <td className={celda}>
                      {FASE_INFO[f].n}. {FASE_INFO[f].nombre}
                    </td>
                    <td className={`${celda} text-right tabular-nums`}>
                      {!visitas.length ? '—' : visitas.every((v) => v.omitida) ? 'Omitida' : duracion(h[f])}
                    </td>
                    <td className={`${celda} text-right tabular-nums`}>{hhFase(f) ? num(hhFase(f), 2) : '—'}</td>
                  </tr>
                )
              })}
              <tr className="font-semibold">
                <td className={celda}>Total</td>
                <td className={`${celda} text-right tabular-nums`}>{duracion(o.totales.downtime_horas || horasEntre(o.fecha_apertura, o.fecha_cierre))}</td>
                <td className={`${celda} text-right tabular-nums`}>{num(o.totales.horas_hombre, 2)}</td>
              </tr>
            </tbody>
          </table>
        </Seccion>

        <Seccion titulo="Trazabilidad de fases">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={cab}>#</th>
                <th className={cab}>Fase</th>
                <th className={cab}>Inicio</th>
                <th className={cab}>Fin</th>
                <th className={cab}>Responsable</th>
                <th className={cab}>Cerrado por</th>
                <th className={cab}>Observaciones</th>
              </tr>
            </thead>
            <tbody>
              {o.fases.map((f) => (
                <tr key={f.id} className="break-inside-avoid">
                  <td className={`${celda} tabular-nums`}>{f.secuencia}</td>
                  <td className={celda}>
                    {FASE_INFO[f.fase].corto}
                    {f.omitida && ' (omitida)'}
                  </td>
                  <td className={`${celda} whitespace-nowrap`}>{fechaHora(f.inicio)}</td>
                  <td className={`${celda} whitespace-nowrap`}>{fechaHora(f.fin)}</td>
                  <td className={celda}>{f.responsable}</td>
                  <td className={celda}>{f.cerrado_por ?? '—'}</td>
                  <td className={`${celda} whitespace-pre-line`}>
                    {f.motivo_retorno && <div className="font-semibold">Retorno: {f.motivo_retorno}</div>}
                    {f.observaciones}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Seccion>

        <Seccion titulo="Repuestos">
          {repuestos.length === 0 ? (
            <p className="text-slate-500">Sin repuestos.</p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={cab}>Código</th>
                  <th className={cab}>Descripción</th>
                  <th className={`${cab} text-right`}>Cant.</th>
                  <th className={`${cab} text-right`}>P. unit.</th>
                  <th className={`${cab} text-right`}>Total</th>
                  <th className={cab}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {repuestos.map((r) => (
                  <tr key={r.id}>
                    <td className={`${celda} font-mono`}>{r.codigo}</td>
                    <td className={celda}>{r.descripcion}</td>
                    <td className={`${celda} text-right tabular-nums`}>
                      {num(r.cantidad, 2)} {r.unidad}
                    </td>
                    <td className={`${celda} text-right tabular-nums`}>{dinero(r.costo_unitario)}</td>
                    <td className={`${celda} text-right tabular-nums`}>{dinero(r.costo_total)}</td>
                    <td className={celda}>{ETIQUETA_ESTADO_REPUESTO[r.estado]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Seccion>

        <Seccion titulo="Mano de obra">
          {o.mano_obra.length === 0 ? (
            <p className="text-slate-500">Sin horas registradas.</p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={cab}>Fecha</th>
                  <th className={cab}>Técnico</th>
                  <th className={cab}>Fase</th>
                  <th className={cab}>Actividad</th>
                  <th className={`${cab} text-right`}>Horas</th>
                  <th className={`${cab} text-right`}>Costo</th>
                </tr>
              </thead>
              <tbody>
                {o.mano_obra.map((m) => (
                  <tr key={m.id}>
                    <td className={celda}>{fecha(m.fecha)}</td>
                    <td className={celda}>{m.personal}</td>
                    <td className={celda}>{FASE_INFO[m.fase].corto}</td>
                    <td className={celda}>{m.descripcion ?? ''}</td>
                    <td className={`${celda} text-right tabular-nums`}>{num(m.horas, 2)}</td>
                    <td className={`${celda} text-right tabular-nums`}>{dinero(m.costo_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Seccion>

        <Seccion titulo="Costos y tiempos">
          <table className="ml-auto w-80 border-collapse">
            <tbody>
              <tr>
                <th className={cab}>Repuestos</th>
                <td className={`${celda} text-right tabular-nums`}>{dinero(o.totales.costo_repuestos)}</td>
              </tr>
              <tr>
                <th className={cab}>Mano de obra</th>
                <td className={`${celda} text-right tabular-nums`}>{dinero(o.totales.costo_mano_obra)}</td>
              </tr>
              <tr>
                <th className={`${cab} bg-amber-100`}>COSTO TOTAL</th>
                <td className={`${celda} text-right font-bold tabular-nums`}>{dinero(total)}</td>
              </tr>
              <tr>
                <th className={cab}>Tiempo fuera de servicio</th>
                <td className={`${celda} text-right tabular-nums`}>{o.equipo_detenido ? duracion(o.totales.downtime_horas) : 'No detenido'}</td>
              </tr>
              <tr>
                <th className={cab}>Reparación efectiva</th>
                <td className={`${celda} text-right tabular-nums`}>{duracion(o.totales.horas_reparacion)}</td>
              </tr>
            </tbody>
          </table>
        </Seccion>

        <footer className="mt-14 grid grid-cols-3 gap-10 break-inside-avoid text-center">
          {['Jefe de taller', 'Técnico responsable', 'Recibe (operación)'].map((r) => (
            <div key={r}>
              <div className="border-t border-slate-800 pt-1 font-semibold">{r}</div>
              <div className="text-[10px] text-slate-500">Nombre, firma y fecha</div>
            </div>
          ))}
        </footer>
      </article>
    </div>
  )
}
