import { BrowserWindow, ipcMain } from 'electron'
import { rutaOut } from './rutas'

export function crearVentana(opciones: { ruta?: string; mostrar?: boolean; ancho?: number; alto?: number; padre?: BrowserWindow; fondo?: string } = {}) {
  const w = new BrowserWindow({
    width: opciones.ancho ?? 1440,
    height: opciones.alto ?? 900,
    minWidth: 1100,
    minHeight: 680,
    show: false,
    parent: opciones.padre,
    title: 'Taller Equipos Pesados',
    backgroundColor: opciones.fondo ?? '#f1f5f9',
    autoHideMenuBar: true,
    webPreferences: {
      preload: rutaOut('preload', 'index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  const hash = opciones.ruta ?? '/'
  if (process.env.ELECTRON_RENDERER_URL) void w.loadURL(`${process.env.ELECTRON_RENDERER_URL}#${hash}`)
  else void w.loadFile(rutaOut('renderer', 'index.html'), { hash })
  if (opciones.mostrar !== false) w.once('ready-to-show', () => w.show())
  return w
}

// El renderer avisa cuando el reporte terminó de cargar sus datos.
const esperandoReporte = new Map<number, () => void>()
ipcMain.on('reporte:listo', (e) => {
  esperandoReporte.get(e.sender.id)?.()
  esperandoReporte.delete(e.sender.id)
})

export function esperarReporte(w: BrowserWindow, timeoutMs = 20000): Promise<void> {
  return new Promise((res, rej) => {
    const t = setTimeout(() => {
      esperandoReporte.delete(w.webContents.id)
      rej(new Error('Tiempo de espera agotado al preparar el reporte.'))
    }, timeoutMs)
    esperandoReporte.set(w.webContents.id, () => {
      clearTimeout(t)
      res()
    })
  })
}
