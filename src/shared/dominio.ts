// Enumeraciones, etiquetas y tipos de fila compartidos entre main y renderer.

export const ESTADOS_EQUIPO = ['operativo', 'en_mantenimiento', 'en_reparacion', 'fuera_servicio'] as const
export type EstadoEquipo = (typeof ESTADOS_EQUIPO)[number]
export const ETIQUETA_ESTADO_EQUIPO: Record<EstadoEquipo, string> = {
  operativo: 'Operativo',
  en_mantenimiento: 'En mantenimiento',
  en_reparacion: 'En reparación',
  fuera_servicio: 'Fuera de servicio'
}

export const TIPOS_OT = ['preventivo', 'correctivo', 'emergencia'] as const
export type TipoOt = (typeof TIPOS_OT)[number]
export const ETIQUETA_TIPO_OT: Record<TipoOt, string> = {
  preventivo: 'Preventivo',
  correctivo: 'Correctivo',
  emergencia: 'Emergencia'
}

export const PRIORIDADES = ['baja', 'media', 'alta', 'critica'] as const
export type Prioridad = (typeof PRIORIDADES)[number]
export const ETIQUETA_PRIORIDAD: Record<Prioridad, string> = {
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
  critica: 'Crítica'
}

export const SISTEMAS = [
  'motor', 'transmision', 'hidraulico', 'electrico', 'frenos', 'direccion',
  'tren_rodaje', 'neumaticos', 'enfriamiento', 'combustible', 'estructura', 'cabina', 'otro'
] as const
export type Sistema = (typeof SISTEMAS)[number]
export const ETIQUETA_SISTEMA: Record<Sistema, string> = {
  motor: 'Motor',
  transmision: 'Transmisión / tren de potencia',
  hidraulico: 'Sistema hidráulico',
  electrico: 'Sistema eléctrico',
  frenos: 'Frenos',
  direccion: 'Dirección',
  tren_rodaje: 'Tren de rodaje',
  neumaticos: 'Neumáticos',
  enfriamiento: 'Enfriamiento',
  combustible: 'Combustible',
  estructura: 'Estructura / chasis',
  cabina: 'Cabina / accesorios',
  otro: 'Otro'
}

export type EstadoOrden = 'abierta' | 'cerrada' | 'cancelada'
export const ETIQUETA_ESTADO_ORDEN: Record<EstadoOrden, string> = {
  abierta: 'Abierta',
  cerrada: 'Cerrada',
  cancelada: 'Cancelada'
}

export const ESTADOS_REPUESTO = ['solicitado', 'aprobado', 'rechazado', 'recibido'] as const
export type EstadoRepuesto = (typeof ESTADOS_REPUESTO)[number]
export const ETIQUETA_ESTADO_REPUESTO: Record<EstadoRepuesto, string> = {
  solicitado: 'Solicitado',
  aprobado: 'Aprobado',
  rechazado: 'Rechazado',
  recibido: 'Recibido'
}

export const MONEDA = 'USD'

// ---------- Filas ----------

export interface Categoria { id: number; nombre: string; activo: boolean }
export interface Frente { id: number; nombre: string; ubicacion: string | null; activo: boolean }
export interface Personal {
  id: number; nombre: string; cargo: string | null; especialidad: string | null; costo_hora: number; activo: boolean
}
export interface Repuesto {
  id: number; codigo: string; descripcion: string; numero_parte: string | null
  unidad: string; costo_referencia: number; activo: boolean
}

export interface Equipo {
  id: number
  codigo_interno: string
  numero_serie: string
  marca: string
  modelo: string
  anio: number | null
  categoria_id: number
  categoria: string
  horometro_actual: number
  estado: EstadoEquipo
  frente_actual_id: number | null
  frente_actual: string | null
  observaciones: string | null
  ordenes_abiertas: number
  creado_en: Date
  actualizado_en: Date
}

export interface HorometroDiario {
  id: number
  equipo_id: number
  equipo_codigo: string
  fecha: string
  horometro_inicial: number
  horometro_final: number
  horas_trabajadas: number
  frente_id: number | null
  frente: string | null
  actividad: string | null
  operador: string | null
  observaciones: string | null
}

export interface OrdenResumen {
  id: number
  folio: string
  equipo_id: number
  equipo_codigo: string
  equipo_descripcion: string
  tipo: TipoOt
  prioridad: Prioridad
  descripcion: string
  sistema_afectado: Sistema | null
  fase_actual: Fase
  estado: EstadoOrden
  equipo_detenido: boolean
  fecha_apertura: Date
  fecha_cierre: Date | null
  responsable_actual: string | null
  costo_total: number
  downtime_horas: number
}

export interface FaseOrden {
  id: number
  fase: Fase
  secuencia: number
  inicio: Date
  fin: Date | null
  responsable_id: number
  responsable: string
  cerrado_por_id: number | null
  cerrado_por: string | null
  observaciones: string | null
  omitida: boolean
  motivo_retorno: string | null
}

export interface OrdenRepuesto {
  id: number
  repuesto_id: number
  codigo: string
  descripcion: string
  unidad: string
  cantidad: number
  costo_unitario: number
  costo_total: number
  proveedor: string | null
  numero_requisicion: string | null
  estado: EstadoRepuesto
  fecha_solicitud: Date
  solicitado_por: string
  fecha_aprobacion: Date | null
  aprobado_por: string | null
  fecha_llegada: Date | null
  recibido_por: string | null
  motivo_rechazo: string | null
}

export interface ManoObra {
  id: number
  personal_id: number
  personal: string
  fase: Fase
  fecha: string
  horas: number
  costo_hora: number
  costo_total: number
  descripcion: string | null
}

export interface OrdenDetalle extends OrdenResumen {
  solicitado_por: string
  horometro_ingreso: number | null
  horometro_salida: number | null
  diagnostico: string | null
  causa_raiz: string | null
  trabajo_realizado: string | null
  resultado_pruebas: string | null
  recibido_por: string | null
  motivo_cancelacion: string | null
  equipo: Pick<Equipo, 'codigo_interno' | 'numero_serie' | 'marca' | 'modelo' | 'anio' | 'categoria' | 'horometro_actual' | 'estado'>
  fases: FaseOrden[]
  repuestos: OrdenRepuesto[]
  mano_obra: ManoObra[]
  totales: {
    costo_repuestos: number
    costo_mano_obra: number
    horas_hombre: number
    downtime_horas: number
    horas_reparacion: number
  }
}

export interface MetricasEquipo {
  total_ordenes: number
  total_fallas: number
  total_preventivos: number
  ordenes_abiertas: number
  downtime_horas: number
  costo_repuestos: number
  costo_mano_obra: number
  mttr_horas: number | null
  mdt_horas: number | null
  horas_operadas: number
  mtbf_horas: number | null
  disponibilidad_pct: number | null
}

export interface HistorialEquipo {
  equipo: Equipo
  metricas: MetricasEquipo
  ordenes: OrdenResumen[]
  fallas_por_sistema: { sistema: Sistema | null; cantidad: number; downtime_horas: number }[]
  repuestos_usados: { codigo: string; descripcion: string; unidad: string; cantidad: number; costo: number }[]
  uso_mensual: { mes: string; horas: number }[]
}

export interface Dashboard {
  equipos_por_estado: Record<EstadoEquipo, number>
  total_equipos: number
  ordenes_por_fase: Record<Fase, number>
  ordenes_abiertas: OrdenResumen[]
  repuestos_pendientes: number
  ultimos_30: { ordenes: number; cerradas: number; downtime_horas: number; costo: number }
  top_downtime: { equipo_id: number; codigo: string; descripcion: string; downtime_horas: number; fallas: number }[]
}

// ---------- Fases (máquina de estados) ----------

export const FASES = ['recepcion', 'inspeccion', 'diagnostico', 'procura', 'ejecucion', 'pruebas', 'liberacion'] as const
export type Fase = (typeof FASES)[number]

export const FASE_INFO: Record<Fase, { n: number; nombre: string; corto: string; descripcion: string }> = {
  recepcion: { n: 1, nombre: 'Recepción / Solicitud', corto: 'Recepción', descripcion: 'Ingreso del equipo y registro de la solicitud.' },
  inspeccion: { n: 2, nombre: 'Revisión e Inspección Inicial', corto: 'Inspección', descripcion: 'Inspección visual y verificación de síntomas.' },
  diagnostico: { n: 3, nombre: 'Diagnóstico Técnico', corto: 'Diagnóstico', descripcion: 'Determinar la falla, su causa y el plan de trabajo.' },
  procura: { n: 4, nombre: 'Procura / Compra de Repuestos', corto: 'Procura', descripcion: 'Solicitud, aprobación y llegada de repuestos.' },
  ejecucion: { n: 5, nombre: 'Ejecución', corto: 'Ejecución', descripcion: 'Reparación o mantenimiento.' },
  pruebas: { n: 6, nombre: 'Pruebas de Banco / Campo', corto: 'Pruebas', descripcion: 'Verificación del funcionamiento.' },
  liberacion: { n: 7, nombre: 'Liberación y Entrega a Operación', corto: 'Liberación', descripcion: 'Entrega del equipo a operaciones. Cierra la orden.' }
}

export type AccionFase = 'avanzar' | 'omitir_procura' | 'retornar'

/** Fases a las que se puede retroceder desde cada fase (retrabajo). */
const RETORNOS: Partial<Record<Fase, Fase[]>> = {
  procura: ['diagnostico'],
  ejecucion: ['diagnostico', 'procura'],
  pruebas: ['diagnostico', 'procura', 'ejecucion']
}

/** Campo de la OT que debe estar completo para SALIR de la fase. */
export const REQUISITO_SALIDA: Partial<Record<Fase, { campo: 'diagnostico' | 'trabajo_realizado' | 'resultado_pruebas'; etiqueta: string }>> = {
  diagnostico: { campo: 'diagnostico', etiqueta: 'Diagnóstico técnico' },
  ejecucion: { campo: 'trabajo_realizado', etiqueta: 'Trabajo realizado' },
  pruebas: { campo: 'resultado_pruebas', etiqueta: 'Resultado de las pruebas' }
}

export function siguienteFase(f: Fase): Fase | null {
  const i = FASES.indexOf(f)
  return i < FASES.length - 1 ? FASES[i + 1] : null
}

export function transicionesPermitidas(actual: Fase): { avanzar: Fase | null; omitirProcura: boolean; retornos: Fase[] } {
  return {
    avanzar: siguienteFase(actual),
    omitirProcura: actual === 'diagnostico',
    retornos: RETORNOS[actual] ?? []
  }
}

/** Destino válido para la acción, o null si la transición no está permitida. */
export function validarTransicion(actual: Fase, accion: AccionFase, destino: Fase): boolean {
  const t = transicionesPermitidas(actual)
  if (accion === 'avanzar') return t.avanzar === destino
  if (accion === 'omitir_procura') return t.omitirProcura && destino === 'ejecucion'
  return t.retornos.includes(destino)
}

/** Fases en las que se pueden solicitar repuestos. */
export const FASES_CON_REPUESTOS: Fase[] = ['diagnostico', 'procura', 'ejecucion', 'pruebas']

// ---------- Sistema / configuración ----------

export type ModoBaseDatos = 'embebido' | 'externo'

export interface ConfigExterno {
  host: string
  puerto: number
  baseDatos: string
  usuario: string
  password: string
  ssl: boolean
}

export interface EstadoSistema {
  listo: boolean
  modo: ModoBaseDatos
  detalle: string
  error?: string
}
