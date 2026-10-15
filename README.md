# Taller Equipos Pesados

App de escritorio (Windows) para registrar, controlar y trazar mantenimientos y reparaciones de
una flota de maquinaria pesada.

- **Flota**: equipos, categorías, estado derivado de las órdenes abiertas.
- **Uso diario**: parte diario de horómetros por equipo, con frente, actividad y operador.
- **Órdenes de trabajo**: preventivo / correctivo / emergencia, 7 fases secuenciales con fecha,
  hora y responsable de cada transición, retrabajo (retornos) y procura con aprobación y llegada de repuestos.
- **Historial**: intervenciones, fallas recurrentes por sistema, repuestos usados, downtime, costos, MTBF/MTTR.
- **Reporte**: informe formal de la OT imprimible y exportable a PDF.

## Stack

| Capa | Tecnología |
|---|---|
| Escritorio | Electron 44 (instalador NSIS) |
| UI | React 19 + React Router (hash) + Tailwind CSS 4, lucide-react |
| Lógica / datos | Proceso principal de Electron (Node) + `pg` |
| Base de datos | PostgreSQL 18 **embebido** (`embedded-postgres`) o servidor PostgreSQL externo |
| Validación | zod, esquemas compartidos entre UI y proceso principal |
| PDF | `webContents.printToPDF` sobre la misma vista del reporte |

Al abrir la app, PostgreSQL embebido arranca solo (datos en `%APPDATA%/mantenimiento-equipos-pesados/pgdata`),
aplica migraciones y la ventana queda lista. En **Ajustes** se puede apuntar a un servidor
PostgreSQL de la red para que varias PCs compartan los datos.

## Desarrollo

```bash
npm install
npm run dev         # app con recarga en caliente
npm run typecheck
npm run test:e2e    # prueba end-to-end: BD embebida temporal + flujo completo de OT + PDF + capturas
npm run dist        # instalador en dist/
```

> Si se ejecuta desde la terminal integrada de VS Code, quitar `ELECTRON_RUN_AS_NODE`
> (`Remove-Item Env:ELECTRON_RUN_AS_NODE`) o Electron arranca como Node.

## Estructura

```
src/
  shared/              # compartido entre main y renderer
    dominio.ts         #   enums, tipos de fila, máquina de estados de fases
    esquemas.ts        #   validaciones zod
  main/                # proceso principal (Node)
    index.ts           #   ciclo de vida, instancia única, apagado limpio de PostgreSQL
    ipc.ts             #   canal único "api" + contrato tipado (Api) para el renderer
    db/conexion.ts     #   PostgreSQL embebido/externo, pool, transacciones
    db/migraciones/    #   SQL versionado
    servicios/         #   equipos, horometros, ordenes (fases), metricas, catalogos, reportes
    autotest.ts        #   prueba e2e (no se empaqueta)
  preload/             # puente seguro (contextIsolation)
  renderer/src/
    pages/             # Panel, Equipos, EquipoDetalle, Horometros, Ordenes, NuevaOrden,
                       # OrdenDetalle, Catalogos, Ajustes, Reporte
    components/        # ui.tsx (primitivas), fases.tsx (stepper, línea de tiempo, transición)
    lib/               # api tipada, hooks de carga/formulario, formato
docs/esquema-bd.md     # esquema relacional, reglas de fases y fórmulas de métricas
```

## Respaldo

Modo local: cerrar la app y copiar la carpeta `pgdata` (Ajustes → abrir carpeta de datos).
Modo servidor: usar `pg_dump` sobre el servidor.
