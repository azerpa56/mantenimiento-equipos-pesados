// Validaciones compartidas: el renderer las usa para mostrar errores por campo
// y el proceso principal las vuelve a aplicar antes de tocar la base de datos.
import { z } from 'zod'
import { EJECUCIONES, FASES, FLOTAS, PRIORIDADES, SISTEMAS, TIPOS_OT } from './dominio'

const vacio = (v: unknown) => v == null || (typeof v === 'string' && v.trim() === '')

const n = () => z.number({ error: (iss) => (iss.input === undefined ? 'Requerido' : 'Debe ser un número') })
const num = (inner: z.ZodNumber) => z.preprocess((v) => (vacio(v) ? undefined : Number(v)), inner)
const numNull = (inner: z.ZodNumber) => z.preprocess((v) => (vacio(v) ? null : Number(v)), inner.nullable())

const texto = (max: number) =>
  z.string({ error: 'Requerido' }).trim().min(1, 'Requerido').max(max, `Máximo ${max} caracteres`)
const textoOpt = (max: number) =>
  z.preprocess((v) => (vacio(v) ? null : v), z.string().trim().max(max, `Máximo ${max} caracteres`).nullable())

const idReq = (msg = 'Seleccione una opción') =>
  z.preprocess((v) => (vacio(v) || v === 0 ? undefined : Number(v)), z.number({ error: msg }).int().positive(msg))
const idOpt = z.preprocess((v) => (vacio(v) || v === 0 ? null : Number(v)), z.number().int().positive().nullable())

export function hoyLocal(): string {
  const d = new Date()
  const p = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const fecha = z
  .string({ error: 'Requerido' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida')
  .refine((s) => s <= hoyLocal(), 'No puede ser una fecha futura')

const fechaHora = z.preprocess(
  (v) => (vacio(v) ? undefined : v instanceof Date ? v : new Date(String(v))),
  z
    .date({ error: (iss) => (iss.input === undefined ? 'Requerido' : 'Fecha/hora inválida') })
    .refine((d) => !Number.isNaN(d.getTime()), 'Fecha/hora inválida')
    .refine((d) => d.getTime() <= Date.now() + 5 * 60_000, 'No puede ser una fecha futura')
)

const sistemaOpt = z.preprocess((v) => (vacio(v) ? null : v), z.enum(SISTEMAS).nullable())
const bool = z.preprocess((v) => v === true || v === 'true' || v === 'on', z.boolean())

// ---------- Catálogos ----------

export const categoriaSchema = z.object({
  nombre: texto(100),
  flota: z.enum(FLOTAS, { error: 'Seleccione la flota' }),
  activo: bool.default(true)
})

export const frenteSchema = z.object({
  nombre: texto(100),
  ubicacion: textoOpt(200),
  activo: bool.default(true)
})

export const personalSchema = z.object({
  nombre: texto(100),
  cargo: textoOpt(60),
  especialidad: textoOpt(60),
  // Opcional: solo se usa para costear la mano de obra; vacío = 0.
  costo_hora: z.preprocess((v) => (vacio(v) ? 0 : Number(v)), n().min(0, 'No puede ser negativo')),
  activo: bool.default(true)
})

export const repuestoSchema = z.object({
  codigo: texto(40).transform((s) => s.toUpperCase()),
  descripcion: texto(200),
  numero_parte: textoOpt(60),
  unidad: texto(15).transform((s) => s.toUpperCase()),
  costo_referencia: num(n().min(0, 'No puede ser negativo')),
  activo: bool.default(true)
})

// ---------- Flota ----------

const anioMax = new Date().getFullYear() + 1

const mayus = (max: number) =>
  z.preprocess(
    // Sin letras ni números (",,,,", "---") se toma como vacío.
    (v) => (vacio(v) || !/[\p{L}\p{N}]/u.test(String(v)) ? null : String(v).trim().toUpperCase()),
    z.string().max(max, `Máximo ${max} caracteres`).nullable()
  )

export const equipoSchema = z
  .object({
    codigo_interno: texto(60).transform((s) => s.toUpperCase()),
    numero_serie: mayus(60),
    placa: mayus(20),
    serial_motor: mayus(60),
    capacidad: textoOpt(60),
    marca: texto(60),
    modelo: texto(60),
    anio: numNull(n().int('Año inválido').min(1950, 'Año inválido').max(anioMax, 'Año inválido')),
    categoria_id: idReq('Seleccione la categoría'),
    horometro_actual: num(n().min(0, 'No puede ser negativo')),
    frente_actual_id: idOpt,
    observaciones: textoOpt(2000)
  })
  .superRefine((d, ctx) => {
    if (!d.numero_serie && !d.placa)
      ctx.addIssue({ code: 'custom', path: ['numero_serie'], message: 'Indique el serial o la placa' })
  })

export const horometroSchema = z
  .object({
    equipo_id: idReq('Seleccione el equipo'),
    fecha,
    horometro_inicial: num(n().min(0, 'No puede ser negativo')),
    horometro_final: num(n().min(0, 'No puede ser negativo')),
    frente_id: idOpt,
    actividad: textoOpt(200),
    operador: textoOpt(100),
    observaciones: textoOpt(1000)
  })
  .superRefine((d, ctx) => {
    if (d.horometro_final < d.horometro_inicial)
      ctx.addIssue({ code: 'custom', path: ['horometro_final'], message: 'Debe ser ≥ al horómetro inicial' })
    else if (d.horometro_final - d.horometro_inicial > 24)
      ctx.addIssue({ code: 'custom', path: ['horometro_final'], message: 'Más de 24 h en un día' })
  })

// ---------- Órdenes de trabajo ----------

export const ordenCrearSchema = z.object({
  equipo_id: idReq('Seleccione el equipo'),
  tipo: z.enum(TIPOS_OT, { error: 'Seleccione el tipo' }),
  prioridad: z.enum(PRIORIDADES, { error: 'Seleccione la prioridad' }),
  descripcion: texto(2000).min(10, 'Describa el motivo (mínimo 10 caracteres)'),
  sistema_afectado: sistemaOpt,
  solicitado_por: texto(100),
  horometro_ingreso: numNull(n().min(0, 'No puede ser negativo')),
  equipo_detenido: bool,
  fecha_apertura: fechaHora,
  responsable_id: idReq('Seleccione quién recibe el equipo'),
  observaciones: textoOpt(1000)
})

export const transicionSchema = z
  .object({
    orden_id: idReq(),
    accion: z.enum(['avanzar', 'omitir_procura', 'retornar']),
    destino: z.enum(FASES),
    fecha_hora: fechaHora,
    cerrado_por_id: idReq('Seleccione quién entrega la fase'),
    responsable_id: idReq('Seleccione el responsable de la nueva fase'),
    observaciones: textoOpt(2000),
    motivo_retorno: textoOpt(1000),
    diagnostico: textoOpt(4000),
    causa_raiz: textoOpt(2000),
    sistema_afectado: sistemaOpt,
    trabajo_realizado: textoOpt(4000),
    resultado_pruebas: textoOpt(4000),
    recibido_por: textoOpt(100),
    horometro_salida: numNull(n().min(0, 'No puede ser negativo'))
  })
  .superRefine((d, ctx) => {
    if (d.accion === 'retornar' && !d.motivo_retorno)
      ctx.addIssue({ code: 'custom', path: ['motivo_retorno'], message: 'Indique el motivo del retorno' })
    if (d.destino === 'liberacion' && !d.recibido_por)
      ctx.addIssue({ code: 'custom', path: ['recibido_por'], message: 'Indique quién recibe el equipo' })
  })

export const cancelarSchema = z.object({
  orden_id: idReq(),
  fecha_hora: fechaHora,
  responsable_id: idReq('Seleccione el responsable'),
  motivo: texto(1000).min(5, 'Indique el motivo')
})

/** Clasificación de la orden: se edita en cualquier fase y no se reinicia. */
export const datosTecnicosSchema = z.object({
  orden_id: idReq(),
  prioridad: z.enum(PRIORIDADES),
  sistema_afectado: sistemaOpt,
  causa_raiz: textoOpt(2000)
})

/** Entrada de la bitácora técnica (se registra en la fase actual de la orden). */
export const bitacoraSchema = z
  .object({
    orden_id: idReq(),
    fecha_hora: fechaHora,
    responsable_id: idReq('Seleccione el responsable'),
    descripcion: texto(4000),
    ejecucion: z.enum(EJECUCIONES, { error: 'Indique quién realizó el trabajo' }),
    taller_externo: textoOpt(100)
  })
  .superRefine((d, ctx) => {
    if (d.ejecucion === 'externo' && !d.taller_externo)
      ctx.addIssue({ code: 'custom', path: ['taller_externo'], message: 'Indique el taller o proveedor externo' })
  })

export const ordenRepuestoSchema = z.object({
  orden_id: idReq(),
  repuesto_id: idReq('Seleccione el repuesto'),
  cantidad: num(n().positive('Debe ser mayor que 0')),
  costo_unitario: num(n().min(0, 'No puede ser negativo')),
  proveedor: textoOpt(100),
  numero_requisicion: textoOpt(40),
  solicitado_por_id: idReq('Seleccione quién solicita'),
  fecha_solicitud: fechaHora
})

export const accionRepuestoSchema = z
  .object({
    id: idReq(),
    accion: z.enum(['aprobar', 'rechazar', 'recibir']),
    responsable_id: idReq('Seleccione el responsable'),
    fecha_hora: fechaHora,
    motivo: textoOpt(500)
  })
  .superRefine((d, ctx) => {
    if (d.accion === 'rechazar' && !d.motivo)
      ctx.addIssue({ code: 'custom', path: ['motivo'], message: 'Indique el motivo del rechazo' })
  })

export const manoObraSchema = z.object({
  orden_id: idReq(),
  personal_id: idReq('Seleccione el técnico'),
  fase: z.enum(FASES, { error: 'Seleccione la fase' }),
  fecha,
  horas: num(n().positive('Debe ser mayor que 0').max(24, 'Máximo 24 h por registro')),
  descripcion: textoOpt(300)
})

// ---------- Configuración ----------

export const configExternoSchema = z.object({
  host: texto(200),
  puerto: num(n().int().min(1, 'Puerto inválido').max(65535, 'Puerto inválido')),
  baseDatos: texto(100),
  usuario: texto(100),
  password: z.string().default(''),
  ssl: bool.default(false)
})

// ---------- Utilidades ----------

/** Primer mensaje de error por campo (ruta unida con "."). */
export function erroresDeCampo(e: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const iss of e.issues) {
    const k = iss.path.join('.') || '_'
    if (!out[k]) out[k] = iss.message
  }
  return out
}

export type EquipoInput = z.output<typeof equipoSchema>
export type HorometroInput = z.output<typeof horometroSchema>
export type OrdenCrearInput = z.output<typeof ordenCrearSchema>
export type TransicionInput = z.output<typeof transicionSchema>
export type ConfigExternoInput = z.output<typeof configExternoSchema>
