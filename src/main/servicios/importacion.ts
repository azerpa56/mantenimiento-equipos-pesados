// Importación del listado de flota desde Excel (formato "LISTADO DE MAQUINARIAS Y EQUIPOS"
// del Sistema de Gestión de Equipos Operacionales). Cada hoja con encabezados reconocibles
// (Equipos, Equipos Auxiliares) se procesa; la columna se busca por nombre, no por posición.
//
// Reglas acordadas con el taller:
// - Código interno = placa; si no tiene placa, el serial (chasis / serial del auxiliar).
// - OPERATIVO y DESCONOCIDO -> operativo. INOPERATIVO, EN MANTENIMIENTO y DESINCORPORADO ->
//   fuera de servicio, dejando el estado original en observaciones.
// - Reimportar el mismo listado actualiza (se identifica por serial, si no por placa); no duplica.
import { BrowserWindow, dialog } from 'electron'
import { basename } from 'node:path'
import ExcelJS from 'exceljs'
import { flotaSugerida, type EstadoEquipo, type FilaImportacion, type ResultadoImportacion } from '@shared/dominio'
import { transaccion, type Cliente } from '../db/conexion'
import { ReglaNegocio } from '../errores'
import { recalcularEstado } from './estadoEquipo'

const VACIOS = new Set(['', '—', '–', '-', '--', '.', 'S/M', 'S/N', 'N/A', 'NO APLICA'])
const SIN_FRENTE = new Set(['POR DEFINIR', 'SIN FRENTE'])

/** Mayúsculas sin acentos ni saltos de línea, para comparar encabezados y nombres. */
const clave = (s: string) =>
  s.normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ').trim().toUpperCase()

const COLUMNAS = {
  frente: ['FRENTE'],
  tipo: ['TIPO'],
  marca: ['MARCA'],
  modelo: ['MODELO'],
  serial: ['SERIAL DE CHASIS', 'SERIAL CHASIS', 'SERIAL'],
  motor: ['SERIAL DE MOTOR', 'SERIAL MOTOR'],
  placa: ['PLACA'],
  anio: ['ANO', 'ANIO'], // "AÑO" sin tilde queda "ANO"
  estado: ['ESTADO OPERATIVO', 'ESTADO'],
  capacidad: ['CAPACIDAD'],
  numero: ['N°', 'NO', 'NRO', '#']
} as const
type Columna = keyof typeof COLUMNAS

function textoCelda(v: ExcelJS.CellValue): string | null {
  if (v == null) return null
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((r) => r.text).join('')
    if ('result' in v) return textoCelda(v.result as ExcelJS.CellValue)
    if ('text' in v) return String(v.text)
    return null
  }
  return String(v)
}

const limpio = (v: ExcelJS.CellValue): string | null => {
  const t = textoCelda(v)?.replace(/\s+/g, ' ').trim()
  return !t || VACIOS.has(t.toUpperCase()) ? null : t
}

interface FilaExcel {
  hoja: string
  fila: number
  numero: string | null
  datos: Record<Columna, string | null>
}

async function leerExcel(ruta: string): Promise<FilaExcel[]> {
  const wb = new ExcelJS.Workbook()
  try {
    await wb.xlsx.readFile(ruta)
  } catch {
    throw new ReglaNegocio('No se pudo leer el archivo. Verifique que sea un Excel .xlsx y que no esté abierto en otro programa.')
  }
  const filas: FilaExcel[] = []
  wb.eachSheet((ws) => {
    // Fila de encabezados: la primera (de las 20 primeras) que tenga TIPO y MARCA.
    let cab = 0
    const indice = new Map<Columna, number>()
    for (let r = 1; r <= Math.min(20, ws.rowCount) && !cab; r++) {
      const nombres = new Map<string, number>()
      ws.getRow(r).eachCell((c, col) => {
        const t = textoCelda(c.value)
        if (t) nombres.set(clave(t), col)
      })
      if (nombres.has('TIPO') && nombres.has('MARCA')) {
        cab = r
        for (const [k, alias] of Object.entries(COLUMNAS) as [Columna, readonly string[]][]) {
          const a = alias.find((x) => nombres.has(x))
          if (a) indice.set(k, nombres.get(a)!)
        }
      }
    }
    if (!cab) return
    for (let r = cab + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r)
      const primera = clave(textoCelda(row.getCell(1).value) ?? '')
      if (primera === 'TOTAL') break
      const datos = {} as Record<Columna, string | null>
      for (const k of Object.keys(COLUMNAS) as Columna[]) {
        const col = indice.get(k)
        datos[k] = col ? limpio(row.getCell(col).value) : null
      }
      if (!datos.tipo && !datos.marca && !datos.serial && !datos.placa) continue
      filas.push({ hoja: ws.name, fila: r, numero: datos.numero, datos })
    }
  })
  if (!filas.length)
    throw new ReglaNegocio('No se encontraron equipos. El archivo debe tener una fila de encabezados con al menos TIPO, MARCA y SERIAL o PLACA.')
  return filas
}

const ESTADOS: Record<string, { estado: EstadoEquipo; nota: boolean }> = {
  OPERATIVO: { estado: 'operativo', nota: false },
  DESCONOCIDO: { estado: 'operativo', nota: true },
  INOPERATIVO: { estado: 'fuera_servicio', nota: true },
  'EN MANTENIMIENTO': { estado: 'fuera_servicio', nota: true },
  DESINCORPORADO: { estado: 'fuera_servicio', nota: true },
  'FUERA DE SERVICIO': { estado: 'fuera_servicio', nota: false }
}

interface Plan extends FilaImportacion {
  equipo_id: number | null
  ordenes_abiertas: number
  serial_motor: string | null
  capacidad: string | null
  anio: number | null
}

/** Cruza el Excel con la base de datos sin modificar nada. */
async function planificar(c: Cliente, ruta: string) {
  const filas = await leerExcel(ruta)

  const { rows: existentes } = await c.query<{ id: number; codigo_interno: string; numero_serie: string | null; placa: string | null; abiertas: number }>(
    `SELECT e.id, e.codigo_interno, e.numero_serie, e.placa,
            (SELECT COUNT(*)::int FROM ordenes_trabajo o WHERE o.equipo_id = e.id AND o.estado = 'abierta') AS abiertas
     FROM equipos e`
  )
  const porSerial = new Map(existentes.filter((e) => e.numero_serie).map((e) => [e.numero_serie!, e]))
  const porPlaca = new Map(existentes.filter((e) => e.placa).map((e) => [e.placa!, e]))
  const porCodigo = new Map(existentes.map((e) => [e.codigo_interno, e]))

  const { rows: cats } = await c.query<{ nombre: string }>('SELECT nombre FROM categorias_equipo')
  const categorias = new Set(cats.map((x) => clave(x.nombre)))
  const { rows: frs } = await c.query<{ nombre: string }>('SELECT nombre FROM frentes_trabajo')
  const frentes = new Set(frs.map((x) => clave(x.nombre)))
  const categoriasNuevas = new Map<string, string>()
  const frentesNuevos = new Map<string, string>()

  const vistos = new Map<string, string>() // serial/placa -> "hoja fila"
  const codigosNuevos = new Map<string, string>() // código de equipos a crear -> "hoja fila"
  const anioMax = new Date().getFullYear() + 1
  const planes: Plan[] = []

  for (const f of filas) {
    const d = f.datos
    const avisos: string[] = []
    const tipo = (d.tipo ?? 'OTRO').replace(/^[↳>\-\s]+/, '').trim() || 'OTRO'
    const serial = d.serial?.toUpperCase().slice(0, 60) ?? null
    const placa = d.placa?.toUpperCase().replace(/\s+/g, '').slice(0, 20) ?? null
    const codigo = placa ?? serial
    const frente = d.frente && !SIN_FRENTE.has(clave(d.frente)) ? d.frente.slice(0, 100) : null
    const estadoOriginal = d.estado ? clave(d.estado) : null
    const mapeo = estadoOriginal ? ESTADOS[estadoOriginal] : undefined
    if (estadoOriginal && !mapeo) avisos.push(`Estado "${d.estado}" no reconocido: se carga como operativo`)
    let anio: number | null = d.anio ? Number(d.anio) : null
    if (anio != null && (!Number.isInteger(anio) || anio < 1950 || anio > anioMax)) {
      avisos.push(`Año "${d.anio}" inválido: se deja vacío`)
      anio = null
    }

    const plan: Plan = {
      hoja: f.hoja,
      fila: f.fila,
      accion: 'crear',
      codigo,
      tipo,
      marca: d.marca?.slice(0, 60) ?? 'S/M',
      modelo: d.modelo?.slice(0, 60) ?? 'S/M',
      placa,
      serial,
      frente,
      estado: mapeo?.estado ?? 'operativo',
      estado_original: mapeo?.nota || !mapeo ? (d.estado ?? null) : null,
      mensaje: null,
      equipo_id: null,
      ordenes_abiertas: 0,
      serial_motor: d.motor?.toUpperCase().slice(0, 60) ?? null,
      capacidad: d.capacidad?.slice(0, 60) ?? null,
      anio
    }
    const donde = `${f.hoja}, fila ${f.fila}${f.numero ? ` (N° ${f.numero})` : ''}`

    if (!codigo) {
      plan.accion = 'error'
      plan.mensaje = 'No tiene placa ni serial: complételo en el Excel'
      planes.push(plan)
      continue
    }
    const repetido = [serial && `S:${serial}`, placa && `P:${placa}`].filter(Boolean).map((k) => vistos.get(k as string)).find(Boolean)
    if (repetido) {
      plan.accion = 'error'
      plan.mensaje = `Serial o placa repetido en el archivo (ya aparece en ${repetido})`
      planes.push(plan)
      continue
    }
    if (serial) vistos.set(`S:${serial}`, donde)
    if (placa) vistos.set(`P:${placa}`, donde)

    // ¿Ya existe? Se identifica por serial y, si no, por placa.
    const existente = (serial && porSerial.get(serial)) || (placa && porPlaca.get(placa)) || null
    if (existente) {
      const otroConPlaca = placa ? porPlaca.get(placa) : undefined
      if (otroConPlaca && otroConPlaca.id !== existente.id) {
        plan.accion = 'error'
        plan.mensaje = `La placa ${placa} ya pertenece a otro equipo (${otroConPlaca.codigo_interno})`
      } else {
        plan.accion = 'actualizar'
        plan.equipo_id = existente.id
        plan.codigo = existente.codigo_interno
        plan.ordenes_abiertas = existente.abiertas
        if (existente.abiertas > 0) avisos.push('Tiene órdenes abiertas: se conserva su estado actual')
      }
    } else if (porCodigo.has(codigo)) {
      plan.accion = 'error'
      plan.mensaje = `El código ${codigo} ya lo usa otro equipo`
    } else if (codigosNuevos.has(codigo)) {
      // Ej.: una fila con placa X y otra sin placa con serial X generarían el mismo código.
      plan.accion = 'error'
      plan.mensaje = `El código ${codigo} coincide con el de otra fila del archivo (${codigosNuevos.get(codigo)})`
    } else {
      codigosNuevos.set(codigo, donde)
    }

    if (plan.accion !== 'error') {
      if (!categorias.has(clave(tipo))) categoriasNuevas.set(clave(tipo), tipo)
      if (frente && !frentes.has(clave(frente))) frentesNuevos.set(clave(frente), frente)
    }
    if (avisos.length) plan.mensaje = avisos.join('. ')
    planes.push(plan)
  }

  const resultado: ResultadoImportacion = {
    archivo: basename(ruta),
    total: planes.length,
    crear: planes.filter((p) => p.accion === 'crear').length,
    actualizar: planes.filter((p) => p.accion === 'actualizar').length,
    errores: planes.filter((p) => p.accion === 'error').length,
    categorias_nuevas: [...categoriasNuevas.values()].sort(),
    frentes_nuevos: [...frentesNuevos.values()].sort(),
    filas: planes.map(({ equipo_id: _a, ordenes_abiertas: _b, serial_motor: _c, capacidad: _d, anio: _e, ...f }) => f)
  }
  return { planes, resultado }
}

export async function elegirArchivo(ventana: BrowserWindow | null): Promise<string | null> {
  const opciones: Electron.OpenDialogOptions = {
    title: 'Seleccionar listado de equipos',
    filters: [{ name: 'Excel', extensions: ['xlsx'] }],
    properties: ['openFile']
  }
  const r = ventana ? await dialog.showOpenDialog(ventana, opciones) : await dialog.showOpenDialog(opciones)
  return r.canceled ? null : r.filePaths[0]
}

export async function vistaPrevia(ruta: string): Promise<ResultadoImportacion> {
  // Transacción de solo lectura: se descarta al final.
  return transaccion(async (c) => (await planificar(c, ruta)).resultado)
}

/** Importa las filas válidas (las con error se omiten) en una sola transacción. */
export async function importar(ruta: string): Promise<ResultadoImportacion> {
  return transaccion(async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(724502)") // una importación a la vez
    const { planes, resultado } = await planificar(c, ruta)
    if (resultado.crear + resultado.actualizar === 0) throw new ReglaNegocio('No hay filas válidas para importar.')

    for (const nombre of resultado.categorias_nuevas)
      await c.query('INSERT INTO categorias_equipo (nombre, flota) VALUES ($1, $2) ON CONFLICT (nombre) DO NOTHING', [nombre, flotaSugerida(nombre)])
    for (const nombre of resultado.frentes_nuevos)
      await c.query('INSERT INTO frentes_trabajo (nombre) VALUES ($1) ON CONFLICT (nombre) DO NOTHING', [nombre])
    const ids = async (tabla: string) => {
      const { rows } = await c.query<{ id: number; nombre: string }>(`SELECT id, nombre FROM ${tabla}`)
      return new Map(rows.map((r) => [clave(r.nombre), r.id]))
    }
    const categoriaId = await ids('categorias_equipo')
    const frenteId = await ids('frentes_trabajo')

    for (const p of planes) {
      if (p.accion === 'error') continue
      const cat = categoriaId.get(clave(p.tipo))!
      const fre = p.frente ? (frenteId.get(clave(p.frente)) ?? null) : null
      const nota = p.estado_original ? `Estado en listado importado: ${p.estado_original}` : null
      if (p.accion === 'crear') {
        await c.query(
          `INSERT INTO equipos (codigo_interno, numero_serie, placa, serial_motor, capacidad, marca, modelo, anio,
                                categoria_id, frente_actual_id, estado, observaciones)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [p.codigo, p.serial, p.placa, p.serial_motor, p.capacidad, p.marca, p.modelo, p.anio, cat, fre, p.estado, nota]
        )
      } else {
        // No se toca código interno, horómetro ni observaciones previas.
        await c.query(
          `UPDATE equipos SET numero_serie = COALESCE($2, numero_serie), placa = COALESCE($3, placa),
                  serial_motor = COALESCE($4, serial_motor), capacidad = COALESCE($5, capacidad),
                  marca = $6, modelo = $7, anio = COALESCE($8, anio), categoria_id = $9,
                  frente_actual_id = COALESCE($10, frente_actual_id),
                  estado = CASE WHEN $11 > 0 THEN estado ELSE $12 END,
                  actualizado_en = now()
           WHERE id = $1`,
          [p.equipo_id, p.serial, p.placa, p.serial_motor, p.capacidad, p.marca, p.modelo, p.anio, cat, fre, p.ordenes_abiertas, p.estado]
        )
        if (p.ordenes_abiertas > 0) await recalcularEstado(c, p.equipo_id!)
      }
    }
    return resultado
  })
}
