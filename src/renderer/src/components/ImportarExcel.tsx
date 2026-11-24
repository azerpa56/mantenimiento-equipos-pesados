import { useState } from 'react'
import { CircleCheck, FileSpreadsheet, FolderOpen, TriangleAlert, Upload } from 'lucide-react'
import { ETIQUETA_ESTADO_EQUIPO, type FilaImportacion, type ResultadoImportacion } from '@shared/dominio'
import { api } from '../lib/api'
import { toast } from './Toasts'
import { Aviso, Boton, Cargando, Insignia, Modal, Pestanas, Tabla, cx, td, th } from './ui'

type Filtro = 'todas' | 'error' | 'crear' | 'actualizar' | 'avisos'
const MAX_FILAS = 300

export function ImportarExcel({ onCerrar, onImportado }: { onCerrar: () => void; onImportado: () => void }) {
  const [ruta, setRuta] = useState<string | null>(null)
  const [previa, setPrevia] = useState<ResultadoImportacion | null>(null)
  const [hecho, setHecho] = useState<ResultadoImportacion | null>(null)
  const [ocupado, setOcupado] = useState<'leyendo' | 'importando' | null>(null)
  const [filtro, setFiltro] = useState<Filtro>('todas')

  async function elegir() {
    const r = await api.importacion.elegirArchivo()
    if (!r) return
    setRuta(r)
    setPrevia(null)
    setOcupado('leyendo')
    try {
      const p = await api.importacion.vistaPrevia(r)
      setPrevia(p)
      setFiltro(p.errores ? 'error' : 'todas')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setOcupado(null)
    }
  }

  async function importar() {
    if (!ruta) return
    setOcupado('importando')
    try {
      const r = await api.importacion.importar(ruta)
      setHecho(r)
      onImportado()
      toast.ok(`${r.crear + r.actualizar} equipos importados`)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setOcupado(null)
    }
  }

  const filas = (previa?.filas ?? []).filter((f) =>
    filtro === 'todas' ? true : filtro === 'avisos' ? f.accion !== 'error' && f.mensaje : f.accion === filtro
  )
  const conAvisos = previa?.filas.filter((f) => f.accion !== 'error' && f.mensaje).length ?? 0

  return (
    <Modal
      abierto
      ancho="max-w-6xl"
      titulo="Importar equipos desde Excel"
      subtitulo="Listado de maquinarias y equipos (hojas Equipos y Equipos Auxiliares). Se reconoce por los encabezados FRENTE, TIPO, MARCA, MODELO, SERIAL, PLACA, AÑO y ESTADO."
      onCerrar={onCerrar}
      pie={
        hecho ? (
          <Boton variante="primario" onClick={onCerrar}>
            Listo
          </Boton>
        ) : (
          <>
            <Boton onClick={onCerrar}>Cancelar</Boton>
            <Boton
              variante="primario"
              icono={Upload}
              cargando={ocupado === 'importando'}
              disabled={!previa || previa.crear + previa.actualizar === 0 || !!ocupado}
              onClick={importar}
            >
              {previa ? `Importar ${(previa.crear + previa.actualizar).toLocaleString('es-VE')} equipos` : 'Importar'}
            </Boton>
          </>
        )
      }
    >
      {hecho ? (
        <div className="flex flex-col items-center py-8 text-center">
          <CircleCheck className="size-12 text-emerald-500" />
          <p className="mt-3 text-lg font-semibold text-slate-900">Importación completada</p>
          <p className="mt-1 text-sm text-slate-600">
            {hecho.crear.toLocaleString('es-VE')} equipos nuevos · {hecho.actualizar.toLocaleString('es-VE')} actualizados
            {hecho.errores > 0 && ` · ${hecho.errores} omitidos por error`}
          </p>
          {(hecho.categorias_nuevas.length > 0 || hecho.frentes_nuevos.length > 0) && (
            <p className="mt-1 text-sm text-slate-500">
              Se crearon {hecho.categorias_nuevas.length} categorías y {hecho.frentes_nuevos.length} frentes de trabajo.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
            <FileSpreadsheet className="size-8 shrink-0 text-emerald-600" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-slate-900">{ruta ?? 'Ningún archivo seleccionado'}</div>
              <div className="text-xs text-slate-500">Código interno = placa; si no tiene placa, el serial. Reimportar el mismo listado actualiza, no duplica.</div>
            </div>
            <Boton icono={FolderOpen} onClick={elegir} disabled={!!ocupado}>
              {ruta ? 'Cambiar archivo' : 'Seleccionar archivo'}
            </Boton>
          </div>

          {ocupado === 'leyendo' && <Cargando texto="Leyendo y validando el archivo…" />}

          {previa && (
            <>
              <div className="grid grid-cols-4 gap-3">
                <Resumen etiqueta="Filas leídas" valor={previa.total} />
                <Resumen etiqueta="Nuevos" valor={previa.crear} tono="text-emerald-700" />
                <Resumen etiqueta="Ya existen (se actualizan)" valor={previa.actualizar} tono="text-sky-700" />
                <Resumen etiqueta="Con error (se omiten)" valor={previa.errores} tono={previa.errores ? 'text-red-700' : undefined} />
              </div>
              {(previa.categorias_nuevas.length > 0 || previa.frentes_nuevos.length > 0) && (
                <Aviso tono="azul">
                  Se crearán <strong>{previa.categorias_nuevas.length} categorías</strong> ({previa.categorias_nuevas.slice(0, 8).join(', ')}
                  {previa.categorias_nuevas.length > 8 && '…'}) y <strong>{previa.frentes_nuevos.length} frentes de trabajo</strong>.
                </Aviso>
              )}
              {previa.errores > 0 && (
                <Aviso tono="rojo" icono={TriangleAlert}>
                  {previa.errores} fila(s) no se importarán. Puede corregirlas en el Excel y volver a importar: lo ya cargado no se duplica.
                </Aviso>
              )}

              <div>
                <Pestanas<Filtro>
                  activa={filtro}
                  onChange={setFiltro}
                  items={[
                    { id: 'todas', etiqueta: 'Todas', cuenta: previa.total },
                    { id: 'error', etiqueta: 'Errores', cuenta: previa.errores },
                    { id: 'avisos', etiqueta: 'Avisos', cuenta: conAvisos },
                    { id: 'crear', etiqueta: 'Nuevos', cuenta: previa.crear },
                    { id: 'actualizar', etiqueta: 'Existentes', cuenta: previa.actualizar }
                  ]}
                />
                <div className="max-h-[42vh] overflow-auto rounded-lg border border-slate-200">
                  <Tabla>
                    <thead className="sticky top-0">
                      <tr>
                        <th className={th}>Hoja / fila</th>
                        <th className={th}>Acción</th>
                        <th className={th}>Código</th>
                        <th className={th}>Tipo</th>
                        <th className={th}>Marca / modelo</th>
                        <th className={th}>Frente</th>
                        <th className={th}>Estado</th>
                        <th className={th}>Observación</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filas.slice(0, MAX_FILAS).map((f) => (
                        <FilaVista key={`${f.hoja}-${f.fila}`} f={f} />
                      ))}
                    </tbody>
                  </Tabla>
                  {filas.length > MAX_FILAS && (
                    <p className="px-3 py-2 text-xs text-slate-500">Mostrando {MAX_FILAS} de {filas.length.toLocaleString('es-VE')} filas.</p>
                  )}
                  {filas.length === 0 && <p className="px-3 py-6 text-center text-sm text-slate-400">Sin filas en este filtro.</p>}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  )
}

function Resumen({ etiqueta, valor, tono }: { etiqueta: string; valor: number; tono?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 px-4 py-3">
      <div className="text-xs text-slate-500">{etiqueta}</div>
      <div className={cx('text-2xl font-semibold tabular-nums', tono ?? 'text-slate-900')}>{valor.toLocaleString('es-VE')}</div>
    </div>
  )
}

function FilaVista({ f }: { f: FilaImportacion }) {
  return (
    <tr className={f.accion === 'error' ? 'bg-red-50/60' : ''}>
      <td className={`${td} text-xs whitespace-nowrap text-slate-500`}>
        {f.hoja} · {f.fila}
      </td>
      <td className={td}>
        {f.accion === 'crear' ? <Insignia tono="verde">Nuevo</Insignia> : f.accion === 'actualizar' ? <Insignia tono="azul">Existe</Insignia> : <Insignia tono="rojo">Error</Insignia>}
      </td>
      <td className={`${td} font-mono text-xs`}>{f.codigo ?? '—'}</td>
      <td className={`${td} text-xs`}>{f.tipo}</td>
      <td className={`${td} text-xs`}>
        {f.marca} {f.modelo}
      </td>
      <td className={`${td} text-xs text-slate-600`}>{f.frente ?? '—'}</td>
      <td className={`${td} text-xs whitespace-nowrap`}>
        {ETIQUETA_ESTADO_EQUIPO[f.estado]}
        {f.estado_original && <div className="text-slate-400">({f.estado_original})</div>}
      </td>
      <td className={cx(td, 'text-xs', f.accion === 'error' ? 'font-medium text-red-700' : 'text-amber-700')}>{f.mensaje}</td>
    </tr>
  )
}
