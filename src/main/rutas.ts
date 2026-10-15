import { app } from 'electron'
import { join } from 'node:path'

/**
 * Raíz de la app (donde están package.json, out/ y node_modules/).
 * TALLER_RAIZ solo lo fija la prueba e2e, que se lanza con el script directo y no con "electron .".
 */
export const raizApp = () => process.env.TALLER_RAIZ ?? app.getAppPath()

export const rutaOut = (...p: string[]) => join(raizApp(), 'out', ...p)

/** pg_ctl del PostgreSQL embebido (la app se empaqueta sin asar, así que vive en node_modules). */
export const rutaPgCtl = () => join(raizApp(), 'node_modules', '@embedded-postgres', 'windows-x64', 'native', 'bin', 'pg_ctl.exe')
