import type { Equipo, HorometroDiario } from '@shared/dominio'
import { erroresDeCampo, horometroSchema, type HorometroInput } from '@shared/esquemas'
import { consulta, transaccion, type Cliente } from '../db/conexion'
import { NoEncontrado, ReglaNegocio } from '../errores'
import type { Datos } from './catalogos'
import { SELECT_EQUIPO } from './equipos'

const SELECT = `
  SELECT h.*, e.codigo_interno AS equipo_codigo, f.nombre AS frente
  FROM horometros_diarios h
  JOIN equipos e ON e.id = h.equipo_id
  LEFT JOIN frentes_trabajo f ON f.id = h.frente_id`

export async function listar(
  f: { equipo_id?: number; frente_id?: number; desde?: string; hasta?: string } = {}
): Promise<HorometroDiario[]> {
  const cond: string[] = []
  const p: unknown[] = []
  const add = (sql: string, v: unknown) => {
    p.push(v)
    cond.push(sql.replace('?', `$${p.length}`))
  }
  if (f.equipo_id) add('h.equipo_id = ?', f.equipo_id)
  if (f.frente_id) add('h.frente_id = ?', f.frente_id)
  if (f.desde) add('h.fecha >= ?', f.desde)
  if (f.hasta) add('h.fecha <= ?', f.hasta)
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : ''
  return consulta<HorometroDiario>(`${SELECT} ${where} ORDER BY h.fecha DESC, e.codigo_interno, h.horometro_inicial DESC LIMIT 1000`, p)
}

/** Equipos con su horómetro actual y lo ya registrado en la fecha, para el parte diario. */
export async function parteDiario(fecha: string): Promise<{ equipos: Equipo[]; registros: HorometroDiario[] }> {
  const equipos = await consulta<Equipo>(`${SELECT_EQUIPO} WHERE e.estado <> 'fuera_servicio' ORDER BY e.codigo_interno`)
  const registros = await consulta<HorometroDiario>(`${SELECT} WHERE h.fecha = $1 ORDER BY e.codigo_interno`, [fecha])
  return { equipos, registros }
}

async function registrarEn(c: Cliente, d: HorometroInput): Promise<number> {
  const { rows: eq } = await c.query<{ codigo_interno: string }>(
    'SELECT codigo_interno FROM equipos WHERE id = $1 FOR UPDATE',
    [d.equipo_id]
  )
  if (!eq[0]) throw new NoEncontrado('El equipo')

  // Las lecturas deben crecer con el tiempo y no solaparse con otros turnos.
  const { rows: choque } = await c.query<{ fecha: string; horometro_inicial: number; horometro_final: number }>(
    `SELECT fecha, horometro_inicial, horometro_final FROM horometros_diarios
     WHERE equipo_id = $1 AND (
           (horometro_inicial < $3 AND horometro_final > $2)
        OR (fecha < $4 AND horometro_final > $2)
        OR (fecha > $4 AND horometro_inicial < $3))
     ORDER BY fecha LIMIT 1`,
    [d.equipo_id, d.horometro_inicial, d.horometro_final, d.fecha]
  )
  if (choque[0]) {
    const x = choque[0]
    throw new ReglaNegocio(
      `${eq[0].codigo_interno}: choca con el registro del ${x.fecha} (${x.horometro_inicial} – ${x.horometro_final} h). ` +
        'Las lecturas deben ser crecientes en el tiempo y no solaparse.',
      'horometro_inicial'
    )
  }

  const { rows } = await c.query<{ id: number }>(
    `INSERT INTO horometros_diarios (equipo_id, fecha, horometro_inicial, horometro_final, frente_id, actividad, operador, observaciones)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [d.equipo_id, d.fecha, d.horometro_inicial, d.horometro_final, d.frente_id, d.actividad, d.operador, d.observaciones]
  )
  // El frente actual del equipo sigue al registro más reciente.
  await c.query(
    `UPDATE equipos SET horometro_actual = GREATEST(horometro_actual, $2),
            frente_actual_id = CASE WHEN $3::int IS NOT NULL AND $4::date >= COALESCE(
                (SELECT MAX(fecha) FROM horometros_diarios WHERE equipo_id = $1), $4::date)
              THEN $3::int ELSE frente_actual_id END,
            actualizado_en = now()
     WHERE id = $1`,
    [d.equipo_id, d.horometro_final, d.frente_id, d.fecha]
  )
  return rows[0].id
}

export async function registrar(datos: Datos): Promise<HorometroDiario> {
  const d = horometroSchema.parse(datos)
  const id = await transaccion((c) => registrarEn(c, d))
  return (await consulta<HorometroDiario>(`${SELECT} WHERE h.id = $1`, [id]))[0]
}

/** Parte diario: todo o nada. Los errores vuelven indexados como "fila.campo". */
export async function registrarLote(items: Datos[]): Promise<number> {
  if (!items.length) throw new ReglaNegocio('No hay lecturas para registrar.')
  const validos: HorometroInput[] = []
  const campos: Record<string, string> = {}
  items.forEach((it, i) => {
    const r = horometroSchema.safeParse(it)
    if (r.success) validos.push(r.data)
    else for (const [k, v] of Object.entries(erroresDeCampo(r.error))) campos[`${i}.${k}`] = v
  })
  if (Object.keys(campos).length) throw new ReglaNegocio('Revise las filas marcadas', undefined, campos)
  await transaccion(async (c) => {
    for (const [i, d] of validos.entries()) {
      try {
        await registrarEn(c, d)
      } catch (e) {
        if (e instanceof ReglaNegocio) throw new ReglaNegocio(e.message, `${i}.${e.campo ?? 'horometro_final'}`)
        throw e
      }
    }
  })
  return validos.length
}

/** Solo se puede eliminar la última lectura de un equipo (para no dejar huecos). */
export async function eliminar(id: number): Promise<void> {
  await transaccion(async (c) => {
    const { rows } = await c.query<{ equipo_id: number; horometro_inicial: number; horometro_final: number }>(
      'SELECT equipo_id, horometro_inicial, horometro_final FROM horometros_diarios WHERE id = $1',
      [id]
    )
    const h = rows[0]
    if (!h) throw new NoEncontrado('El registro')
    const { rows: eq } = await c.query<{ horometro_actual: number }>(
      'SELECT horometro_actual FROM equipos WHERE id = $1 FOR UPDATE',
      [h.equipo_id]
    )
    const { rows: pos } = await c.query(
      'SELECT 1 FROM horometros_diarios WHERE equipo_id = $1 AND horometro_final > $2 LIMIT 1',
      [h.equipo_id, h.horometro_final]
    )
    if (pos[0]) throw new ReglaNegocio('Solo se puede eliminar la lectura más reciente del equipo.')
    await c.query('DELETE FROM horometros_diarios WHERE id = $1', [id])
    if (eq[0].horometro_actual === h.horometro_final)
      await c.query('UPDATE equipos SET horometro_actual = $2, actualizado_en = now() WHERE id = $1', [h.equipo_id, h.horometro_inicial])
  })
}
