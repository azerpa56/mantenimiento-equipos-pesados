import { ESTADOS_EQUIPO, FASES, type Dashboard, type EstadoEquipo, type Fase, type HistorialEquipo, type MetricasEquipo, type OrdenResumen } from '@shared/dominio'
import { consulta } from '../db/conexion'
import { NoEncontrado } from '../errores'
import { obtener as obtenerEquipo } from './equipos'
import { SELECT_RESUMEN, listar as listarOrdenes } from './ordenes'

export async function dashboard(): Promise<Dashboard> {
  const porEstado = Object.fromEntries(ESTADOS_EQUIPO.map((e) => [e, 0])) as Record<EstadoEquipo, number>
  for (const r of await consulta<{ estado: EstadoEquipo; n: number }>('SELECT estado, COUNT(*) AS n FROM equipos GROUP BY estado'))
    porEstado[r.estado] = r.n

  const porFase = Object.fromEntries(FASES.map((f) => [f, 0])) as Record<Fase, number>
  for (const r of await consulta<{ fase_actual: Fase; n: number }>(
    "SELECT fase_actual, COUNT(*) AS n FROM ordenes_trabajo WHERE estado = 'abierta' GROUP BY fase_actual"
  ))
    porFase[r.fase_actual] = r.n

  const ordenes_abiertas = await consulta<OrdenResumen>(
    `${SELECT_RESUMEN} WHERE o.estado = 'abierta'
     ORDER BY CASE o.prioridad WHEN 'critica' THEN 0 WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END, o.fecha_apertura
     LIMIT 15`
  )

  const [rep] = await consulta<{ n: number }>(
    `SELECT COUNT(*) AS n FROM orden_repuestos r JOIN ordenes_trabajo o ON o.id = r.orden_id
     WHERE o.estado = 'abierta' AND r.estado IN ('solicitado','aprobado')`
  )

  const [u30] = await consulta<Dashboard['ultimos_30']>(
    `SELECT COUNT(*) AS ordenes,
            COUNT(*) FILTER (WHERE o.estado = 'cerrada') AS cerradas,
            COALESCE(SUM(t.downtime_horas), 0) AS downtime_horas,
            COALESCE(SUM(t.costo_repuestos + t.costo_mano_obra), 0) AS costo
     FROM ordenes_trabajo o JOIN v_orden_totales t ON t.orden_id = o.id
     WHERE o.fecha_apertura >= now() - interval '30 days'`
  )

  const top = await consulta<Dashboard['top_downtime'][number]>(
    `SELECT e.id AS equipo_id, e.codigo_interno AS codigo, e.marca || ' ' || e.modelo AS descripcion,
            m.downtime_horas, m.total_fallas AS fallas
     FROM v_equipo_metricas m JOIN equipos e ON e.id = m.equipo_id
     WHERE m.downtime_horas > 0
     ORDER BY m.downtime_horas DESC LIMIT 5`
  )

  const total = Object.values(porEstado).reduce((a, b) => a + b, 0)
  return {
    equipos_por_estado: porEstado,
    total_equipos: total,
    ordenes_por_fase: porFase,
    ordenes_abiertas,
    repuestos_pendientes: rep.n,
    ultimos_30: u30,
    top_downtime: top
  }
}

export async function historialEquipo(id: number): Promise<HistorialEquipo> {
  const equipo = await obtenerEquipo(id)
  const [m] = await consulta<MetricasEquipo>('SELECT * FROM v_equipo_metricas WHERE equipo_id = $1', [id])
  if (!m) throw new NoEncontrado('El equipo')

  const fallas_por_sistema = await consulta<HistorialEquipo['fallas_por_sistema'][number]>(
    `SELECT o.sistema_afectado AS sistema, COUNT(*) AS cantidad, COALESCE(SUM(t.downtime_horas), 0) AS downtime_horas
     FROM ordenes_trabajo o JOIN v_orden_totales t ON t.orden_id = o.id
     WHERE o.equipo_id = $1 AND o.tipo IN ('correctivo','emergencia') AND o.estado <> 'cancelada'
     GROUP BY o.sistema_afectado ORDER BY cantidad DESC, downtime_horas DESC`,
    [id]
  )
  const repuestos_usados = await consulta<HistorialEquipo['repuestos_usados'][number]>(
    `SELECT x.codigo, x.descripcion, x.unidad, SUM(r.cantidad) AS cantidad, SUM(r.costo_total) AS costo
     FROM orden_repuestos r
     JOIN repuestos x ON x.id = r.repuesto_id
     JOIN ordenes_trabajo o ON o.id = r.orden_id
     WHERE o.equipo_id = $1 AND r.estado = 'recibido'
     GROUP BY x.codigo, x.descripcion, x.unidad ORDER BY costo DESC`,
    [id]
  )
  const uso_mensual = await consulta<HistorialEquipo['uso_mensual'][number]>(
    `SELECT to_char(fecha, 'YYYY-MM') AS mes, SUM(horas_trabajadas) AS horas
     FROM horometros_diarios
     WHERE equipo_id = $1 AND fecha >= (date_trunc('month', current_date) - interval '11 months')
     GROUP BY 1 ORDER BY 1`,
    [id]
  )
  return {
    equipo,
    metricas: m,
    ordenes: await listarOrdenes({ equipo_id: id }),
    fallas_por_sistema,
    repuestos_usados,
    uso_mensual
  }
}
