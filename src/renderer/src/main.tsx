import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { Loader2, ServerCrash, Wrench } from 'lucide-react'
import type { EstadoSistema } from '@shared/dominio'
import { api } from './lib/api'
import { Layout } from './components/Layout'
import { Toasts } from './components/Toasts'
import { Panel } from './pages/Panel'
import { Equipos } from './pages/Equipos'
import { EquipoFormulario } from './pages/EquipoFormulario'
import { EquipoDetalle } from './pages/EquipoDetalle'
import { Horometros } from './pages/Horometros'
import { Ordenes } from './pages/Ordenes'
import { NuevaOrden } from './pages/NuevaOrden'
import { OrdenDetalleVista } from './pages/OrdenDetalle'
import { Catalogos } from './pages/Catalogos'
import { Ajustes } from './pages/Ajustes'
import { Reporte } from './pages/Reporte'
import './index.css'

function App() {
  const [sistema, setSistema] = useState<EstadoSistema | null>(null)
  useEffect(() => {
    api.sistema.estado().then(setSistema)
  }, [])

  if (!sistema)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-slate-900 text-slate-300">
        <span className="rounded-xl bg-amber-500 p-3 text-slate-950">
          <Wrench className="size-8" />
        </span>
        <div className="flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" /> Iniciando base de datos…
        </div>
      </div>
    )

  if (!sistema.listo)
    return (
      <div className="mx-auto max-w-3xl px-8 py-10">
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900">
          <ServerCrash className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-semibold">No se pudo conectar a la base de datos</p>
            <p className="mt-1 text-sm break-words">{sistema.error}</p>
          </div>
        </div>
        <Ajustes />
      </div>
    )

  return (
    <HashRouter>
      <Routes>
        <Route path="/reporte/:id" element={<Reporte />} />
        <Route element={<Layout sistema={sistema} />}>
          <Route index element={<Panel />} />
          <Route path="equipos" element={<Equipos />} />
          <Route path="equipos/nuevo" element={<EquipoFormulario />} />
          <Route path="equipos/:id" element={<EquipoDetalle />} />
          <Route path="equipos/:id/editar" element={<EquipoFormulario />} />
          <Route path="horometros" element={<Horometros />} />
          <Route path="ordenes" element={<Ordenes />} />
          <Route path="ordenes/nueva" element={<NuevaOrden />} />
          <Route path="ordenes/:id" element={<OrdenDetalleVista />} />
          <Route path="catalogos" element={<Catalogos />} />
          <Route path="ajustes" element={<Ajustes />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Toasts />
  </StrictMode>
)
