import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Save } from 'lucide-react'
import { equipoSchema } from '@shared/esquemas'
import { api } from '../lib/api'
import { useCarga, useFormulario } from '../lib/hooks'
import { toast } from '../components/Toasts'
import { AreaTexto, Boton, Campo, Cargando, Encabezado, Entrada, Selector, Tarjeta } from '../components/ui'

const VACIO = {
  codigo_interno: '',
  numero_serie: '',
  placa: '',
  serial_motor: '',
  capacidad: '',
  marca: '',
  modelo: '',
  anio: '',
  categoria_id: '',
  horometro_actual: '0',
  frente_actual_id: '',
  observaciones: ''
}

export function EquipoFormulario() {
  const { id } = useParams()
  const editar = !!id
  const nav = useNavigate()
  const f = useFormulario<Record<string, string>>(VACIO)
  const { data: categorias } = useCarga(() => api.categorias.listar(), [])
  const { data: frentes } = useCarga(() => api.frentes.listar(), [])
  const { data: equipo, cargando } = useCarga(() => (editar ? api.equipos.obtener(Number(id)) : Promise.resolve(null)), [id])

  const { setValores } = f
  useEffect(() => {
    if (!equipo) return
    setValores({
      codigo_interno: equipo.codigo_interno,
      numero_serie: equipo.numero_serie ?? '',
      placa: equipo.placa ?? '',
      serial_motor: equipo.serial_motor ?? '',
      capacidad: equipo.capacidad ?? '',
      marca: equipo.marca,
      modelo: equipo.modelo,
      anio: equipo.anio?.toString() ?? '',
      categoria_id: String(equipo.categoria_id),
      horometro_actual: String(equipo.horometro_actual),
      frente_actual_id: equipo.frente_actual_id?.toString() ?? '',
      observaciones: equipo.observaciones ?? ''
    })
  }, [equipo, setValores])

  const guardar = () =>
    f.enviar(equipoSchema, async (v) => {
      const e = editar ? await api.equipos.actualizar({ id: Number(id), datos: v }) : await api.equipos.crear(v)
      toast.ok(editar ? 'Equipo actualizado' : `Equipo ${e.codigo_interno} registrado`)
      nav(`/equipos/${e.id}`, { replace: true })
    })

  if (editar && cargando) return <Cargando />

  return (
    <>
      <Encabezado titulo={editar ? `Editar ${equipo?.codigo_interno ?? ''}` : 'Nuevo equipo'} volver={editar ? `/equipos/${id}` : '/equipos'} />
      <form
        onSubmit={(e) => {
          e.preventDefault()
          guardar()
        }}
      >
        <Tarjeta className="max-w-4xl">
          <div className="grid grid-cols-6 gap-4">
            <Campo etiqueta="Placa" error={f.errores.placa} className="col-span-2" ayuda="La maquinaria pesada puede no tener.">
              <Entrada
                {...f.campo('placa')}
                autoFocus
                onChange={(e) => {
                  const viejo = f.valores.placa || f.valores.numero_serie
                  f.set('placa', e.target.value)
                  // El código sigue a la placa (o al serial) mientras no se haya escrito otro a mano.
                  if (!editar && f.valores.codigo_interno === viejo) f.set('codigo_interno', e.target.value || f.valores.numero_serie)
                }}
              />
            </Campo>
            <Campo etiqueta="Serial de chasis / equipo" requerido={!f.valores.placa} error={f.errores.numero_serie} className="col-span-2">
              <Entrada
                {...f.campo('numero_serie')}
                onChange={(e) => {
                  f.set('numero_serie', e.target.value)
                  if (!editar && !f.valores.placa && f.valores.codigo_interno === f.valores.numero_serie) f.set('codigo_interno', e.target.value)
                }}
              />
            </Campo>
            <Campo etiqueta="Código interno" requerido error={f.errores.codigo_interno} className="col-span-2" ayuda="Por defecto, la placa o el serial.">
              <Entrada {...f.campo('codigo_interno')} />
            </Campo>
            <Campo etiqueta="Serial de motor" error={f.errores.serial_motor} className="col-span-2">
              <Entrada {...f.campo('serial_motor')} />
            </Campo>
            <Campo etiqueta="Capacidad" error={f.errores.capacidad} className="col-span-2">
              <Entrada {...f.campo('capacidad')} placeholder="Ej.: 20 m³, 50 TON, 5000 L" />
            </Campo>
            <Campo etiqueta="Categoría" requerido error={f.errores.categoria_id} className="col-span-2">
              <Selector {...f.campo('categoria_id')}>
                <option value="">Seleccione…</option>
                {(['liviana', 'pesada'] as const).map((fl) => (
                  <optgroup key={fl} label={fl === 'liviana' ? 'Flota liviana' : 'Flota pesada'}>
                    {categorias
                      ?.filter((c) => c.flota === fl && (c.activo || String(c.id) === f.valores.categoria_id))
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </Selector>
            </Campo>
            <Campo etiqueta="Marca" requerido error={f.errores.marca} className="col-span-2">
              <Entrada {...f.campo('marca')} placeholder="Caterpillar" />
            </Campo>
            <Campo etiqueta="Modelo" requerido error={f.errores.modelo} className="col-span-2">
              <Entrada {...f.campo('modelo')} placeholder="336D2" />
            </Campo>
            <Campo etiqueta="Año" error={f.errores.anio} className="col-span-2">
              <Entrada type="number" {...f.campo('anio')} />
            </Campo>
            <Campo
              etiqueta="Horómetro actual (h)"
              requerido
              error={f.errores.horometro_actual}
              ayuda={editar ? 'Se actualiza solo con el registro diario; corríjalo aquí solo si es necesario.' : 'Lectura al momento del registro.'}
              className="col-span-3"
            >
              <Entrada type="number" step="0.1" {...f.campo('horometro_actual')} />
            </Campo>
            <Campo etiqueta="Frente actual" error={f.errores.frente_actual_id} className="col-span-3">
              <Selector {...f.campo('frente_actual_id')}>
                <option value="">— Sin asignar —</option>
                {frentes?.filter((x) => x.activo || String(x.id) === f.valores.frente_actual_id).map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.nombre}
                  </option>
                ))}
              </Selector>
            </Campo>
            <Campo etiqueta="Observaciones" error={f.errores.observaciones} className="col-span-6">
              <AreaTexto {...f.campo('observaciones')} />
            </Campo>
          </div>
          <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Boton onClick={() => nav(-1)}>Cancelar</Boton>
            <Boton type="submit" variante="primario" icono={Save} cargando={f.enviando}>
              Guardar
            </Boton>
          </div>
        </Tarjeta>
      </form>
    </>
  )
}
