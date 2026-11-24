import { useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BookOpen, Pencil, Plus } from 'lucide-react'
import type { ZodType } from 'zod'
import { categoriaSchema, frenteSchema, personalSchema, repuestoSchema } from '@shared/esquemas'
import { api } from '../lib/api'
import { dinero } from '../lib/formato'
import { useCarga, useFormulario } from '../lib/hooks'
import { toast } from '../components/Toasts'
import type { Flota } from '@shared/dominio'
import { FlotaInsignia } from '../components/insignias'
import { Boton, Campo, Cargando, Encabezado, Entrada, Insignia, Interruptor, Modal, Pestanas, Selector, Tabla, Tarjeta, Vacio, td, th } from '../components/ui'

type Pestana = 'personal' | 'repuestos' | 'frentes' | 'categorias'
type Fila = { id: number; activo: boolean } & Record<string, unknown>

interface Definicion {
  titulo: string
  singular: string
  esquema: ZodType
  listar: () => Promise<Fila[]>
  guardar: (a: { id?: number | null; datos: Record<string, unknown> }) => Promise<unknown>
  columnas: { titulo: string; valor: (f: Fila) => ReactNode; derecha?: boolean }[]
  campos: { k: string; etiqueta: string; requerido?: boolean; tipo?: string; ancho?: 1 | 2; opciones?: { valor: string; etiqueta: string }[] }[]
}

const DEF: Record<Pestana, Definicion> = {
  personal: {
    titulo: 'Personal de taller',
    singular: 'persona',
    esquema: personalSchema,
    listar: () => api.personal.listar() as unknown as Promise<Fila[]>,
    guardar: (a) => api.personal.guardar(a),
    columnas: [
      { titulo: 'Nombre', valor: (f) => <span className="font-medium">{String(f.nombre)}</span> },
      { titulo: 'Cargo', valor: (f) => (f.cargo as string) ?? '—' },
      { titulo: 'Especialidad', valor: (f) => (f.especialidad as string) ?? '—' },
      { titulo: 'Costo / hora', valor: (f) => dinero(f.costo_hora as number), derecha: true }
    ],
    campos: [
      { k: 'nombre', etiqueta: 'Nombre completo', requerido: true, ancho: 2 },
      { k: 'cargo', etiqueta: 'Cargo' },
      { k: 'especialidad', etiqueta: 'Especialidad' },
      { k: 'costo_hora', etiqueta: 'Costo por hora ($)', requerido: true, tipo: 'number' }
    ]
  },
  repuestos: {
    titulo: 'Catálogo de repuestos',
    singular: 'repuesto',
    esquema: repuestoSchema,
    listar: () => api.repuestos.listar() as unknown as Promise<Fila[]>,
    guardar: (a) => api.repuestos.guardar(a),
    columnas: [
      { titulo: 'Código', valor: (f) => <span className="font-mono text-xs">{String(f.codigo)}</span> },
      { titulo: 'Descripción', valor: (f) => <span className="font-medium">{String(f.descripcion)}</span> },
      { titulo: 'N° de parte', valor: (f) => (f.numero_parte as string) ?? '—' },
      { titulo: 'Unidad', valor: (f) => String(f.unidad) },
      { titulo: 'Costo ref.', valor: (f) => dinero(f.costo_referencia as number), derecha: true }
    ],
    campos: [
      { k: 'codigo', etiqueta: 'Código', requerido: true },
      { k: 'numero_parte', etiqueta: 'N° de parte (fabricante)' },
      { k: 'descripcion', etiqueta: 'Descripción', requerido: true, ancho: 2 },
      { k: 'unidad', etiqueta: 'Unidad', requerido: true },
      { k: 'costo_referencia', etiqueta: 'Costo de referencia ($)', requerido: true, tipo: 'number' }
    ]
  },
  frentes: {
    titulo: 'Frentes de trabajo',
    singular: 'frente',
    esquema: frenteSchema,
    listar: () => api.frentes.listar() as unknown as Promise<Fila[]>,
    guardar: (a) => api.frentes.guardar(a),
    columnas: [
      { titulo: 'Nombre', valor: (f) => <span className="font-medium">{String(f.nombre)}</span> },
      { titulo: 'Ubicación', valor: (f) => (f.ubicacion as string) ?? '—' }
    ],
    campos: [
      { k: 'nombre', etiqueta: 'Nombre', requerido: true, ancho: 2 },
      { k: 'ubicacion', etiqueta: 'Ubicación', ancho: 2 }
    ]
  },
  categorias: {
    titulo: 'Categorías de equipo',
    singular: 'categoría',
    esquema: categoriaSchema,
    listar: () => api.categorias.listar() as unknown as Promise<Fila[]>,
    guardar: (a) => api.categorias.guardar(a),
    columnas: [
      { titulo: 'Nombre', valor: (f) => <span className="font-medium">{String(f.nombre)}</span> },
      { titulo: 'Flota', valor: (f) => <FlotaInsignia v={f.flota as Flota} /> }
    ],
    campos: [
      { k: 'nombre', etiqueta: 'Nombre', requerido: true },
      {
        k: 'flota',
        etiqueta: 'Flota',
        requerido: true,
        opciones: [
          { valor: 'pesada', etiqueta: 'Flota pesada' },
          { valor: 'liviana', etiqueta: 'Flota liviana' }
        ]
      }
    ]
  }
}

export function Catalogos() {
  const [q, setQ] = useSearchParams()
  const pestana = (q.get('tab') as Pestana) || 'personal'
  return (
    <>
      <Encabezado titulo="Catálogos" subtitulo="Datos maestros usados en órdenes, horómetros y equipos" />
      <Pestanas<Pestana>
        activa={pestana}
        onChange={(t) => setQ({ tab: t }, { replace: true })}
        items={[
          { id: 'personal', etiqueta: 'Personal' },
          { id: 'repuestos', etiqueta: 'Repuestos' },
          { id: 'frentes', etiqueta: 'Frentes de trabajo' },
          { id: 'categorias', etiqueta: 'Categorías' }
        ]}
      />
      <Catalogo key={pestana} def={DEF[pestana]} />
    </>
  )
}

function Catalogo({ def }: { def: Definicion }) {
  const { data, cargando, recargar } = useCarga(def.listar, [])
  const [editando, setEditando] = useState<Fila | 'nuevo' | null>(null)

  return (
    <Tarjeta
      sinPadding
      titulo={def.titulo}
      acciones={
        <Boton tamano="sm" variante="primario" icono={Plus} onClick={() => setEditando('nuevo')}>
          Agregar {def.singular}
        </Boton>
      }
    >
      {cargando && !data ? (
        <Cargando />
      ) : !data?.length ? (
        <Vacio icono={BookOpen} titulo={`Sin registros`} />
      ) : (
        <Tabla>
          <thead>
            <tr>
              {def.columnas.map((c) => (
                <th key={c.titulo} className={`${th} ${c.derecha ? 'text-right' : ''}`}>
                  {c.titulo}
                </th>
              ))}
              <th className={th}>Estado</th>
              <th className={th}></th>
            </tr>
          </thead>
          <tbody>
            {data.map((f) => (
              <tr key={f.id} className={f.activo ? '' : 'text-slate-400'}>
                {def.columnas.map((c) => (
                  <td key={c.titulo} className={`${td} ${c.derecha ? 'text-right tabular-nums' : ''}`}>
                    {c.valor(f)}
                  </td>
                ))}
                <td className={td}>{f.activo ? <Insignia tono="verde">Activo</Insignia> : <Insignia>Inactivo</Insignia>}</td>
                <td className={`${td} w-10`}>
                  <button className="text-slate-400 hover:text-slate-800" title="Editar" onClick={() => setEditando(f)}>
                    <Pencil className="size-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
      {editando && (
        <FormularioCatalogo
          def={def}
          fila={editando === 'nuevo' ? null : editando}
          onCerrar={() => setEditando(null)}
          onHecho={() => {
            setEditando(null)
            recargar()
          }}
        />
      )}
    </Tarjeta>
  )
}

function FormularioCatalogo({ def, fila, onCerrar, onHecho }: { def: Definicion; fila: Fila | null; onCerrar: () => void; onHecho: () => void }) {
  const inicial: Record<string, unknown> = { activo: fila?.activo ?? true }
  for (const c of def.campos)
    inicial[c.k] = fila?.[c.k] != null ? String(fila[c.k]) : c.k === 'unidad' ? 'UND' : (c.opciones?.[0].valor ?? '')
  const f = useFormulario(inicial)
  const guardar = () =>
    f.enviar(def.esquema, async (v) => {
      await def.guardar({ id: fila?.id ?? null, datos: v })
      toast.ok('Guardado')
      onHecho()
    })

  return (
    <Modal
      abierto
      titulo={fila ? `Editar ${def.singular}` : `Agregar ${def.singular}`}
      onCerrar={onCerrar}
      ancho="max-w-lg"
      pie={
        <>
          <Boton onClick={onCerrar}>Cancelar</Boton>
          <Boton variante="primario" cargando={f.enviando} onClick={guardar}>
            Guardar
          </Boton>
        </>
      }
    >
      <form
        className="grid grid-cols-2 gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          guardar()
        }}
      >
        {def.campos.map((c, i) => (
          <Campo key={c.k} etiqueta={c.etiqueta} requerido={c.requerido} error={f.errores[c.k]} className={c.ancho === 2 ? 'col-span-2' : ''}>
            {c.opciones ? (
              <Selector {...f.campo(c.k)}>
                {c.opciones.map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.etiqueta}
                  </option>
                ))}
              </Selector>
            ) : (
              <Entrada type={c.tipo ?? 'text'} step={c.tipo === 'number' ? '0.01' : undefined} autoFocus={i === 0} {...f.campo(c.k)} />
            )}
          </Campo>
        ))}
        <div className="col-span-2">
          <Interruptor activo={!!f.valores.activo} onChange={(x) => f.set('activo', x)} etiqueta="Activo" ayuda="Los inactivos no aparecen en las listas de selección." />
        </div>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  )
}
