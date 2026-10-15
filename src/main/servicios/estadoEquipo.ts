import type { Cliente } from '../db/conexion'

/**
 * El estado de un equipo se deriva de sus OT abiertas con equipo detenido:
 * alguna correctiva/emergencia -> en_reparacion; solo preventivas -> en_mantenimiento.
 * Sin OT abiertas vuelve a operativo, salvo que esté marcado fuera de servicio a mano.
 */
export async function recalcularEstado(c: Cliente, equipoId: number): Promise<void> {
  const { rows } = await c.query<{ total: number; reparaciones: number }>(
    `SELECT COUNT(*) AS total,
            COUNT(*) FILTER (WHERE tipo IN ('correctivo','emergencia')) AS reparaciones
     FROM ordenes_trabajo
     WHERE equipo_id = $1 AND estado = 'abierta' AND equipo_detenido`,
    [equipoId]
  )
  const { total, reparaciones } = rows[0]
  if (total > 0) {
    await c.query('UPDATE equipos SET estado = $2, actualizado_en = now() WHERE id = $1', [
      equipoId,
      reparaciones > 0 ? 'en_reparacion' : 'en_mantenimiento'
    ])
  } else {
    await c.query(
      `UPDATE equipos SET estado = 'operativo', actualizado_en = now()
       WHERE id = $1 AND estado IN ('en_mantenimiento','en_reparacion')`,
      [equipoId]
    )
  }
}

export async function subirHorometro(c: Cliente, equipoId: number, valor: number | null): Promise<void> {
  if (valor == null) return
  await c.query(
    'UPDATE equipos SET horometro_actual = GREATEST(horometro_actual, $2), actualizado_en = now() WHERE id = $1',
    [equipoId, valor]
  )
}
