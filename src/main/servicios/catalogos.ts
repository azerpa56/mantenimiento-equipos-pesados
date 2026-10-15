import type { Categoria, Frente, Personal, Repuesto } from '@shared/dominio'
import { categoriaSchema, frenteSchema, personalSchema, repuestoSchema } from '@shared/esquemas'
import { consulta, type Cliente } from '../db/conexion'
import { NoEncontrado, ReglaNegocio } from '../errores'

export type Datos = Record<string, unknown>
type Guardar = { id?: number | null; datos: Datos }

async function unoOFalla<T>(sql: string, params: unknown[], que: string): Promise<T> {
  const r = await consulta<T>(sql, params)
  if (!r[0]) throw new NoEncontrado(que)
  return r[0]
}

// ---------- Categorías ----------
export const categorias = {
  listar: () => consulta<Categoria>('SELECT * FROM categorias_equipo ORDER BY nombre'),
  async guardar({ id, datos }: Guardar) {
    const d = categoriaSchema.parse(datos)
    if (id) return unoOFalla<Categoria>('UPDATE categorias_equipo SET nombre=$2, activo=$3 WHERE id=$1 RETURNING *', [id, d.nombre, d.activo], 'La categoría')
    return (await consulta<Categoria>('INSERT INTO categorias_equipo (nombre, activo) VALUES ($1,$2) RETURNING *', [d.nombre, d.activo]))[0]
  }
}

// ---------- Frentes ----------
export const frentes = {
  listar: () => consulta<Frente>('SELECT * FROM frentes_trabajo ORDER BY nombre'),
  async guardar({ id, datos }: Guardar) {
    const d = frenteSchema.parse(datos)
    if (id) return unoOFalla<Frente>('UPDATE frentes_trabajo SET nombre=$2, ubicacion=$3, activo=$4 WHERE id=$1 RETURNING *', [id, d.nombre, d.ubicacion, d.activo], 'El frente')
    return (await consulta<Frente>('INSERT INTO frentes_trabajo (nombre, ubicacion, activo) VALUES ($1,$2,$3) RETURNING *', [d.nombre, d.ubicacion, d.activo]))[0]
  }
}

// ---------- Personal ----------
export const personal = {
  listar: () => consulta<Personal>('SELECT * FROM personal ORDER BY activo DESC, nombre'),
  async guardar({ id, datos }: Guardar) {
    const d = personalSchema.parse(datos)
    const p = [d.nombre, d.cargo, d.especialidad, d.costo_hora, d.activo]
    if (id) return unoOFalla<Personal>('UPDATE personal SET nombre=$2, cargo=$3, especialidad=$4, costo_hora=$5, activo=$6 WHERE id=$1 RETURNING *', [id, ...p], 'La persona')
    return (await consulta<Personal>('INSERT INTO personal (nombre, cargo, especialidad, costo_hora, activo) VALUES ($1,$2,$3,$4,$5) RETURNING *', p))[0]
  }
}

/** Verifica que la persona exista y esté activa; devuelve su costo/hora. */
export async function asegurarPersonal(c: Cliente, id: number): Promise<Personal> {
  const { rows } = await c.query<Personal>('SELECT * FROM personal WHERE id = $1', [id])
  if (!rows[0]) throw new NoEncontrado('La persona seleccionada')
  if (!rows[0].activo) throw new ReglaNegocio(`${rows[0].nombre} está inactivo(a) en el catálogo de personal.`)
  return rows[0]
}

// ---------- Repuestos ----------
export const repuestos = {
  listar: (f: { texto?: string } = {}) =>
    f.texto
      ? consulta<Repuesto>(
          `SELECT * FROM repuestos WHERE codigo ILIKE $1 OR descripcion ILIKE $1 OR numero_parte ILIKE $1 ORDER BY codigo`,
          [`%${f.texto}%`]
        )
      : consulta<Repuesto>('SELECT * FROM repuestos ORDER BY activo DESC, codigo'),
  async guardar({ id, datos }: Guardar) {
    const d = repuestoSchema.parse(datos)
    const p = [d.codigo, d.descripcion, d.numero_parte, d.unidad, d.costo_referencia, d.activo]
    if (id)
      return unoOFalla<Repuesto>(
        'UPDATE repuestos SET codigo=$2, descripcion=$3, numero_parte=$4, unidad=$5, costo_referencia=$6, activo=$7 WHERE id=$1 RETURNING *',
        [id, ...p],
        'El repuesto'
      )
    return (await consulta<Repuesto>('INSERT INTO repuestos (codigo, descripcion, numero_parte, unidad, costo_referencia, activo) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *', p))[0]
  }
}
