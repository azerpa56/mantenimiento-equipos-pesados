import type pg from 'pg'
import m001 from './migraciones/001_inicial.sql?raw'
import m002 from './migraciones/002_identificacion_equipos.sql?raw'
import m003 from './migraciones/003_flota_categoria.sql?raw'

const MIGRACIONES = [
  { version: 1, nombre: '001_inicial', sql: m001 },
  { version: 2, nombre: '002_identificacion_equipos', sql: m002 },
  { version: 3, nombre: '003_flota_categoria', sql: m003 }
]

/**
 * Aplica las migraciones pendientes en una sola transacción. El advisory lock
 * evita que dos PCs apuntando al mismo servidor externo migren a la vez.
 */
export async function migrar(pool: pg.Pool): Promise<void> {
  const c = await pool.connect()
  try {
    await c.query('BEGIN')
    await c.query('SELECT pg_advisory_xact_lock(724501)')
    await c.query(`CREATE TABLE IF NOT EXISTS schema_migraciones (
      version     INTEGER PRIMARY KEY,
      nombre      TEXT NOT NULL,
      aplicada_en TIMESTAMPTZ NOT NULL DEFAULT now()
    )`)
    const { rows } = await c.query<{ version: number }>('SELECT version FROM schema_migraciones')
    const hechas = new Set(rows.map((r) => r.version))
    for (const m of MIGRACIONES) {
      if (hechas.has(m.version)) continue
      await c.query(m.sql)
      await c.query('INSERT INTO schema_migraciones (version, nombre) VALUES ($1, $2)', [m.version, m.nombre])
    }
    await c.query('COMMIT')
  } catch (e) {
    await c.query('ROLLBACK')
    throw e
  } finally {
    c.release()
  }
}
