import { app, BrowserWindow } from 'electron'
import { detenerBaseDatos, iniciarBaseDatos } from './db/conexion'
import { registrarIpc } from './ipc'
import { crearVentana } from './ventanas'

let principal: BrowserWindow | null = null

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!principal) return
    if (principal.isMinimized()) principal.restore()
    principal.focus()
  })

  app.whenReady().then(() => {
    registrarIpc()
    // La ventana aparece de inmediato con la pantalla de arranque; la BD se levanta en paralelo.
    void iniciarBaseDatos()
    principal = crearVentana()
    principal.on('closed', () => (principal = null))
  })

  app.on('window-all-closed', () => app.quit())

  // Detener PostgreSQL limpiamente antes de salir.
  let cerrando = false
  app.on('before-quit', (e) => {
    if (cerrando) return
    e.preventDefault()
    cerrando = true
    detenerBaseDatos().finally(() => app.quit())
  })
}
