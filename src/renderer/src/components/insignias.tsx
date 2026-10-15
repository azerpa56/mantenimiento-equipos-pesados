import {
  ETIQUETA_ESTADO_EQUIPO,
  ETIQUETA_ESTADO_ORDEN,
  ETIQUETA_ESTADO_REPUESTO,
  ETIQUETA_PRIORIDAD,
  ETIQUETA_TIPO_OT,
  FASE_INFO,
  type EstadoEquipo,
  type EstadoOrden,
  type EstadoRepuesto,
  type Fase,
  type Prioridad,
  type TipoOt
} from '@shared/dominio'
import { Insignia, type Tono } from './ui'

const T_EQUIPO: Record<EstadoEquipo, Tono> = { operativo: 'verde', en_mantenimiento: 'azul', en_reparacion: 'naranja', fuera_servicio: 'rojo' }
const T_TIPO: Record<TipoOt, Tono> = { preventivo: 'azul', correctivo: 'naranja', emergencia: 'rojo' }
const T_PRIORIDAD: Record<Prioridad, Tono> = { baja: 'gris', media: 'azul', alta: 'naranja', critica: 'rojo' }
const T_ORDEN: Record<EstadoOrden, Tono> = { abierta: 'ambar', cerrada: 'verde', cancelada: 'gris' }
const T_REPUESTO: Record<EstadoRepuesto, Tono> = { solicitado: 'ambar', aprobado: 'azul', rechazado: 'gris', recibido: 'verde' }

export const EstadoEquipoInsignia = ({ v }: { v: EstadoEquipo }) => <Insignia tono={T_EQUIPO[v]} punto>{ETIQUETA_ESTADO_EQUIPO[v]}</Insignia>
export const TipoInsignia = ({ v }: { v: TipoOt }) => <Insignia tono={T_TIPO[v]}>{ETIQUETA_TIPO_OT[v]}</Insignia>
export const PrioridadInsignia = ({ v }: { v: Prioridad }) => <Insignia tono={T_PRIORIDAD[v]}>{ETIQUETA_PRIORIDAD[v]}</Insignia>
export const EstadoOrdenInsignia = ({ v }: { v: EstadoOrden }) => <Insignia tono={T_ORDEN[v]} punto>{ETIQUETA_ESTADO_ORDEN[v]}</Insignia>
export const EstadoRepuestoInsignia = ({ v }: { v: EstadoRepuesto }) => <Insignia tono={T_REPUESTO[v]}>{ETIQUETA_ESTADO_REPUESTO[v]}</Insignia>

export function FaseInsignia({ fase, estado }: { fase: Fase; estado: EstadoOrden }) {
  const i = FASE_INFO[fase]
  if (estado === 'cancelada') return <span className="text-xs text-slate-400">Cancelada en {i.corto}</span>
  if (estado === 'cerrada') return <span className="text-xs font-medium text-emerald-700">Liberada</span>
  return (
    <span className="inline-flex items-center gap-2 text-xs">
      <span className="flex gap-0.5">
        {Array.from({ length: 7 }, (_, k) => (
          <span key={k} className={`h-1.5 w-2.5 rounded-sm ${k < i.n ? 'bg-amber-500' : 'bg-slate-200'}`} />
        ))}
      </span>
      <span className="font-medium text-slate-700">
        {i.n}. {i.corto}
      </span>
    </span>
  )
}
