import { contextBridge, ipcRenderer } from 'electron'

const puente = {
  invocar: (ruta: string, arg?: unknown) => ipcRenderer.invoke('api', ruta, arg),
  reporteListo: () => ipcRenderer.send('reporte:listo')
}

export type Puente = typeof puente

contextBridge.exposeInMainWorld('puente', puente)
