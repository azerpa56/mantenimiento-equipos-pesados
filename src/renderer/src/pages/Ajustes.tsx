import { useEffect, useState } from 'react'
import { Database, FolderOpen, PlugZap, RotateCcw, Server } from 'lucide-react'
import type { ModoBaseDatos } from '@shared/dominio'
import { configExternoSchema } from '@shared/esquemas'
import { api } from '../lib/api'
import { useCarga, useFormulario } from '../lib/hooks'
import { toast } from '../components/Toasts'
import { Aviso, Boton, Campo, Cargando, Encabezado, Entrada, Interruptor, Tarjeta, cx } from '../components/ui'

export function Ajustes() {
  const { data: cfg } = useCarga(() => api.sistema.config(), [])
  const [modo, setModo] = useState<ModoBaseDatos>('embebido')
  const [puerto, setPuerto] = useState('54329')
  const [probando, setProbando] = useState(false)
  const [prueba, setPrueba] = useState<{ ok: boolean; texto: string } | null>(null)
  const f = useFormulario<Record<string, unknown>>({ host: '', puerto: '5432', baseDatos: 'mantenimiento', usuario: 'postgres', password: '', ssl: false })

  const { setValores } = f
  useEffect(() => {
    if (!cfg) return
    setModo(cfg.modo)
    setPuerto(String(cfg.puertoEmbebido))
    if (cfg.externo) setValores({ ...cfg.externo, puerto: String(cfg.externo.puerto) })
  }, [cfg, setValores])

  async function probar() {
    setPrueba(null)
    const r = configExternoSchema.safeParse(f.valores)
    if (!r.success) return f.enviar(configExternoSchema, async () => {})
    setProbando(true)
    try {
      const v = await api.sistema.probarExterno(f.valores)
      setPrueba({ ok: true, texto: v })
    } catch (e) {
      setPrueba({ ok: false, texto: (e as Error).message })
    } finally {
      setProbando(false)
    }
  }

  const guardar = () =>
    f.enviar(modo === 'externo' ? configExternoSchema : null, async (v) => {
      await api.sistema.guardarConfig({ modo, puertoEmbebido: Number(puerto), externo: modo === 'externo' || v.host ? v : null })
      toast.ok('Configuración guardada. Reiniciando…')
      setTimeout(() => api.sistema.reiniciar(), 800)
    })

  if (!cfg) return <Cargando />

  return (
    <>
      <Encabezado titulo="Ajustes" subtitulo="Conexión a la base de datos PostgreSQL" />
      <div className="max-w-3xl space-y-6">
        <div className="grid grid-cols-2 gap-4">
          {(
            [
              { m: 'embebido', icono: Database, titulo: 'Base de datos local', texto: 'PostgreSQL incluido en la app. Se inicia solo. Ideal para una sola PC.' },
              { m: 'externo', icono: Server, titulo: 'Servidor PostgreSQL', texto: 'Varias PCs comparten los mismos datos en un servidor de la red o la nube.' }
            ] as const
          ).map(({ m, icono: Icono, titulo, texto }) => (
            <button
              key={m}
              type="button"
              onClick={() => setModo(m)}
              className={cx('rounded-xl border-2 bg-white p-4 text-left transition-colors', modo === m ? 'border-amber-500 ring-4 ring-amber-100' : 'border-slate-200 hover:border-slate-300')}
            >
              <Icono className={cx('size-5', modo === m ? 'text-amber-600' : 'text-slate-400')} />
              <div className="mt-2 font-semibold text-slate-900">{titulo}</div>
              <div className="mt-0.5 text-sm text-slate-500">{texto}</div>
            </button>
          ))}
        </div>

        {modo === 'embebido' ? (
          <Tarjeta titulo="Base de datos local">
            <div className="grid grid-cols-3 gap-4">
              <Campo etiqueta="Puerto local" ayuda="Cámbielo solo si otro programa usa el puerto.">
                <Entrada type="number" value={puerto} onChange={(e) => setPuerto(e.target.value)} />
              </Campo>
              <Campo etiqueta="Carpeta de datos" className="col-span-2">
                <div className="flex gap-2">
                  <Entrada value={cfg.carpetaEmbebida} readOnly className="font-mono text-xs" />
                  <Boton icono={FolderOpen} onClick={() => api.sistema.abrirCarpetaDatos()} title="Abrir carpeta" />
                </div>
              </Campo>
            </div>
            <p className="mt-4 text-xs text-slate-500">Para respaldar, cierre la aplicación y copie la carpeta de datos completa.</p>
          </Tarjeta>
        ) : (
          <Tarjeta titulo="Servidor PostgreSQL">
            <div className="grid grid-cols-4 gap-4">
              <Campo etiqueta="Servidor (host)" requerido error={f.errores.host} className="col-span-3">
                <Entrada {...f.campo('host')} placeholder="192.168.1.20 o db.miempresa.com" />
              </Campo>
              <Campo etiqueta="Puerto" requerido error={f.errores.puerto}>
                <Entrada type="number" {...f.campo('puerto')} />
              </Campo>
              <Campo etiqueta="Base de datos" requerido error={f.errores.baseDatos} className="col-span-2">
                <Entrada {...f.campo('baseDatos')} />
              </Campo>
              <Campo etiqueta="Usuario" requerido error={f.errores.usuario} className="col-span-2">
                <Entrada {...f.campo('usuario')} />
              </Campo>
              <Campo etiqueta="Contraseña" error={f.errores.password} className="col-span-2">
                <Entrada type="password" {...f.campo('password')} />
              </Campo>
              <div className="col-span-2 flex items-end pb-1">
                <Interruptor activo={!!f.valores.ssl} onChange={(x) => f.set('ssl', x)} etiqueta="Usar SSL" />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <Boton icono={PlugZap} cargando={probando} onClick={probar}>
                Probar conexión
              </Boton>
            </div>
            {prueba && (
              <div className="mt-3">
                <Aviso tono={prueba.ok ? 'verde' : 'rojo'}>{prueba.ok ? `Conexión correcta · ${prueba.texto}` : prueba.texto}</Aviso>
              </div>
            )}
            <p className="mt-4 text-xs text-slate-500">La base de datos debe existir; las tablas se crean automáticamente al conectar por primera vez.</p>
          </Tarjeta>
        )}

        <div className="flex justify-end">
          <Boton variante="primario" icono={RotateCcw} cargando={f.enviando} onClick={guardar}>
            Guardar y reiniciar
          </Boton>
        </div>
      </div>
    </>
  )
}
