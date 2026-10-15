// Configuración local de la app (userData/config.json). La contraseña del
// servidor externo se guarda cifrada con safeStorage (DPAPI en Windows).
import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import type { ConfigExterno, ModoBaseDatos } from '@shared/dominio'

export interface Config {
  modo: ModoBaseDatos
  embebido: { puerto: number; password: string }
  externo: ConfigExterno | null
}

interface ConfigArchivo extends Omit<Config, 'externo'> {
  externo: (Omit<ConfigExterno, 'password'> & { password?: string; passwordCifrado?: string }) | null
}

const ruta = () => join(app.getPath('userData'), 'config.json')

function porDefecto(): Config {
  return {
    modo: 'embebido',
    embebido: { puerto: 54329, password: randomBytes(18).toString('base64url') },
    externo: null
  }
}

export function leerConfig(): Config {
  if (!existsSync(ruta())) {
    const c = porDefecto()
    guardarConfig(c)
    return c
  }
  const a = JSON.parse(readFileSync(ruta(), 'utf8')) as ConfigArchivo
  let externo: ConfigExterno | null = null
  if (a.externo) {
    const { passwordCifrado, password, ...resto } = a.externo
    externo = {
      ...resto,
      password: passwordCifrado
        ? safeStorage.decryptString(Buffer.from(passwordCifrado, 'base64'))
        : (password ?? '')
    }
  }
  return { modo: a.modo, embebido: a.embebido, externo }
}

export function guardarConfig(c: Config): void {
  let externo: ConfigArchivo['externo'] = null
  if (c.externo) {
    const { password, ...resto } = c.externo
    externo = safeStorage.isEncryptionAvailable()
      ? { ...resto, passwordCifrado: safeStorage.encryptString(password).toString('base64') }
      : { ...resto, password }
  }
  const a: ConfigArchivo = { modo: c.modo, embebido: c.embebido, externo }
  writeFileSync(ruta(), JSON.stringify(a, null, 2), 'utf8')
}

export const carpetaDatosEmbebidos = () => join(app.getPath('userData'), 'pgdata')
