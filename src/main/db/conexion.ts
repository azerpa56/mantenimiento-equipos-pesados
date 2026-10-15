// Arranque de la base de datos: PostgreSQL embebido (por defecto) o servidor externo.
import pg from 'pg'
import net from 'node:net'
import { execFile } from 'node:child_process'
import { existsSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import EmbeddedPostgres from 'embedded-postgres'
import type { ConfigExterno, EstadoSistema } from '@shared/dominio'
import { carpetaDatosEmbebidos, leerConfig, type Config } from '../config'
import { ReglaNegocio } from '../errores'
import { rutaPgCtl } from '../rutas'
import { migrar } from './migrar'

// NUMERIC y COUNT(*) llegan como texto por defecto; DATE se deja como 'YYYY-MM-DD'
// para no sufrir corrimientos de zona horaria.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => parseFloat(v))
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => parseInt(v, 10))
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v)

const BASE_DATOS = 'mantenimiento'

let pool: pg.Pool | null = null
let servidor: EmbeddedPostgres | null = null
let arranque: Promise<EstadoSistema> | null = null

export function iniciarBaseDatos(): Promise<EstadoSistema> {
  arranque ??= arrancar()
  return arranque
}

export async function obtenerPool(): Promise<pg.Pool> {
  const e = await iniciarBaseDatos()
  if (!e.listo || !pool) throw new ReglaNegocio(`La base de datos no está disponible. ${e.error ?? ''}`)
  return pool
}

export async function detenerBaseDatos(): Promise<void> {
  const limite = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
  const p = pool
  const s = servidor
  pool = null
  servidor = null
  await Promise.race([p?.end().catch(() => {}), limite(3000)])
  if (!s) return
  // embedded-postgres detiene con "taskkill /f /t" en Windows (apagado brusco: deja procesos
  // hijos huérfanos y fuerza recuperación al siguiente arranque). pg_ctl hace un apagado limpio.
  if (process.platform === 'win32' && existsSync(rutaPgCtl())) {
    try {
      await promisify(execFile)(rutaPgCtl(), ['stop', '-D', carpetaDatosEmbebidos(), '-m', 'fast', '-w', '-t', '20'], { windowsHide: true })
      // El proceso ya terminó: se marca como detenido para que su hook de salida no lo vuelva a matar.
      ;(s as unknown as { process?: unknown }).process = undefined
      return
    } catch (e) {
      console.error('[postgres] pg_ctl stop falló, se fuerza la detención', e)
    }
  }
  await Promise.race([s.stop().catch(() => {}), limite(10000)])
}

function crearPool(c: { host: string; port: number; database: string; user: string; password: string; ssl?: boolean }) {
  return new pg.Pool({
    ...c,
    ssl: c.ssl ? { rejectUnauthorized: false } : undefined,
    max: 8,
    connectionTimeoutMillis: 8000
  })
}

export async function probarExterno(c: ConfigExterno): Promise<string> {
  const p = crearPool({ host: c.host, port: c.puerto, database: c.baseDatos, user: c.usuario, password: c.password, ssl: c.ssl })
  try {
    const { rows } = await p.query<{ v: string }>('SELECT version() AS v')
    return rows[0].v
  } finally {
    await p.end().catch(() => {})
  }
}

async function arrancar(): Promise<EstadoSistema> {
  const cfg = leerConfig()
  try {
    if (cfg.modo === 'externo' && cfg.externo) {
      const x = cfg.externo
      pool = crearPool({ host: x.host, port: x.puerto, database: x.baseDatos, user: x.usuario, password: x.password, ssl: x.ssl })
      await pool.query('SELECT 1')
      await migrar(pool)
      return { listo: true, modo: 'externo', detalle: `${x.usuario}@${x.host}:${x.puerto}/${x.baseDatos}` }
    }
    pool = await arrancarEmbebido(cfg)
    await migrar(pool)
    return { listo: true, modo: 'embebido', detalle: `PostgreSQL local, puerto ${cfg.embebido.puerto}` }
  } catch (e) {
    await pool?.end().catch(() => {})
    pool = null
    console.error('[db] arranque fallido', e)
    return { listo: false, modo: cfg.modo, detalle: '', error: (e as Error).message ?? String(e) }
  }
}

function puertoLibre(puerto: number): Promise<boolean> {
  return new Promise((res) => {
    const s = net.createServer()
    s.once('error', () => res(false))
    s.once('listening', () => s.close(() => res(true)))
    s.listen(puerto, '127.0.0.1')
  })
}

async function arrancarEmbebido(cfg: Config): Promise<pg.Pool> {
  const dir = carpetaDatosEmbebidos()
  const { puerto, password } = cfg.embebido
  const conexion = (database: string) => crearPool({ host: '127.0.0.1', port: puerto, database, user: 'postgres', password })

  // Un postgres huérfano de una sesión que cerró mal sigue escuchando: si
  // acepta nuestras credenciales es el nuestro y se reutiliza.
  if (!(await puertoLibre(puerto))) {
    const p = conexion(BASE_DATOS)
    try {
      await p.query('SELECT 1')
      return p
    } catch {
      await p.end().catch(() => {})
      throw new Error(`El puerto ${puerto} está ocupado por otro programa. Cambie el puerto en Ajustes.`)
    }
  }

  // Inicialización a medias (sin PG_VERSION): se aparta en vez de borrarla.
  if (existsSync(dir) && !existsSync(join(dir, 'PG_VERSION'))) {
    renameSync(dir, `${dir}-incompleto-${Date.now()}`)
  }

  servidor = new EmbeddedPostgres({
    databaseDir: dir,
    port: puerto,
    user: 'postgres',
    password,
    authMethod: 'scram-sha-256',
    persistent: true,
    initdbFlags: ['--encoding=UTF8', '--no-locale'],
    // Sin procesos io_worker (PG 18): una app de escritorio no los necesita.
    postgresFlags: ['-c', 'io_method=sync'],
    onLog: () => {},
    onError: (m) => console.error('[postgres]', m)
  })
  if (!existsSync(join(dir, 'PG_VERSION'))) await servidor.initialise()

  try {
    await servidor.start()
  } catch (e) {
    // Tras un apagón queda postmaster.pid; si el puerto está libre es seguro quitarlo.
    const pid = join(dir, 'postmaster.pid')
    if (!existsSync(pid)) throw e
    rmSync(pid)
    await servidor.start()
  }

  const admin = conexion('postgres')
  try {
    const r = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [BASE_DATOS])
    if (!r.rowCount) await admin.query(`CREATE DATABASE ${BASE_DATOS}`)
  } finally {
    await admin.end()
  }
  return conexion(BASE_DATOS)
}

// ---------- Helpers de consulta ----------

export type Cliente = pg.PoolClient

export async function consulta<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const p = await obtenerPool()
  return (await p.query(sql, params)).rows as T[]
}

export async function transaccion<T>(fn: (c: Cliente) => Promise<T>): Promise<T> {
  const p = await obtenerPool()
  const c = await p.connect()
  try {
    await c.query('BEGIN')
    const r = await fn(c)
    await c.query('COMMIT')
    return r
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    c.release()
  }
}
