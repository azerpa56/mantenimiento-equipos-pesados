import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileSpreadsheet, Plus, Search, Truck } from 'lucide-react'
import { ESTADOS_EQUIPO, ETIQUETA_ESTADO_EQUIPO, type Flota } from '@shared/dominio'
import { api } from '../lib/api'
import { num } from '../lib/formato'
import { useCarga } from '../lib/hooks'
import { EstadoEquipoInsignia } from '../components/insignias'
import { ImportarExcel } from '../components/ImportarExcel'
import { Boton, BotonLink, Cargando, Encabezado, Entrada, Segmentos, Selector, Tabla, Tarjeta, Vacio, td, th } from '../components/ui'

export function Equipos() {
  const [texto, setTexto] = useState('')
  const [estado, setEstado] = useState('')
  const [categoria, setCategoria] = useState('')
  const [flota, setFlota] = useState<Flota | ''>('')
  const [importando, setImportando] = useState(false)
  const nav = useNavigate()
  const { data: categorias, recargar: recargarCategorias } = useCarga(() => api.categorias.listar(), [])
  const { data, cargando, recargar } = useCarga(
    () =>
      api.equipos.listar({
        texto: texto.trim() || undefined,
        estado: estado || undefined,
        categoria_id: Number(categoria) || undefined,
        flota: flota || undefined
      }),
    [texto, estado, categoria, flota]
  )
  const filtrando = !!(texto || estado || categoria || flota)
  const categoriasVisibles = categorias?.filter((c) => !flota || c.flota === flota)

  function elegirFlota(f: Flota | '') {
    setFlota(f)
    // La categoría elegida puede no pertenecer a la nueva flota.
    const c = categorias?.find((x) => String(x.id) === categoria)
    if (c && f && c.flota !== f) setCategoria('')
  }

  return (
    <>
      <Encabezado
        titulo="Equipos"
        subtitulo="Flota de maquinaria y equipos pesados"
        acciones={
          <>
            <Boton icono={FileSpreadsheet} onClick={() => setImportando(true)}>
              Importar Excel
            </Boton>
            <BotonLink to="/equipos/nuevo" variante="primario" icono={Plus}>
              Nuevo equipo
            </BotonLink>
          </>
        }
      />
      <Tarjeta sinPadding>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
          <div className="w-72">
            <Segmentos<Flota | 'todas'>
              valor={flota || 'todas'}
              onChange={(v) => elegirFlota(v === 'todas' ? '' : v)}
              opciones={[
                { valor: 'todas', etiqueta: 'Toda la flota' },
                { valor: 'liviana', etiqueta: 'Liviana', clase: 'text-violet-700' },
                { valor: 'pesada', etiqueta: 'Pesada' }
              ]}
            />
          </div>
          <div className="relative w-80">
            <Search className="absolute top-2.5 left-3 size-4 text-slate-400" />
            <Entrada className="pl-9" placeholder="Código, placa, serial, marca, modelo o tipo" value={texto} onChange={(e) => setTexto(e.target.value)} />
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
          <div className="w-60">
            <Selector value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              <option value="">Todas las categorías</option>
              {categoriasVisibles?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </Selector>
          </div>
          {data && <span className="ml-auto text-sm text-slate-500">{data.length.toLocaleString('es-VE')} equipo(s)</span>}
        </div>
        {cargando && !data ? (
          <Cargando />
        ) : !data?.length ? (
          <Vacio
            icono={Truck}
            titulo={filtrando ? 'Sin resultados' : 'Aún no hay equipos registrados'}
            texto={filtrando ? 'Pruebe con otros filtros.' : 'Importe el listado de flota desde Excel o registre los equipos uno a uno.'}
            accion={
              !filtrando && (
                <div className="flex gap-2">
                  <Boton variante="primario" icono={FileSpreadsheet} onClick={() => setImportando(true)}>
                    Importar Excel
                  </Boton>
                  <BotonLink to="/equipos/nuevo" icono={Plus}>
                    Nuevo equipo
                  </BotonLink>
                </div>
              )
            }
          />
        ) : (
          <Tabla>
            <thead>
              <tr>
                <th className={th}>Código</th>
                <th className={th}>Equipo</th>
                <th className={th}>Placa</th>
                <th className={th}>Serial</th>
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
                  <td className={`${td} font-semibold whitespace-nowrap`}>{e.codigo_interno}</td>
                  <td className={td}>
                    {e.marca} {e.modelo}
                    {e.anio && <span className="text-slate-400"> · {e.anio}</span>}
                  </td>
                  <td className={`${td} font-mono text-xs whitespace-nowrap text-slate-600`}>{e.placa ?? '—'}</td>
                  <td className={`${td} font-mono text-xs text-slate-600`}>{e.numero_serie ?? '—'}</td>
                  <td className={td}>
                    {e.categoria}
                    <div className={`text-xs ${e.flota === 'liviana' ? 'text-violet-600' : 'text-slate-400'}`}>{e.flota === 'liviana' ? 'Liviana' : 'Pesada'}</div>
                  </td>
                  <td className={`${td} text-right tabular-nums whitespace-nowrap`}>{num(e.horometro_actual)} h</td>
                  <td className={`${td} text-slate-600`}>{e.frente_actual ?? '—'}</td>
                  <td className={td}><EstadoEquipoInsignia v={e.estado} /></td>
                  <td className={`${td} text-right tabular-nums`}>{e.ordenes_abiertas || ''}</td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </Tarjeta>
      {importando && (
        <ImportarExcel
          onCerrar={() => setImportando(false)}
          onImportado={() => {
            recargar()
            recargarCategorias()
          }}
        />
      )}
    </>
  )
}
