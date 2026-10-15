import { NavLink, Outlet } from 'react-router-dom'
import { BookOpen, ClipboardList, Database, Gauge, LayoutDashboard, Settings, Truck, Wrench } from 'lucide-react'
import type { EstadoSistema } from '@shared/dominio'
import { cx } from './ui'

const NAV = [
  { to: '/', etiqueta: 'Panel', icono: LayoutDashboard, fin: true },
  { to: '/ordenes', etiqueta: 'Órdenes de trabajo', icono: ClipboardList },
  { to: '/equipos', etiqueta: 'Equipos', icono: Truck },
  { to: '/horometros', etiqueta: 'Horómetros', icono: Gauge },
  { to: '/catalogos', etiqueta: 'Catálogos', icono: BookOpen },
  { to: '/ajustes', etiqueta: 'Ajustes', icono: Settings }
]

export function Layout({ sistema }: { sistema: EstadoSistema }) {
  return (
    <div className="flex h-full">
      <aside className="flex w-60 shrink-0 flex-col bg-slate-900 text-slate-300">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <span className="rounded-lg bg-amber-500 p-1.5 text-slate-950">
            <Wrench className="size-5" />
          </span>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-white">Taller</div>
            <div className="text-xs text-slate-400">Equipos pesados</div>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 px-3">
          {NAV.map(({ to, etiqueta, icono: Icono, fin }) => (
            <NavLink
              key={to}
              to={to}
              end={fin}
              className={({ isActive }) =>
                cx(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive ? 'bg-slate-800 text-white' : 'hover:bg-slate-800/60 hover:text-white'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icono className={cx('size-4', isActive && 'text-amber-400')} />
                  {etiqueta}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="m-3 flex items-start gap-2 rounded-lg bg-slate-800/60 px-3 py-2.5 text-xs">
          <Database className="mt-0.5 size-3.5 shrink-0 text-emerald-400" />
          <div className="min-w-0">
            <div className="font-medium text-slate-200">{sistema.modo === 'embebido' ? 'Base de datos local' : 'Servidor externo'}</div>
            <div className="truncate text-slate-500" title={sistema.detalle}>
              {sistema.detalle}
            </div>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1400px] px-8 py-7">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
