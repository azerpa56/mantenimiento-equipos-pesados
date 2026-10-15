import { app, BrowserWindow, dialog, shell } from 'electron'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { crearVentana, esperarReporte } from '../ventanas'
import { obtener } from './ordenes'

/** Abre la vista previa imprimible de la OT en una ventana aparte. */
export async function vistaPrevia(ordenId: number, padre: BrowserWindow | null): Promise<void> {
  await obtener(ordenId) // valida que exista
  crearVentana({ ruta: `/reporte/${ordenId}`, ancho: 1000, alto: 900, padre: padre ?? undefined })
}

/** Genera el PDF de la OT, pide dónde guardarlo y lo abre. Devuelve la ruta o null si se canceló. */
export async function exportarPdf(ordenId: number, padre: BrowserWindow | null): Promise<string | null> {
  const orden = await obtener(ordenId)
  const w = crearVentana({ ruta: `/reporte/${ordenId}`, mostrar: false, fondo: '#ffffff' })
  try {
    await esperarReporte(w)
    const pdf = await w.webContents.printToPDF({
      pageSize: 'Letter',
      printBackground: true,
      margins: { top: 0.4, bottom: 0.5, left: 0.4, right: 0.4 }
    })
    const opciones = {
      title: 'Guardar reporte de la orden',
      defaultPath: join(app.getPath('documents'), `${orden.folio} ${orden.equipo_codigo}.pdf`),
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    }
    const r = padre ? await dialog.showSaveDialog(padre, opciones) : await dialog.showSaveDialog(opciones)
    if (r.canceled || !r.filePath) return null
    await writeFile(r.filePath, pdf)
    void shell.openPath(r.filePath)
    return r.filePath
  } finally {
    w.destroy()
  }
}
