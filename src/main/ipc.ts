// Un único canal "api": el renderer invoca "modulo.funcion" con un argumento.
// Cada handler devuelve { ok, data } o { ok: false, error, campos }.
import { app, BrowserWindow, ipcMain, shell, type IpcMainInvokeEvent } from 'electron'
import { configExternoSchema } from '@shared/esquemas'
import type { ModoBaseDatos } from '@shared/dominio'
import { carpetaDatosEmbebidos, guardarConfig, leerConfig } from './config'
import { iniciarBaseDatos, probarExterno } from './db/conexion'
import { traducirError, type Resultado } from './errores'
import { categorias, frentes, personal, repuestos, type Datos } from './servicios/catalogos'
import * as equipos from './servicios/equipos'
import * as horometros from './servicios/horometros'
import * as importacion from './servicios/importacion'
import * as metricas from './servicios/metricas'
import * as ordenes from './servicios/ordenes'
import * as reportes from './servicios/reportes'

const ventana = (e: IpcMainInvokeEvent) => BrowserWindow.fromWebContents(e.sender)

export const handlers = {
  sistema: {
    estado: () => iniciarBaseDatos(),
    config: () => {
      const c = leerConfig()
      return {
        modo: c.modo,
        puertoEmbebido: c.embebido.puerto,
        carpetaEmbebida: carpetaDatosEmbebidos(),
        externo: c.externo ? { ...c.externo, password: c.externo.password ? '********' : '' } : null
      }
    },
    probarExterno: async (datos: Datos) => {
      const c = leerConfig()
      const d = configExternoSchema.parse(datos)
      if (d.password === '********' && c.externo) d.password = c.externo.password
      return probarExterno(d)
    },
    guardarConfig: (a: { modo: ModoBaseDatos; puertoEmbebido: number; externo: Datos | null }) => {
      const c = leerConfig()
      c.modo = a.modo === 'externo' ? 'externo' : 'embebido'
      const puerto = Number(a.puertoEmbebido)
      if (Number.isInteger(puerto) && puerto > 1024 && puerto < 65536) c.embebido.puerto = puerto
      if (a.externo) {
        const d = configExternoSchema.parse(a.externo)
        if (d.password === '********' && c.externo) d.password = c.externo.password
        c.externo = d
      }
      if (c.modo === 'externo' && !c.externo) c.modo = 'embebido'
      guardarConfig(c)
      return true
    },
    reiniciar: () => {
      app.relaunch()
      app.quit()
    },
    abrirCarpetaDatos: () => shell.openPath(carpetaDatosEmbebidos())
  },
  categorias,
  frentes,
  personal,
  repuestos,
  equipos: {
    listar: equipos.listar,
    obtener: equipos.obtener,
    crear: equipos.crear,
    actualizar: equipos.actualizar,
    cambiarEstado: equipos.cambiarEstado,
    eliminar: equipos.eliminar,
    historial: metricas.historialEquipo
  },
  importacion: {
    elegirArchivo: (_: void, e: IpcMainInvokeEvent) => importacion.elegirArchivo(ventana(e)),
    vistaPrevia: (ruta: string) => importacion.vistaPrevia(ruta),
    importar: (ruta: string) => importacion.importar(ruta)
  },
  horometros: {
    listar: horometros.listar,
    parteDiario: horometros.parteDiario,
    registrar: horometros.registrar,
    registrarLote: horometros.registrarLote,
    eliminar: horometros.eliminar
  },
  ordenes: {
    listar: ordenes.listar,
    obtener: ordenes.obtener,
    crear: ordenes.crear,
    transicionar: ordenes.transicionar,
    cancelar: ordenes.cancelar,
    guardarDatosTecnicos: ordenes.guardarDatosTecnicos,
    agregarBitacora: ordenes.agregarBitacora,
    eliminarBitacora: ordenes.eliminarBitacora,
    agregarRepuesto: ordenes.agregarRepuesto,
    accionRepuesto: ordenes.accionRepuesto,
    eliminarRepuesto: ordenes.eliminarRepuesto,
    agregarManoObra: ordenes.agregarManoObra,
    eliminarManoObra: ordenes.eliminarManoObra
  },
  metricas: {
    dashboard: metricas.dashboard
  },
  reportes: {
    vistaPrevia: (id: number, e: IpcMainInvokeEvent) => reportes.vistaPrevia(id, ventana(e)),
    exportarPdf: (id: number, e: IpcMainInvokeEvent) => reportes.exportarPdf(id, ventana(e))
  }
}

type Handlers = typeof handlers
type Fn = (arg: never, e: IpcMainInvokeEvent) => unknown

type Llamada<T> = T extends (...a: infer A) => infer R
  ? A extends []
    ? () => Promise<Awaited<R>>
    : [] extends A
      ? (arg?: A[0]) => Promise<Awaited<R>>
      : (arg: A[0]) => Promise<Awaited<R>>
  : never

/** Contrato que ve el renderer: mismo árbol, cada función con 0 o 1 argumento y Promise. */
export type Api = { [M in keyof Handlers]: { [F in keyof Handlers[M]]: Llamada<Handlers[M][F]> } }

export function registrarIpc(): void {
  ipcMain.handle('api', async (e, ruta: string, arg: unknown): Promise<Resultado<unknown>> => {
    const [m, f] = ruta.split('.')
    const fn = (handlers as Record<string, Record<string, Fn>>)[m]?.[f]
    if (!fn) return { ok: false, error: `Operación desconocida: ${ruta}` }
    try {
      return { ok: true, data: await fn(arg as never, e) }
    } catch (err) {
      return traducirError(err)
    }
  })
}
