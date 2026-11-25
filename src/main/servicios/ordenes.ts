import {
  FASE_INFO,
  FASES_CON_REPUESTOS,
  REQUISITO_SALIDA,
  validarTransicion,
  type EntradaBitacora,
  type EstadoOrden,
  type Fase,
  type FaseOrden,
  type ManoObra,
  type OrdenDetalle,
  type OrdenRepuesto,
  type OrdenResumen
} from '@shared/dominio'
import {
  accionRepuestoSchema,
  bitacoraSchema,
  cancelarSchema,
  datosTecnicosSchema,
  manoObraSchema,
  ordenCrearSchema,
  ordenRepuestoSchema,
  transicionSchema
} from '@shared/esquemas'
import { consulta, transaccion, type Cliente } from '../db/conexion'
import { NoEncontrado, ReglaNegocio } from '../errores'
import { asegurarPersonal, type Datos } from './catalogos'
import { recalcularEstado, subirHorometro } from './estadoEquipo'

export const SELECT_RESUMEN = `
  SELECT o.id, o.folio, o.equipo_id, e.codigo_interno AS equipo_codigo,
         e.marca || ' ' || e.modelo AS equipo_descripcion,
         o.tipo, o.prioridad, o.descripcion, o.sistema_afectado, o.fase_actual, o.estado,
         o.equipo_detenido, o.fecha_apertura, o.fecha_cierre,
         (SELECT p.nombre FROM fases_orden f JOIN personal p ON p.id = f.responsable_id
           WHERE f.orden_id = o.id AND f.fin IS NULL) AS responsable_actual,
         (t.costo_repuestos + t.costo_mano_obra) AS costo_total,
         t.downtime_horas, cat.flota
  FROM ordenes_trabajo o
  JOIN equipos e ON e.id = o.equipo_id
  JOIN categorias_equipo cat ON cat.id = e.categoria_id
  JOIN v_orden_totales t ON t.orden_id = o.id`

const ORDEN_PRIORIDAD = `CASE o.prioridad WHEN 'critica' THEN 0 WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END`

export async function listar(
  f: { estado?: string; fase?: string; tipo?: string; equipo_id?: number; texto?: string; flota?: string } = {}
): Promise<OrdenResumen[]> {
  const cond: string[] = []
  const p: unknown[] = []
  const add = (sql: string, v: unknown) => {
    p.push(v)
    cond.push(sql.replaceAll('?', `$${p.length}`))
  }
  if (f.estado) add('o.estado = ?', f.estado)
  if (f.fase) add('o.fase_actual = ?', f.fase)
  if (f.tipo) add('o.tipo = ?', f.tipo)
  if (f.equipo_id) add('o.equipo_id = ?', f.equipo_id)
  if (f.flota) add('cat.flota = ?', f.flota)
  if (f.texto) add('(o.folio ILIKE ? OR e.codigo_interno ILIKE ? OR o.descripcion ILIKE ?)', `%${f.texto}%`)
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : ''
  return consulta<OrdenResumen>(
    `${SELECT_RESUMEN} ${where}
     ORDER BY (o.estado = 'abierta') DESC, ${ORDEN_PRIORIDAD}, o.fecha_apertura DESC
     LIMIT 500`,
    p
  )
}

export async function obtener(id: number): Promise<OrdenDetalle> {
  const [o] = await consulta<OrdenDetalle & Record<string, unknown>>(
    `SELECT r.*, o.solicitado_por, o.horometro_ingreso, o.horometro_salida, o.diagnostico, o.causa_raiz,
            o.trabajo_realizado, o.resultado_pruebas, o.recibido_por, o.motivo_cancelacion,
            json_build_object('codigo_interno', e.codigo_interno, 'numero_serie', e.numero_serie, 'placa', e.placa, 'marca', e.marca,
                              'modelo', e.modelo, 'anio', e.anio, 'categoria', c.nombre,
                              'horometro_actual', e.horometro_actual, 'estado', e.estado) AS equipo,
            json_build_object('costo_repuestos', t.costo_repuestos, 'costo_mano_obra', t.costo_mano_obra,
                              'horas_hombre', t.horas_hombre, 'downtime_horas', t.downtime_horas,
                              'horas_reparacion', t.horas_reparacion) AS totales
     FROM (${SELECT_RESUMEN} WHERE o.id = $1) r
     JOIN ordenes_trabajo o ON o.id = r.id
     JOIN equipos e ON e.id = o.equipo_id
     JOIN categorias_equipo c ON c.id = e.categoria_id
     JOIN v_orden_totales t ON t.orden_id = o.id`,
    [id]
  )
  if (!o) throw new NoEncontrado('La orden de trabajo')

  o.fases = await consulta<FaseOrden>(
    `SELECT f.*, p.nombre AS responsable, q.nombre AS cerrado_por
     FROM fases_orden f
     JOIN personal p ON p.id = f.responsable_id
     LEFT JOIN personal q ON q.id = f.cerrado_por_id
     WHERE f.orden_id = $1 ORDER BY f.secuencia`,
    [id]
  )
  o.repuestos = await consulta<OrdenRepuesto>(
    `SELECT r.*, x.codigo, x.descripcion, x.unidad,
            ps.nombre AS solicitado_por, pa.nombre AS aprobado_por, pr.nombre AS recibido_por
     FROM orden_repuestos r
     JOIN repuestos x ON x.id = r.repuesto_id
     JOIN personal ps ON ps.id = r.solicitado_por_id
     LEFT JOIN personal pa ON pa.id = r.aprobado_por_id
     LEFT JOIN personal pr ON pr.id = r.recibido_por_id
     WHERE r.orden_id = $1 ORDER BY r.id`,
    [id]
  )
  o.mano_obra = await consulta<ManoObra>(
    `SELECT m.*, p.nombre AS personal FROM orden_mano_obra m JOIN personal p ON p.id = m.personal_id
     WHERE m.orden_id = $1 ORDER BY m.fecha, m.id`,
    [id]
  )
  o.bitacora = await consulta<EntradaBitacora>(
    `SELECT b.*, p.nombre AS responsable FROM orden_bitacora b LEFT JOIN personal p ON p.id = b.responsable_id
     WHERE b.orden_id = $1 ORDER BY b.fecha_hora, b.id`,
    [id]
  )
  return o
}

// ---------- Bitácora técnica ----------

/** Fase de la bitácora -> columna resumen de la orden (la usan el requisito de salida y los listados). */
const RESUMEN_FASE = { diagnostico: 'diagnostico', ejecucion: 'trabajo_realizado', pruebas: 'resultado_pruebas' } as const

/** Recalcula los textos resumen de la orden a partir de su bitácora. */
async function sincronizarResumen(c: Cliente, ordenId: number) {
  const sets = Object.entries(RESUMEN_FASE).map(
    ([fase, col]) =>
      `${col} = (SELECT string_agg(descripcion || CASE WHEN ejecucion = 'externo' THEN ' [Externo: ' || taller_externo || ']' ELSE '' END,
                                   E'\\n\\n' ORDER BY fecha_hora, id)
                 FROM orden_bitacora WHERE orden_id = $1 AND fase = '${fase}')`
  )
  await c.query(`UPDATE ordenes_trabajo SET ${sets.join(', ')}, actualizado_en = now() WHERE id = $1`, [ordenId])
}

async function insertarBitacora(
  c: Cliente,
  e: { orden_id: number; fase: Fase; fecha_hora: Date; responsable_id: number | null; descripcion: string; ejecucion?: string; taller_externo?: string | null }
) {
  await c.query(
    `INSERT INTO orden_bitacora (orden_id, fase, fecha_hora, responsable_id, descripcion, ejecucion, taller_externo)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [e.orden_id, e.fase, e.fecha_hora, e.responsable_id, e.descripcion, e.ejecucion ?? 'interno',
     e.ejecucion === 'externo' ? e.taller_externo : null]
  )
}

export async function agregarBitacora(datos: Datos): Promise<OrdenDetalle> {
  const d = bitacoraSchema.parse(datos)
  await transaccion(async (c) => {
    const o = await bloquearOrden(c, d.orden_id)
    if (d.fecha_hora < o.fecha_apertura)
      throw new ReglaNegocio(`No puede ser anterior a la apertura de la orden (${fmt(o.fecha_apertura)}).`, 'fecha_hora')
    await asegurarPersonal(c, d.responsable_id)
    await insertarBitacora(c, { ...d, fase: o.fase_actual })
    await sincronizarResumen(c, o.id)
  })
  return obtener(d.orden_id)
}

/** Solo se quitan entradas de la fase en curso: lo de fases cerradas queda como trazabilidad. */
export async function eliminarBitacora(id: number): Promise<OrdenDetalle> {
  const ordenId = await transaccion(async (c) => {
    const { rows } = await c.query<{ orden_id: number; fase: Fase }>('SELECT orden_id, fase FROM orden_bitacora WHERE id = $1', [id])
    if (!rows[0]) throw new NoEncontrado('La entrada de la bitácora')
    const o = await bloquearOrden(c, rows[0].orden_id)
    if (rows[0].fase !== o.fase_actual)
      throw new ReglaNegocio('Solo se pueden quitar entradas de la fase en curso.')
    await c.query('DELETE FROM orden_bitacora WHERE id = $1', [id])
    await sincronizarResumen(c, o.id)
    return o.id
  })
  return obtener(ordenId)
}

// ---------- Helpers de transacción ----------

interface OrdenFila {
  id: number
  equipo_id: number
  estado: EstadoOrden
  fase_actual: Fase
  fecha_apertura: Date
  horometro_ingreso: number | null
  diagnostico: string | null
  causa_raiz: string | null
  sistema_afectado: string | null
  trabajo_realizado: string | null
  resultado_pruebas: string | null
}

async function bloquearOrden(c: Cliente, id: number, exigirAbierta = true): Promise<OrdenFila> {
  const { rows } = await c.query<OrdenFila>('SELECT * FROM ordenes_trabajo WHERE id = $1 FOR UPDATE', [id])
  const o = rows[0]
  if (!o) throw new NoEncontrado('La orden de trabajo')
  if (exigirAbierta && o.estado !== 'abierta') throw new ReglaNegocio(`La orden está ${o.estado}; ya no admite cambios.`)
  return o
}

async function siguienteFolio(c: Cliente, anio: number): Promise<string> {
  const clave = `OT-${anio}`
  const { rows } = await c.query<{ valor: number }>(
    `INSERT INTO secuencias (clave, valor) VALUES ($1, 1)
     ON CONFLICT (clave) DO UPDATE SET valor = secuencias.valor + 1
     RETURNING valor`,
    [clave]
  )
  return `${clave}-${String(rows[0].valor).padStart(5, '0')}`
}

async function repuestosPendientes(c: Cliente, ordenId: number): Promise<number> {
  const { rows } = await c.query<{ n: number }>(
    "SELECT COUNT(*) AS n FROM orden_repuestos WHERE orden_id = $1 AND estado IN ('solicitado','aprobado')",
    [ordenId]
  )
  return rows[0].n
}

const fmt = (d: Date) => d.toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' })

// ---------- Crear ----------

export async function crear(datos: Datos): Promise<OrdenDetalle> {
  const d = ordenCrearSchema.parse(datos)
  const id = await transaccion(async (c) => {
    const { rows: eq } = await c.query<{ estado: string }>('SELECT estado FROM equipos WHERE id = $1 FOR UPDATE', [d.equipo_id])
    if (!eq[0]) throw new NoEncontrado('El equipo')
    await asegurarPersonal(c, d.responsable_id)
    const folio = await siguienteFolio(c, d.fecha_apertura.getFullYear())
    const { rows } = await c.query<{ id: number }>(
      `INSERT INTO ordenes_trabajo (folio, equipo_id, tipo, prioridad, descripcion, sistema_afectado, solicitado_por,
                                    horometro_ingreso, equipo_detenido, fecha_apertura)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [folio, d.equipo_id, d.tipo, d.prioridad, d.descripcion, d.sistema_afectado, d.solicitado_por,
       d.horometro_ingreso, d.equipo_detenido, d.fecha_apertura]
    )
    const ordenId = rows[0].id
    await c.query(
      `INSERT INTO fases_orden (orden_id, fase, secuencia, inicio, responsable_id, observaciones)
       VALUES ($1, 'recepcion', 1, $2, $3, $4)`,
      [ordenId, d.fecha_apertura, d.responsable_id, d.observaciones]
    )
    await subirHorometro(c, d.equipo_id, d.horometro_ingreso)
    await recalcularEstado(c, d.equipo_id)
    return ordenId
  })
  return obtener(id)
}

// ---------- Transición de fase ----------

export async function transicionar(datos: Datos): Promise<OrdenDetalle> {
  const d = transicionSchema.parse(datos)
  await transaccion(async (c) => {
    const o = await bloquearOrden(c, d.orden_id)
    const actual = o.fase_actual
    if (!validarTransicion(actual, d.accion, d.destino))
      throw new ReglaNegocio(`Transición no permitida: ${FASE_INFO[actual].corto} → ${FASE_INFO[d.destino].corto}.`)

    const { rows: ab } = await c.query<{ id: number; secuencia: number; inicio: Date }>(
      'SELECT id, secuencia, inicio FROM fases_orden WHERE orden_id = $1 AND fin IS NULL',
      [o.id]
    )
    const abierta = ab[0]
    if (!abierta) throw new ReglaNegocio('La orden no tiene una fase abierta (dato inconsistente).')
    if (d.fecha_hora < abierta.inicio)
      throw new ReglaNegocio(`No puede ser anterior al inicio de la fase actual (${fmt(abierta.inicio)}).`, 'fecha_hora')

    await asegurarPersonal(c, d.cerrado_por_id)
    await asegurarPersonal(c, d.responsable_id)

    // El texto técnico que venga en la transición se agrega a la bitácora de la fase que se cierra.
    const req = REQUISITO_SALIDA[actual]
    const texto = req ? d[req.campo] : null
    if (req && texto) {
      await insertarBitacora(c, { orden_id: o.id, fase: actual, fecha_hora: d.fecha_hora, responsable_id: d.cerrado_por_id, descripcion: texto })
      await sincronizarResumen(c, o.id)
    }
    const { rows: res } = await c.query<Record<string, string | null>>(
      'SELECT diagnostico, trabajo_realizado, resultado_pruebas FROM ordenes_trabajo WHERE id = $1',
      [o.id]
    )

    if (d.accion !== 'retornar') {
      if (req && !res[0][req.campo])
        throw new ReglaNegocio(`Registre "${req.etiqueta}" en la bitácora para cerrar la fase ${FASE_INFO[actual].corto}.`, req.campo)
      if (d.destino === 'ejecucion' || d.destino === 'pruebas') {
        const n = await repuestosPendientes(c, o.id)
        if (n > 0)
          throw new ReglaNegocio(
            `Hay ${n} repuesto(s) sin aprobar o sin recibir. Recíbalos o recházelos antes de pasar a ${FASE_INFO[d.destino].corto}.`
          )
      }
    }

    const cierra = d.destino === 'liberacion'
    if (cierra && d.horometro_salida != null && o.horometro_ingreso != null && d.horometro_salida < o.horometro_ingreso)
      throw new ReglaNegocio(`No puede ser menor al horómetro de ingreso (${o.horometro_ingreso} h).`, 'horometro_salida')

    // 1) Cerrar la fase actual.
    await c.query(
      `UPDATE fases_orden SET fin = $2, cerrado_por_id = $3,
              observaciones = NULLIF(concat_ws(E'\\n', observaciones, $4::text), '')
       WHERE id = $1`,
      [abierta.id, d.fecha_hora, d.cerrado_por_id, d.observaciones]
    )
    let sec = abierta.secuencia
    // 2) Procura omitida: queda registrada con duración cero.
    if (d.accion === 'omitir_procura') {
      sec++
      await c.query(
        `INSERT INTO fases_orden (orden_id, fase, secuencia, inicio, fin, responsable_id, cerrado_por_id, omitida, observaciones)
         VALUES ($1, 'procura', $2, $3, $3, $4, $4, TRUE, 'Sin repuestos requeridos')`,
        [o.id, sec, d.fecha_hora, d.cerrado_por_id]
      )
    }
    // 3) Abrir la fase destino (la liberación se abre y se cierra en el mismo acto).
    sec++
    await c.query(
      `INSERT INTO fases_orden (orden_id, fase, secuencia, inicio, fin, responsable_id, cerrado_por_id, motivo_retorno)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [o.id, d.destino, sec, d.fecha_hora, cierra ? d.fecha_hora : null, d.responsable_id,
       cierra ? d.responsable_id : null, d.accion === 'retornar' ? d.motivo_retorno : null]
    )
    // 4) Actualizar la orden.
    await c.query(
      `UPDATE ordenes_trabajo SET fase_actual = $2, causa_raiz = $3, sistema_afectado = $4,
              estado = CASE WHEN $5 THEN 'cerrada' ELSE estado END,
              fecha_cierre = CASE WHEN $5 THEN $6::timestamptz ELSE fecha_cierre END,
              recibido_por = CASE WHEN $5 THEN $7 ELSE recibido_por END,
              horometro_salida = CASE WHEN $5 THEN $8::numeric ELSE horometro_salida END,
              actualizado_en = now()
       WHERE id = $1`,
      [o.id, d.destino, d.causa_raiz ?? o.causa_raiz, d.sistema_afectado ?? o.sistema_afectado,
       cierra, d.fecha_hora, d.recibido_por, d.horometro_salida]
    )
    if (cierra) await subirHorometro(c, o.equipo_id, d.horometro_salida)
    await recalcularEstado(c, o.equipo_id)
  })
  return obtener(d.orden_id)
}

export async function cancelar(datos: Datos): Promise<OrdenDetalle> {
  const d = cancelarSchema.parse(datos)
  await transaccion(async (c) => {
    const o = await bloquearOrden(c, d.orden_id)
    await asegurarPersonal(c, d.responsable_id)
    const { rows } = await c.query<{ id: number; inicio: Date }>(
      'SELECT id, inicio FROM fases_orden WHERE orden_id = $1 AND fin IS NULL',
      [o.id]
    )
    if (rows[0] && d.fecha_hora < rows[0].inicio)
      throw new ReglaNegocio(`No puede ser anterior al inicio de la fase actual (${fmt(rows[0].inicio)}).`, 'fecha_hora')
    if (rows[0])
      await c.query(
        `UPDATE fases_orden SET fin = $2, cerrado_por_id = $3,
                observaciones = concat_ws(E'\\n', observaciones, 'ORDEN CANCELADA: ' || $4::text)
         WHERE id = $1`,
        [rows[0].id, d.fecha_hora, d.responsable_id, d.motivo]
      )
    await c.query(
      `UPDATE orden_repuestos SET estado = 'rechazado', motivo_rechazo = 'Orden cancelada',
              fecha_aprobacion = COALESCE(fecha_aprobacion, $2), aprobado_por_id = COALESCE(aprobado_por_id, $3)
       WHERE orden_id = $1 AND estado IN ('solicitado','aprobado')`,
      [o.id, d.fecha_hora, d.responsable_id]
    )
    await c.query(
      `UPDATE ordenes_trabajo SET estado = 'cancelada', fecha_cierre = $2, motivo_cancelacion = $3, actualizado_en = now()
       WHERE id = $1`,
      [o.id, d.fecha_hora, d.motivo]
    )
    await recalcularEstado(c, o.equipo_id)
  })
  return obtener(d.orden_id)
}

export async function guardarDatosTecnicos(datos: Datos): Promise<OrdenDetalle> {
  const d = datosTecnicosSchema.parse(datos)
  await transaccion(async (c) => {
    await bloquearOrden(c, d.orden_id)
    await c.query(
      `UPDATE ordenes_trabajo SET prioridad = $2, sistema_afectado = $3, causa_raiz = $4, actualizado_en = now()
       WHERE id = $1`,
      [d.orden_id, d.prioridad, d.sistema_afectado, d.causa_raiz]
    )
  })
  return obtener(d.orden_id)
}

// ---------- Repuestos de la orden (procura) ----------

export async function agregarRepuesto(datos: Datos): Promise<OrdenDetalle> {
  const d = ordenRepuestoSchema.parse(datos)
  await transaccion(async (c) => {
    const o = await bloquearOrden(c, d.orden_id)
    if (!FASES_CON_REPUESTOS.includes(o.fase_actual))
      throw new ReglaNegocio('Los repuestos se solicitan a partir de la fase de Diagnóstico.')
    if (d.fecha_solicitud < o.fecha_apertura)
      throw new ReglaNegocio(`No puede ser anterior a la apertura de la orden (${fmt(o.fecha_apertura)}).`, 'fecha_solicitud')
    await asegurarPersonal(c, d.solicitado_por_id)
    const { rows } = await c.query<{ activo: boolean }>('SELECT activo FROM repuestos WHERE id = $1', [d.repuesto_id])
    if (!rows[0]) throw new NoEncontrado('El repuesto')
    if (!rows[0].activo) throw new ReglaNegocio('El repuesto está inactivo en el catálogo.', 'repuesto_id')
    await c.query(
      `INSERT INTO orden_repuestos (orden_id, repuesto_id, cantidad, costo_unitario, proveedor, numero_requisicion, solicitado_por_id, fecha_solicitud)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [d.orden_id, d.repuesto_id, d.cantidad, d.costo_unitario, d.proveedor, d.numero_requisicion, d.solicitado_por_id, d.fecha_solicitud]
    )
  })
  return obtener(d.orden_id)
}

export async function accionRepuesto(datos: Datos): Promise<OrdenDetalle> {
  const d = accionRepuestoSchema.parse(datos)
  const ordenId = await transaccion(async (c) => {
    const { rows } = await c.query<{ orden_id: number; estado: string; fecha_solicitud: Date; fecha_aprobacion: Date | null }>(
      'SELECT orden_id, estado, fecha_solicitud, fecha_aprobacion FROM orden_repuestos WHERE id = $1 FOR UPDATE',
      [d.id]
    )
    const r = rows[0]
    if (!r) throw new NoEncontrado('El repuesto de la orden')
    await bloquearOrden(c, r.orden_id)
    await asegurarPersonal(c, d.responsable_id)

    const permitido = { aprobar: ['solicitado'], rechazar: ['solicitado', 'aprobado'], recibir: ['aprobado'] }[d.accion]
    if (!permitido.includes(r.estado))
      throw new ReglaNegocio(
        d.accion === 'recibir'
          ? 'El repuesto debe estar aprobado antes de recibirlo.'
          : d.accion === 'aprobar'
            ? 'Solo se aprueban repuestos en estado "solicitado".'
            : 'Solo se rechazan repuestos solicitados o aprobados (aún no recibidos).'
      )
    const desde = d.accion === 'recibir' ? (r.fecha_aprobacion ?? r.fecha_solicitud) : r.fecha_solicitud
    const que = d.accion === 'recibir' ? 'la aprobación' : 'la solicitud'
    if (d.fecha_hora < desde) throw new ReglaNegocio(`No puede ser anterior a ${que} (${fmt(desde)}).`, 'fecha_hora')

    if (d.accion === 'aprobar') {
      await c.query(
        "UPDATE orden_repuestos SET estado = 'aprobado', fecha_aprobacion = $2, aprobado_por_id = $3 WHERE id = $1",
        [d.id, d.fecha_hora, d.responsable_id]
      )
    } else if (d.accion === 'rechazar') {
      await c.query(
        "UPDATE orden_repuestos SET estado = 'rechazado', fecha_aprobacion = $2, aprobado_por_id = $3, motivo_rechazo = $4 WHERE id = $1",
        [d.id, d.fecha_hora, d.responsable_id, d.motivo]
      )
    } else {
      await c.query(
        "UPDATE orden_repuestos SET estado = 'recibido', fecha_llegada = $2, recibido_por_id = $3 WHERE id = $1",
        [d.id, d.fecha_hora, d.responsable_id]
      )
    }
    return r.orden_id
  })
  return obtener(ordenId)
}

export async function eliminarRepuesto(id: number): Promise<OrdenDetalle> {
  const ordenId = await transaccion(async (c) => {
    const { rows } = await c.query<{ orden_id: number; estado: string }>(
      'SELECT orden_id, estado FROM orden_repuestos WHERE id = $1 FOR UPDATE',
      [id]
    )
    if (!rows[0]) throw new NoEncontrado('El repuesto de la orden')
    await bloquearOrden(c, rows[0].orden_id)
    if (rows[0].estado !== 'solicitado')
      throw new ReglaNegocio('Solo se puede quitar un repuesto en estado "solicitado". Si ya fue aprobado, recházelo.')
    await c.query('DELETE FROM orden_repuestos WHERE id = $1', [id])
    return rows[0].orden_id
  })
  return obtener(ordenId)
}

// ---------- Mano de obra ----------

export async function agregarManoObra(datos: Datos): Promise<OrdenDetalle> {
  const d = manoObraSchema.parse(datos)
  await transaccion(async (c) => {
    const o = await bloquearOrden(c, d.orden_id)
    const p = await asegurarPersonal(c, d.personal_id)
    const a = o.fecha_apertura
    const apertura = `${a.getFullYear()}-${String(a.getMonth() + 1).padStart(2, '0')}-${String(a.getDate()).padStart(2, '0')}`
    if (d.fecha < apertura) throw new ReglaNegocio('No puede ser anterior a la apertura de la orden.', 'fecha')
    await c.query(
      `INSERT INTO orden_mano_obra (orden_id, personal_id, fase, fecha, horas, costo_hora, descripcion)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [d.orden_id, d.personal_id, d.fase, d.fecha, d.horas, p.costo_hora, d.descripcion]
    )
  })
  return obtener(d.orden_id)
}

export async function eliminarManoObra(id: number): Promise<OrdenDetalle> {
  const ordenId = await transaccion(async (c) => {
    const { rows } = await c.query<{ orden_id: number }>('SELECT orden_id FROM orden_mano_obra WHERE id = $1', [id])
    if (!rows[0]) throw new NoEncontrado('El registro de mano de obra')
    await bloquearOrden(c, rows[0].orden_id)
    await c.query('DELETE FROM orden_mano_obra WHERE id = $1', [id])
    return rows[0].orden_id
  })
  return obtener(ordenId)
}
