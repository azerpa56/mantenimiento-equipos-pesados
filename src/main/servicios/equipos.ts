import type { Equipo, EstadoEquipo } from '@shared/dominio'
import { equipoSchema } from '@shared/esquemas'
import { consulta, transaccion } from '../db/conexion'
import { NoEncontrado, ReglaNegocio } from '../errores'
import type { Datos } from './catalogos'
import { recalcularEstado } from './estadoEquipo'

export const SELECT_EQUIPO = `
  SELECT e.*, c.nombre AS categoria, c.flota, f.nombre AS frente_actual,
         (SELECT COUNT(*) FROM ordenes_trabajo o WHERE o.equipo_id = e.id AND o.estado = 'abierta') AS ordenes_abiertas
  FROM equipos e
  JOIN categorias_equipo c ON c.id = e.categoria_id
  LEFT JOIN frentes_trabajo f ON f.id = e.frente_actual_id`

export async function listar(f: { texto?: string; estado?: string; categoria_id?: number; flota?: string } = {}): Promise<Equipo[]> {
  const cond: string[] = []
  const p: unknown[] = []
  if (f.texto) {
    p.push(`%${f.texto}%`)
    const x = `$${p.length}`
    cond.push(
      `(e.codigo_interno ILIKE ${x} OR e.numero_serie ILIKE ${x} OR e.placa ILIKE ${x} OR e.serial_motor ILIKE ${x}
        OR e.marca ILIKE ${x} OR e.modelo ILIKE ${x} OR c.nombre ILIKE ${x})`
    )
  }
  if (f.estado) {
    p.push(f.estado)
    cond.push(`e.estado = $${p.length}`)
  }
  if (f.categoria_id) {
    p.push(f.categoria_id)
    cond.push(`e.categoria_id = $${p.length}`)
  }
  if (f.flota) {
    p.push(f.flota)
    cond.push(`c.flota = $${p.length}`)
  }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : ''
  return consulta<Equipo>(`${SELECT_EQUIPO} ${where} ORDER BY e.codigo_interno`, p)
}

export async function obtener(id: number): Promise<Equipo> {
  const [e] = await consulta<Equipo>(`${SELECT_EQUIPO} WHERE e.id = $1`, [id])
  if (!e) throw new NoEncontrado('El equipo')
  return e
}

export async function crear(datos: Datos): Promise<Equipo> {
  const d = equipoSchema.parse(datos)
  const [r] = await consulta<{ id: number }>(
    `INSERT INTO equipos (codigo_interno, numero_serie, placa, serial_motor, capacidad, marca, modelo, anio, categoria_id,
                          horometro_actual, frente_actual_id, observaciones)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
    [d.codigo_interno, d.numero_serie, d.placa, d.serial_motor, d.capacidad, d.marca, d.modelo, d.anio, d.categoria_id,
     d.horometro_actual, d.frente_actual_id, d.observaciones]
  )
  return obtener(r.id)
}

export async function actualizar({ id, datos }: { id: number; datos: Datos }): Promise<Equipo> {
  const d = equipoSchema.parse(datos)
  await transaccion(async (c) => {
    const { rows } = await c.query('SELECT id FROM equipos WHERE id = $1 FOR UPDATE', [id])
    if (!rows[0]) throw new NoEncontrado('El equipo')
    const { rows: m } = await c.query<{ max: number | null }>(
      'SELECT MAX(horometro_final) AS max FROM horometros_diarios WHERE equipo_id = $1',
      [id]
    )
    if (m[0].max != null && d.horometro_actual < m[0].max)
      throw new ReglaNegocio(`No puede ser menor a la última lectura registrada (${m[0].max} h)`, 'horometro_actual')
    await c.query(
      `UPDATE equipos SET codigo_interno=$2, numero_serie=$3, placa=$4, serial_motor=$5, capacidad=$6, marca=$7, modelo=$8,
              anio=$9, categoria_id=$10, horometro_actual=$11, frente_actual_id=$12, observaciones=$13, actualizado_en=now()
       WHERE id = $1`,
      [id, d.codigo_interno, d.numero_serie, d.placa, d.serial_motor, d.capacidad, d.marca, d.modelo, d.anio,
       d.categoria_id, d.horometro_actual, d.frente_actual_id, d.observaciones]
    )
  })
  return obtener(id)
}

/** Solo operativo <-> fuera de servicio se cambia a mano; el resto lo derivan las OT. */
export async function cambiarEstado({ id, estado }: { id: number; estado: EstadoEquipo }): Promise<Equipo> {
  if (estado !== 'operativo' && estado !== 'fuera_servicio')
    throw new ReglaNegocio('Los estados "en mantenimiento" y "en reparación" se asignan automáticamente desde las órdenes de trabajo.')
  await transaccion(async (c) => {
    const { rows } = await c.query('SELECT id FROM equipos WHERE id = $1 FOR UPDATE', [id])
    if (!rows[0]) throw new NoEncontrado('El equipo')
    await c.query("UPDATE equipos SET estado = $2, actualizado_en = now() WHERE id = $1", [id, estado])
    // Si tiene OT abiertas con equipo detenido, ese estado prevalece.
    await recalcularEstado(c, id)
  })
  return obtener(id)
}

export async function eliminar(id: number): Promise<void> {
  const [u] = await consulta<{ ot: number; h: number }>(
    `SELECT (SELECT COUNT(*) FROM ordenes_trabajo WHERE equipo_id = $1) AS ot,
            (SELECT COUNT(*) FROM horometros_diarios WHERE equipo_id = $1) AS h`,
    [id]
  )
  if (u.ot > 0 || u.h > 0)
    throw new ReglaNegocio('El equipo tiene historial (órdenes u horómetros). Márquelo "fuera de servicio" en lugar de eliminarlo.')
  await consulta('DELETE FROM equipos WHERE id = $1', [id])
}
