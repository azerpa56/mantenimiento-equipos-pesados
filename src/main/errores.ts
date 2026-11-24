import { ZodError } from 'zod'
import { erroresDeCampo } from '@shared/esquemas'

/** Error de regla de negocio: el mensaje se muestra tal cual al usuario. */
export class ReglaNegocio extends Error {
  constructor(
    mensaje: string,
    public campo?: string,
    public campos?: Record<string, string>
  ) {
    super(mensaje)
  }
}

export class NoEncontrado extends ReglaNegocio {
  constructor(que = 'El registro') {
    super(`${que} no existe o fue eliminado.`)
  }
}

export type Resultado<T> = { ok: true; data: T } | { ok: false; error: string; campos?: Record<string, string> }

// Restricciones UNIQUE -> [campo, mensaje]
const UNICOS: Record<string, [string, string]> = {
  equipos_codigo_interno_key: ['codigo_interno', 'Ya existe un equipo con ese código interno'],
  equipos_numero_serie_key: ['numero_serie', 'Ya existe un equipo con ese número de serie'],
  equipos_placa_key: ['placa', 'Ya existe un equipo con esa placa'],
  repuestos_codigo_key: ['codigo', 'Ya existe un repuesto con ese código'],
  categorias_equipo_nombre_key: ['nombre', 'Ya existe una categoría con ese nombre'],
  frentes_trabajo_nombre_key: ['nombre', 'Ya existe un frente con ese nombre']
}

export function traducirError(e: unknown): { ok: false; error: string; campos?: Record<string, string> } {
  if (e instanceof ZodError) {
    return { ok: false, error: 'Revise los datos marcados', campos: erroresDeCampo(e) }
  }
  if (e instanceof ReglaNegocio) {
    return { ok: false, error: e.message, campos: e.campos ?? (e.campo ? { [e.campo]: e.message } : undefined) }
  }
  const pg = e as { code?: string; constraint?: string; message?: string }
  if (pg?.code === '23505') {
    const u = pg.constraint ? UNICOS[pg.constraint] : undefined
    if (u) return { ok: false, error: u[1], campos: { [u[0]]: u[1] } }
    return { ok: false, error: 'Ya existe un registro con esos datos' }
  }
  if (pg?.code === '23503') {
    return { ok: false, error: 'No se puede completar: el registro está vinculado a otros datos.' }
  }
  if (pg?.code === '23514') {
    return { ok: false, error: `Dato fuera del rango permitido (${pg.constraint ?? 'restricción'})` }
  }
  if (pg?.code === 'ECONNREFUSED' || pg?.code === 'ENOTFOUND' || pg?.code === '57P01') {
    return { ok: false, error: 'Se perdió la conexión con la base de datos.' }
  }
  console.error(e)
  return { ok: false, error: pg?.message ?? 'Error inesperado' }
}
