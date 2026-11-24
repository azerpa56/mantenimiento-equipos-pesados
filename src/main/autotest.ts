// Prueba end-to-end: PostgreSQL embebido en carpeta temporal + flujo completo
// de una OT + capturas de pantalla. Uso: npm run build && npx electron out/main/autotest.js <carpeta-salida>
import { app } from 'electron'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const salida = process.argv.find((a) => a.startsWith('--salida='))?.slice(9) ?? join(tmpdir(), 'taller-autotest')
mkdirSync(salida, { recursive: true })
app.setPath('userData', join(salida, `datos-${Date.now()}`))
process.env.TALLER_RAIZ = join(import.meta.dirname, '..', '..')
app.on('window-all-closed', () => {}) // la prueba abre y cierra ventanas ocultas

const log: string[] = []
let fallos = 0
const ok = (m: string) => log.push(`OK   ${m}`)
const mal = (m: string) => {
  fallos++
  log.push(`FAIL ${m}`)
}
async function debeFallar(nombre: string, fn: () => Promise<unknown>, contiene: string) {
  try {
    await fn()
    mal(`${nombre}: no falló`)
  } catch (e) {
    const { traducirError } = await import('./errores')
    const t = traducirError(e)
    const txt = `${t.error} ${JSON.stringify(t.campos ?? {})}`
    if (txt.includes(contiene)) ok(`${nombre} -> ${t.error}`)
    else mal(`${nombre}: error inesperado: ${txt}`)
  }
}
function igual(nombre: string, real: unknown, esperado: unknown) {
  if (JSON.stringify(real) === JSON.stringify(esperado)) ok(`${nombre} = ${JSON.stringify(real)}`)
  else mal(`${nombre}: esperado ${JSON.stringify(esperado)}, obtuvo ${JSON.stringify(real)}`)
}

const hace = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString()
const dia = (d: number) => {
  const x = new Date(Date.now() - d * 86_400_000)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

app.whenReady().then(async () => {
  const { registrarIpc, handlers: h } = await import('./ipc')
  const { detenerBaseDatos } = await import('./db/conexion')
  const { crearVentana, esperarReporte } = await import('./ventanas')
  registrarIpc()
  try {
    const est = await h.sistema.estado()
    if (!est.listo) throw new Error(`BD no lista: ${est.error}`)
    ok(`BD: ${est.detalle}`)

    // Catálogos
    const jefe = await h.personal.guardar({ datos: { nombre: 'Carlos Rivas', cargo: 'Jefe de taller', costo_hora: '18' } })
    const mec = await h.personal.guardar({ datos: { nombre: 'Luis Pérez', cargo: 'Mecánico', especialidad: 'Hidráulica', costo_hora: '12.5' } })
    const comp = await h.personal.guardar({ datos: { nombre: 'Ana Gómez', cargo: 'Compras', costo_hora: '10' } })
    const frente = await h.frentes.guardar({ datos: { nombre: 'Mina Norte - Tajo 2', ubicacion: 'Km 14' } })
    const sello = await h.repuestos.guardar({ datos: { codigo: 'kit-sel-336', descripcion: 'Kit de sellos cilindro de levante', numero_parte: '4I-7487', unidad: 'kit', costo_referencia: '340' } })
    const aceite = await h.repuestos.guardar({ datos: { codigo: 'ACE-HYD-10W', descripcion: 'Aceite hidráulico 10W', unidad: 'lt', costo_referencia: '6.2' } })
    igual('código repuesto en mayúsculas', sello.codigo, 'KIT-SEL-336')

    // Equipos
    const exc = await h.equipos.crear({ codigo_interno: 'exc-012', numero_serie: 'cat0336dkxyz', marca: 'Caterpillar', modelo: '336D2', anio: '2019', categoria_id: '1', horometro_actual: '12450', frente_actual_id: frente.id })
    const cam = await h.equipos.crear({ codigo_interno: 'CAM-201', numero_serie: 'KOM-HD785-881', marca: 'Komatsu', modelo: 'HD785-7', anio: '2017', categoria_id: '2', horometro_actual: '30210.5' })
    await h.equipos.crear({ codigo_interno: 'CAR-003', numero_serie: 'VOL-L150H-77', marca: 'Volvo', modelo: 'L150H', anio: '2021', categoria_id: '3', horometro_actual: '6100' })
    await debeFallar('código duplicado', () => h.equipos.crear({ codigo_interno: 'EXC-012', numero_serie: 'otra', marca: 'x', modelo: 'y', categoria_id: '1', horometro_actual: '0' }), 'código interno')
    await debeFallar('validación zod equipo', () => h.equipos.crear({ codigo_interno: '', numero_serie: 'z', marca: 'x', modelo: 'y', categoria_id: '', horometro_actual: '-3' }), 'categoria_id')

    // Horómetros
    const n = await h.horometros.registrarLote([
      { equipo_id: exc.id, fecha: dia(3), horometro_inicial: '12450', horometro_final: '12459.5', frente_id: frente.id, actividad: 'Excavación', operador: 'J. Mora' },
      { equipo_id: exc.id, fecha: dia(2), horometro_inicial: '12459.5', horometro_final: '12468', frente_id: frente.id, actividad: 'Carga' },
      { equipo_id: cam.id, fecha: dia(2), horometro_inicial: '30210.5', horometro_final: '30221' }
    ])
    igual('lecturas registradas', n, 3)
    await debeFallar('lectura solapada', () => h.horometros.registrar({ equipo_id: exc.id, fecha: dia(1), horometro_inicial: '12465', horometro_final: '12470' }), 'choca')
    await debeFallar('más de 24 h', () => h.horometros.registrar({ equipo_id: exc.id, fecha: dia(1), horometro_inicial: '12468', horometro_final: '12500' }), '24 h')
    await debeFallar('fecha futura', () => h.horometros.registrar({ equipo_id: exc.id, fecha: dia(-2), horometro_inicial: '12468', horometro_final: '12470' }), 'futura')
    igual('horómetro actual EXC-012', (await h.equipos.obtener(exc.id)).horometro_actual, 12468)

    // OT correctiva: recorrido completo por las 7 fases
    let o = await h.ordenes.crear({ equipo_id: exc.id, tipo: 'correctivo', prioridad: 'alta', descripcion: 'Fuga de aceite en cilindro de levante, pérdida de fuerza en pluma', sistema_afectado: 'hidraulico', solicitado_por: 'J. Mora (operador)', horometro_ingreso: '12468', equipo_detenido: true, fecha_apertura: hace(50), responsable_id: jefe.id, observaciones: 'Llega con tanque al 40%' })
    igual('folio', o.folio, `OT-${new Date().getFullYear()}-00001`)
    igual('estado equipo al abrir', (await h.equipos.obtener(exc.id)).estado, 'en_reparacion')
    const t = (accion: string, destino: string, extra: Record<string, unknown>, horas: number) =>
      h.ordenes.transicionar({ orden_id: o.id, accion, destino, fecha_hora: hace(horas), cerrado_por_id: jefe.id, responsable_id: mec.id, ...extra })

    await debeFallar('saltar fases', () => t('avanzar', 'diagnostico', {}, 49), 'no permitida')
    o = await t('avanzar', 'inspeccion', { observaciones: 'Inspección visual hecha' }, 48)
    await debeFallar('fecha anterior a fase', () => t('avanzar', 'diagnostico', {}, 49.5), 'anterior')
    o = await t('avanzar', 'diagnostico', {}, 46)
    await debeFallar('salir de diagnóstico sin diagnóstico', () => t('avanzar', 'procura', {}, 44), 'Diagnóstico')
    o = await t('avanzar', 'procura', { diagnostico: 'Sellos del vástago dañados, rayadura leve', causa_raiz: 'Desgaste normal' }, 44)
    igual('fase', o.fase_actual, 'procura')

    o = await h.ordenes.agregarRepuesto({ orden_id: o.id, repuesto_id: sello.id, cantidad: '1', costo_unitario: '340', proveedor: 'Finning', numero_requisicion: 'RQ-5541', solicitado_por_id: mec.id, fecha_solicitud: hace(43.5) })
    o = await h.ordenes.agregarRepuesto({ orden_id: o.id, repuesto_id: aceite.id, cantidad: '20', costo_unitario: '6.2', solicitado_por_id: mec.id, fecha_solicitud: hace(43) })
    await debeFallar('aprobar antes de solicitar', () => h.ordenes.accionRepuesto({ id: o.repuestos[0].id, accion: 'aprobar', responsable_id: jefe.id, fecha_hora: hace(44) }), 'anterior a la solicitud')
    await debeFallar('ejecución con repuestos pendientes', () => t('avanzar', 'ejecucion', {}, 30), 'repuesto')
    await debeFallar('recibir sin aprobar', () => h.ordenes.accionRepuesto({ id: o.repuestos[0].id, accion: 'recibir', responsable_id: comp.id, fecha_hora: hace(40) }), 'aprobado')
    o = await h.ordenes.accionRepuesto({ id: o.repuestos[0].id, accion: 'aprobar', responsable_id: jefe.id, fecha_hora: hace(42) })
    o = await h.ordenes.accionRepuesto({ id: o.repuestos[0].id, accion: 'recibir', responsable_id: comp.id, fecha_hora: hace(30) })
    o = await h.ordenes.accionRepuesto({ id: o.repuestos[1].id, accion: 'aprobar', responsable_id: jefe.id, fecha_hora: hace(42) })
    o = await h.ordenes.accionRepuesto({ id: o.repuestos[1].id, accion: 'recibir', responsable_id: comp.id, fecha_hora: hace(41) })
    o = await t('avanzar', 'ejecucion', { observaciones: 'Repuestos completos' }, 29)

    o = await h.ordenes.agregarManoObra({ orden_id: o.id, personal_id: mec.id, fase: 'diagnostico', fecha: dia(2), horas: '2' })
    o = await h.ordenes.agregarManoObra({ orden_id: o.id, personal_id: mec.id, fase: 'ejecucion', fecha: dia(1), horas: '6.5', descripcion: 'Desmontaje y cambio de sellos' })
    await debeFallar('pruebas sin trabajo realizado', () => t('avanzar', 'pruebas', {}, 20), 'Trabajo realizado')
    o = await t('avanzar', 'pruebas', { trabajo_realizado: 'Cambio de kit de sellos y relleno de aceite' }, 20)
    await debeFallar('retorno sin motivo', () => t('retornar', 'ejecucion', {}, 18), 'motivo')
    o = await t('retornar', 'ejecucion', { motivo_retorno: 'Persiste goteo en conexión de manguera' }, 18)
    o = await t('avanzar', 'pruebas', {}, 15)
    await debeFallar('liberar sin receptor', () => t('avanzar', 'liberacion', { resultado_pruebas: 'OK' }, 10), 'recibe')
    await debeFallar('horómetro salida < ingreso', () => t('avanzar', 'liberacion', { resultado_pruebas: 'OK', recibido_por: 'Sup. Díaz', horometro_salida: '12000' }, 10), 'ingreso')
    o = await t('avanzar', 'liberacion', { resultado_pruebas: 'Prueba de levante a carga máxima sin fugas', recibido_por: 'Sup. Díaz', horometro_salida: '12469.2' }, 10)
    igual('estado OT', o.estado, 'cerrada')
    igual('secuencia de fases', o.fases.map((f) => f.fase), ['recepcion', 'inspeccion', 'diagnostico', 'procura', 'ejecucion', 'pruebas', 'ejecucion', 'pruebas', 'liberacion'])
    igual('costo repuestos', o.totales.costo_repuestos, 464)
    igual('costo mano obra', o.totales.costo_mano_obra, 106.25)
    igual('downtime ≈ 40 h', Math.round(o.totales.downtime_horas), 40)
    igual('horas reparación (ejec+pruebas) ≈ 19 h', Math.round(o.totales.horas_reparacion), 19)
    igual('estado equipo al liberar', (await h.equipos.obtener(exc.id)).estado, 'operativo')
    await debeFallar('modificar OT cerrada', () => h.ordenes.agregarManoObra({ orden_id: o.id, personal_id: mec.id, fase: 'pruebas', fecha: dia(0), horas: '1' }), 'cerrada')

    // Preventivo omitiendo procura
    let p = await h.ordenes.crear({ equipo_id: cam.id, tipo: 'preventivo', prioridad: 'media', descripcion: 'Servicio de 500 h: aceite motor y filtros', solicitado_por: 'Planificación', horometro_ingreso: '30221', equipo_detenido: true, fecha_apertura: hace(8), responsable_id: jefe.id })
    igual('estado camión', (await h.equipos.obtener(cam.id)).estado, 'en_mantenimiento')
    const tp = (accion: string, destino: string, extra: Record<string, unknown>, horas: number) =>
      h.ordenes.transicionar({ orden_id: p.id, accion, destino, fecha_hora: hace(horas), cerrado_por_id: jefe.id, responsable_id: mec.id, ...extra })
    p = await tp('avanzar', 'inspeccion', {}, 7.5)
    p = await tp('avanzar', 'diagnostico', {}, 7)
    p = await tp('omitir_procura', 'ejecucion', { diagnostico: 'Servicio según plan' }, 6.5)
    igual('procura omitida', p.fases.filter((f) => f.omitida).map((f) => f.fase), ['procura'])

    // Emergencia cancelada
    const cargador = (await h.equipos.listar({ texto: 'CAR-003' }))[0]
    let c = await h.ordenes.crear({ equipo_id: cargador.id, tipo: 'emergencia', prioridad: 'critica', descripcion: 'No arranca, posible falla eléctrica', solicitado_por: 'Operador', equipo_detenido: true, fecha_apertura: hace(3), responsable_id: jefe.id })
    c = await h.ordenes.cancelar({ orden_id: c.id, fecha_hora: hace(1), responsable_id: jefe.id, motivo: 'Era el corta corriente apagado' })
    igual('OT cancelada', c.estado, 'cancelada')
    igual('cargador vuelve a operativo', (await h.equipos.obtener(cargador.id)).estado, 'operativo')
    await debeFallar('eliminar equipo con historial', () => h.equipos.eliminar(cargador.id), 'historial')

    // Métricas
    const hist = await h.equipos.historial(exc.id)
    igual('fallas EXC-012', hist.metricas.total_fallas, 1)
    igual('horas operadas', hist.metricas.horas_operadas, 18)
    igual('MTBF = 18/1', hist.metricas.mtbf_horas, 18)
    igual('MTTR ≈ 19', Math.round(hist.metricas.mttr_horas ?? 0), 19)
    igual('repuestos usados', hist.repuestos_usados.length, 2)
    const dash = await h.metricas.dashboard()
    igual('dashboard OT abiertas en ejecución', dash.ordenes_por_fase.ejecucion, 1)
    igual('dashboard equipos', dash.total_equipos, 3)
    log.push(`INFO dashboard: ${JSON.stringify(dash.equipos_por_estado)} últimos30=${JSON.stringify(dash.ultimos_30)}`)

    // Importación del listado real de flota (si se pasa --excel=ruta)
    const excel = process.argv.find((a) => a.startsWith('--excel='))?.slice(8)
    if (excel) {
      const t0 = Date.now()
      const pv = await h.importacion.vistaPrevia(excel)
      log.push(`INFO vista previa en ${Date.now() - t0} ms: total=${pv.total} crear=${pv.crear} actualizar=${pv.actualizar} errores=${pv.errores} categorías nuevas=${pv.categorias_nuevas.length} frentes nuevos=${pv.frentes_nuevos.length}`)
      for (const f of pv.filas.filter((x) => x.accion === 'error')) log.push(`INFO   error ${f.hoja} fila ${f.fila}: ${f.mensaje}`)
      for (const f of pv.filas.filter((x) => x.accion !== 'error' && x.mensaje).slice(0, 5)) log.push(`INFO   aviso ${f.hoja} fila ${f.fila}: ${f.mensaje}`)
      igual('filas leídas (1328 + 182)', pv.total, 1510)
      igual('filas sin placa ni serial', pv.errores, 2)
      const t1 = Date.now()
      const r = await h.importacion.importar(excel)
      ok(`importados ${r.crear} en ${Date.now() - t1} ms`)
      const otra = await h.importacion.vistaPrevia(excel)
      igual('reimportar no duplica (crear)', otra.crear, 0)
      igual('reimportar: existentes', otra.actualizar, 1508)
      const hilux = (await h.equipos.listar({ texto: 'A85DR1K' }))[0]
      igual('código = placa', hilux?.codigo_interno, 'A85DR1K')
      igual('serial de chasis', hilux?.numero_serie, '8XAFU29G4JR001045')
      const grua = (await h.equipos.listar({ texto: 'LFCNNF5P9G2000353' }))[0]
      igual('sin placa: código = serial', grua?.codigo_interno, 'LFCNNF5P9G2000353')
      igual('categoría sin "↳"', (await h.categorias.listar()).some((c) => c.nombre.startsWith('↳')), false)
      const fuera = await h.equipos.listar({ estado: 'fuera_servicio' })
      igual('fuera de servicio (98 inop + 24 desinc + 7 mant + 2 aux inop)', fuera.length, 131)
      // 400 livianas en el Excel menos las 2 filas sin placa ni serial (un automóvil y una camioneta)
      igual('flota liviana', (await h.equipos.listar({ flota: 'liviana' })).length, 398)
      igual('flota pesada', (await h.equipos.listar({ flota: 'pesada' })).length, 1508 + 3 - 398)
      igual('hilux es liviana', hilux?.flota, 'liviana')
      igual('OT por flota pesada (EXC/CAM/CAR)', (await h.ordenes.listar({ flota: 'pesada' })).length, 3)
      igual('OT por flota liviana', (await h.ordenes.listar({ flota: 'liviana' })).length, 0)
      const volteo = (await h.categorias.listar()).find((c) => c.nombre === 'VOLTEO')!
      await h.categorias.guardar({ id: volteo.id, datos: { nombre: 'VOLTEO', flota: 'liviana', activo: true } })
      igual('cambiar flota de una categoría mueve sus equipos', (await h.equipos.listar({ flota: 'liviana' })).length, 398 + 252)
      await h.categorias.guardar({ id: volteo.id, datos: { nombre: 'VOLTEO', flota: 'pesada', activo: true } })
      const r2 = await h.importacion.importar(excel)
      igual('segunda importación: nuevos', r2.crear, 0)
      igual('total equipos tras 2 importaciones', (await h.equipos.listar()).length, 3 + 1508)
    }

    // PDF del reporte
    app.on('web-contents-created', (_, wc) =>
      wc.on('console-message', (e) => e.level === 'error' && log.push(`CONSOLE ${e.message}`))
    )
    const wr = crearVentana({ ruta: `/reporte/${o.id}`, mostrar: false, fondo: '#ffffff' })
    await esperarReporte(wr)
    const pdf = await wr.webContents.printToPDF({ pageSize: 'Letter', printBackground: true, margins: { top: 0.4, bottom: 0.5, left: 0.4, right: 0.4 } })
    writeFileSync(join(salida, 'reporte.pdf'), pdf)
    wr.destroy()
    ok(`PDF generado (${pdf.length} bytes)`)

    // Capturas de la UI
    const w = crearVentana({ mostrar: false, ancho: 1440, alto: 900 })
    w.webContents.setBackgroundThrottling(false)
    await new Promise<void>((r) => w.webContents.once('did-finish-load', () => r()))
    await w.webContents.executeJavaScript(
      `window.__errores = []; addEventListener('error', (e) => __errores.push(String(e.error?.stack || e.message)));`
    )
    await new Promise((r) => setTimeout(r, 1500))
    for (const [nombre, ruta] of [
      ['panel', '/'],
      ['orden-cerrada', `/ordenes/${o.id}`],
      ['orden-ejecucion', `/ordenes/${p.id}`],
      ['nueva-orden', `/ordenes/nueva?equipo=${exc.id}`],
      ['equipo', `/equipos/${exc.id}`],
      ['horometros', '/horometros'],
      ['ordenes', '/ordenes?estado='],
      ['equipos', '/equipos'],
      ['orden-cerrada-2', `/ordenes/${o.id}`]
    ]) {
      await w.webContents.executeJavaScript(`location.hash = '#${ruta}'`)
      const t0 = Date.now()
      let listo = false
      while (!listo && Date.now() - t0 < 10000) {
        await new Promise((r) => setTimeout(r, 300))
        listo = await w.webContents.executeJavaScript(`!document.body.innerText.includes('Cargando')`)
      }
      if (!listo) mal(`pantalla ${nombre} sigue cargando tras 10 s`)
      const texto: string = await w.webContents.executeJavaScript(`document.getElementById('root').innerText.replace(/\\s+/g, ' ').slice(0, 160)`)
      const errores: string = await w.webContents.executeJavaScript(`(window.__errores || []).join(' | ')`)
      if (!texto.trim()) mal(`pantalla ${nombre} quedó vacía. Errores: ${errores}`)
      else log.push(`INFO ${nombre} (${Date.now() - t0} ms): ${texto}`)
      // Las ventanas ocultas no repintan solas: forzar un frame nuevo antes de capturar.
      w.webContents.invalidate()
      await new Promise((r) => setTimeout(r, 400))
      writeFileSync(join(salida, `${nombre}.png`), (await w.webContents.capturePage()).toPNG())
    }
    w.destroy()
    ok('capturas guardadas')
  } catch (e) {
    mal(`excepción: ${(e as Error).stack ?? e}`)
  }
  log.push(fallos ? `\n${fallos} FALLO(S)` : '\nTODO OK')
  writeFileSync(join(salida, 'resultado.txt'), log.join('\n'))
  console.log(log.join('\n'))
  await detenerBaseDatos()
  app.exit(fallos ? 1 : 0)
})
