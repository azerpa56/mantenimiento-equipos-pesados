import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Truck } from 'lucide-react'
import { ESTADOS_EQUIPO, ETIQUETA_ESTADO_EQUIPO } from '@shared/dominio'
import { api } from '../lib/api'
import { num } from '../lib/formato'
import { useCarga } from '../lib/hooks'
import { EstadoEquipoInsignia } from '../components/insignias'
import { BotonLink, Cargando, Encabezado, Entrada, Selector, Tabla, Tarjeta, Vacio, td, th } from '../components/ui'

export function Equipos() {
  const [texto, setTexto] = useState('')
  const [estado, setEstado] = useState('')
  const [categoria, setCategoria] = useState('')
  const nav = useNavigate()
  const { data: categorias } = useCarga(() => api.categorias.listar(), [])
  const { data, cargando } = useCarga(
    () => api.equipos.listar({ texto: texto.trim() || undefined, estado: estado || undefined, categoria_id: Number(categoria) || undefined }),
    [texto, estado, categoria]
  )

  return (
    <>
      <Encabezado
        titulo="Equipos"
        subtitulo="Flota de maquinaria y equipos pesados"
        acciones={
          <BotonLink to="/equipos/nuevo" variante="primario" icono={Plus}>
            Nuevo equipo
          </BotonLink>
        }
      />
      <Tarjeta sinPadding>
        <div className="flex flex-wrap gap-3 border-b border-slate-100 p-4">
          <div className="relative w-80">
            <Search className="absolute top-2.5 left-3 size-4 text-slate-400" />
            <Entrada className="pl-9" placeholder="Código, serie, marca o modelo" value={texto} onChange={(e) => setTexto(e.target.value)} />
          </div>
          <div className="w-52">
            <Selector value={estado} onChange={(e) => setEstado(e.target.value)}>
              <option value="">Todos los estados</option>
              {ESTADOS_EQUIPO.map((e) => (
                <option key={e} value={e}>
                  {ETIQUETA_ESTADO_EQUIPO[e]}
                </option>
              ))}
            </Selector>
          </div>
          <div className="w-52">
            <Selector value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              <option value="">Todas las categorías</option>
              {categorias?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </Selector>
          </div>
        </div>
        {cargando && !data ? (
          <Cargando />
        ) : !data?.length ? (
          <Vacio
            icono={Truck}
            titulo={texto || estado || categoria ? 'Sin resultados' : 'Aún no hay equipos registrados'}
            texto={texto || estado || categoria ? 'Pruebe con otros filtros.' : 'Registre el primer equipo de la flota para comenzar.'}
            accion={!(texto || estado || categoria) && <BotonLink to="/equipos/nuevo" variante="primario" icono={Plus}>Nuevo equipo</BotonLink>}
          />
        ) : (
          <Tabla>
            <thead>
              <tr>
                <th className={th}>Código</th>
                <th className={th}>Equipo</th>
                <th className={th}>N° serie</th>
                <th className={th}>Categoría</th>
                <th className={`${th} text-right`}>Horómetro</th>
                <th className={th}>Frente actual</th>
                <th className={th}>Estado</th>
                <th className={`${th} text-right`}>OT abiertas</th>
              </tr>
            </thead>
            <tbody>
              {data.map((e) => (
                <tr key={e.id} className="cursor-pointer hover:bg-slate-50" onClick={() => nav(`/equipos/${e.id}`)}>
                  <td className={`${td} font-semibold`}>{e.codigo_interno}</td>
                  <td className={td}>
                    {e.marca} {e.modelo}
                    {e.anio && <span className="text-slate-400"> · {e.anio}</span>}
                  </td>
                  <td className={`${td} font-mono text-xs text-slate-600`}>{e.numero_serie}</td>
                  <td className={td}>{e.categoria}</td>
                  <td className={`${td} text-right tabular-nums`}>{num(e.horometro_actual)} h</td>
                  <td className={`${td} text-slate-600`}>{e.frente_actual ?? '—'}</td>
                  <td className={td}><EstadoEquipoInsignia v={e.estado} /></td>
                  <td className={`${td} text-right tabular-nums`}>{e.ordenes_abiertas || ''}</td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </Tarjeta>
    </>
  )
}
