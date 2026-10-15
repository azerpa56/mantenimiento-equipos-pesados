-- =====================================================================
-- 001 - Esquema inicial: flota, uso diario, órdenes de trabajo, fases,
-- repuestos, mano de obra y vistas de métricas.
-- Los "enums" son VARCHAR + CHECK (no CREATE TYPE) para poder ampliarlos
-- con un ALTER sencillo en migraciones futuras.
-- =====================================================================

-- ---------- Catálogos ----------
CREATE TABLE categorias_equipo (
    id          SERIAL PRIMARY KEY,
    nombre      VARCHAR(60) NOT NULL UNIQUE,
    activo      BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE frentes_trabajo (
    id          SERIAL PRIMARY KEY,
    nombre      VARCHAR(100) NOT NULL UNIQUE,
    ubicacion   VARCHAR(200),
    activo      BOOLEAN NOT NULL DEFAULT TRUE
);

-- Mecánicos, inspectores, jefes de taller, compradores... Sin login:
-- el responsable de cada transición se elige de esta tabla.
CREATE TABLE personal (
    id            SERIAL PRIMARY KEY,
    nombre        VARCHAR(100) NOT NULL,
    cargo         VARCHAR(60),
    especialidad  VARCHAR(60),
    costo_hora    NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (costo_hora >= 0),
    activo        BOOLEAN NOT NULL DEFAULT TRUE
);

-- Catálogo maestro de repuestos.
CREATE TABLE repuestos (
    id                SERIAL PRIMARY KEY,
    codigo            VARCHAR(40) NOT NULL UNIQUE,
    descripcion       VARCHAR(200) NOT NULL,
    numero_parte      VARCHAR(60),
    unidad            VARCHAR(15) NOT NULL DEFAULT 'UND',
    costo_referencia  NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (costo_referencia >= 0),
    activo            BOOLEAN NOT NULL DEFAULT TRUE
);

-- ---------- Flota ----------
CREATE TABLE equipos (
    id                SERIAL PRIMARY KEY,
    codigo_interno    VARCHAR(30) NOT NULL UNIQUE,
    numero_serie      VARCHAR(60) NOT NULL UNIQUE,
    marca             VARCHAR(60) NOT NULL,
    modelo            VARCHAR(60) NOT NULL,
    anio              INTEGER CHECK (anio BETWEEN 1950 AND 2100),
    categoria_id      INTEGER NOT NULL REFERENCES categorias_equipo(id),
    horometro_actual  NUMERIC(10,1) NOT NULL DEFAULT 0 CHECK (horometro_actual >= 0),
    estado            VARCHAR(20) NOT NULL DEFAULT 'operativo'
                      CHECK (estado IN ('operativo','en_mantenimiento','en_reparacion','fuera_servicio')),
    frente_actual_id  INTEGER REFERENCES frentes_trabajo(id),
    observaciones     TEXT,
    creado_en         TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_equipos_categoria ON equipos(categoria_id);
CREATE INDEX ix_equipos_estado ON equipos(estado);

-- Uso diario. Puede haber varios registros por día (turnos / frentes),
-- pero sus rangos de horómetro no pueden solaparse (validado en el servicio
-- con bloqueo de fila sobre el equipo).
CREATE TABLE horometros_diarios (
    id                 SERIAL PRIMARY KEY,
    equipo_id          INTEGER NOT NULL REFERENCES equipos(id) ON DELETE RESTRICT,
    fecha              DATE NOT NULL,
    horometro_inicial  NUMERIC(10,1) NOT NULL CHECK (horometro_inicial >= 0),
    horometro_final    NUMERIC(10,1) NOT NULL,
    horas_trabajadas   NUMERIC(6,1) GENERATED ALWAYS AS (horometro_final - horometro_inicial) STORED,
    frente_id          INTEGER REFERENCES frentes_trabajo(id),
    actividad          VARCHAR(200),
    operador           VARCHAR(100),
    observaciones      TEXT,
    creado_en          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_horometro_rango CHECK (horometro_final >= horometro_inicial),
    CONSTRAINT ck_horometro_24h  CHECK (horometro_final - horometro_inicial <= 24)
);
CREATE INDEX ix_horometros_equipo_fecha ON horometros_diarios(equipo_id, fecha);

-- ---------- Órdenes de trabajo ----------
CREATE TABLE secuencias (
    clave  VARCHAR(30) PRIMARY KEY,
    valor  INTEGER NOT NULL
);

CREATE TABLE ordenes_trabajo (
    id                  SERIAL PRIMARY KEY,
    folio               VARCHAR(20) NOT NULL UNIQUE,           -- OT-2026-00001
    equipo_id           INTEGER NOT NULL REFERENCES equipos(id) ON DELETE RESTRICT,
    tipo                VARCHAR(15) NOT NULL CHECK (tipo IN ('preventivo','correctivo','emergencia')),
    prioridad           VARCHAR(10) NOT NULL DEFAULT 'media' CHECK (prioridad IN ('baja','media','alta','critica')),
    descripcion         TEXT NOT NULL,                          -- síntoma / motivo de ingreso
    sistema_afectado    VARCHAR(30),                            -- motor, hidraulico... (fallas recurrentes)
    solicitado_por      VARCHAR(100) NOT NULL,
    horometro_ingreso   NUMERIC(10,1) CHECK (horometro_ingreso >= 0),
    equipo_detenido     BOOLEAN NOT NULL DEFAULT TRUE,          -- cuenta para downtime
    -- Datos técnicos que se completan en el avance de fases
    diagnostico         TEXT,
    causa_raiz          TEXT,
    trabajo_realizado   TEXT,
    resultado_pruebas   TEXT,
    recibido_por        VARCHAR(100),                           -- quien recibe el equipo en la liberación
    horometro_salida    NUMERIC(10,1) CHECK (horometro_salida >= 0),
    -- Estado
    fase_actual         VARCHAR(15) NOT NULL DEFAULT 'recepcion'
                        CHECK (fase_actual IN ('recepcion','inspeccion','diagnostico','procura','ejecucion','pruebas','liberacion')),
    estado              VARCHAR(10) NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta','cerrada','cancelada')),
    fecha_apertura      TIMESTAMPTZ NOT NULL DEFAULT now(),
    fecha_cierre        TIMESTAMPTZ,
    motivo_cancelacion  TEXT,
    creado_en           TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_ot_cierre CHECK (
        (estado = 'abierta' AND fecha_cierre IS NULL) OR
        (estado <> 'abierta' AND fecha_cierre IS NOT NULL AND fecha_cierre >= fecha_apertura)
    ),
    CONSTRAINT ck_ot_cerrada_liberada CHECK (estado <> 'cerrada' OR fase_actual = 'liberacion'),
    CONSTRAINT ck_ot_horometros CHECK (horometro_salida IS NULL OR horometro_ingreso IS NULL OR horometro_salida >= horometro_ingreso)
);
CREATE INDEX ix_ot_equipo ON ordenes_trabajo(equipo_id);
CREATE INDEX ix_ot_estado_fase ON ordenes_trabajo(estado, fase_actual);

-- Cada fila es una "visita" a una fase. Una OT puede volver a una fase
-- anterior (p.ej. pruebas fallidas -> ejecución), por eso no es UNIQUE(orden, fase).
-- Transición = cerrar la fila abierta (fin, cerrado_por) + abrir la siguiente (inicio, responsable).
CREATE TABLE fases_orden (
    id                SERIAL PRIMARY KEY,
    orden_id          INTEGER NOT NULL REFERENCES ordenes_trabajo(id) ON DELETE CASCADE,
    fase              VARCHAR(15) NOT NULL
                      CHECK (fase IN ('recepcion','inspeccion','diagnostico','procura','ejecucion','pruebas','liberacion')),
    secuencia         INTEGER NOT NULL,
    inicio            TIMESTAMPTZ NOT NULL,
    fin               TIMESTAMPTZ,
    responsable_id    INTEGER NOT NULL REFERENCES personal(id),  -- responsable al abrir la fase
    cerrado_por_id    INTEGER REFERENCES personal(id),           -- quien firma el cierre / transición
    observaciones     TEXT,                                       -- notas de cierre de la fase
    omitida           BOOLEAN NOT NULL DEFAULT FALSE,             -- procura sin repuestos
    motivo_retorno    TEXT,                                       -- si esta visita es un retroceso
    CONSTRAINT uq_fase_secuencia UNIQUE (orden_id, secuencia),
    CONSTRAINT ck_fase_fechas CHECK (fin IS NULL OR fin >= inicio),
    CONSTRAINT ck_fase_cierre CHECK ((fin IS NULL) = (cerrado_por_id IS NULL))
);
-- A lo sumo UNA fase abierta por orden.
CREATE UNIQUE INDEX uq_fase_abierta ON fases_orden(orden_id) WHERE fin IS NULL;

-- Repuestos solicitados para una OT (procura).
-- Flujo: solicitado -> aprobado -> recibido   |   solicitado/aprobado -> rechazado
CREATE TABLE orden_repuestos (
    id                   SERIAL PRIMARY KEY,
    orden_id             INTEGER NOT NULL REFERENCES ordenes_trabajo(id) ON DELETE CASCADE,
    repuesto_id          INTEGER NOT NULL REFERENCES repuestos(id),
    cantidad             NUMERIC(10,2) NOT NULL CHECK (cantidad > 0),
    costo_unitario       NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (costo_unitario >= 0),
    costo_total          NUMERIC(16,2) GENERATED ALWAYS AS (cantidad * costo_unitario) STORED,
    proveedor            VARCHAR(100),
    numero_requisicion   VARCHAR(40),
    estado               VARCHAR(10) NOT NULL DEFAULT 'solicitado'
                         CHECK (estado IN ('solicitado','aprobado','rechazado','recibido')),
    fecha_solicitud      TIMESTAMPTZ NOT NULL DEFAULT now(),
    solicitado_por_id    INTEGER NOT NULL REFERENCES personal(id),
    fecha_aprobacion     TIMESTAMPTZ,
    aprobado_por_id      INTEGER REFERENCES personal(id),
    fecha_llegada        TIMESTAMPTZ,
    recibido_por_id      INTEGER REFERENCES personal(id),
    motivo_rechazo       TEXT
);
CREATE INDEX ix_orden_repuestos_orden ON orden_repuestos(orden_id);

-- Horas-hombre cargadas a la OT, imputadas a una fase.
CREATE TABLE orden_mano_obra (
    id           SERIAL PRIMARY KEY,
    orden_id     INTEGER NOT NULL REFERENCES ordenes_trabajo(id) ON DELETE CASCADE,
    personal_id  INTEGER NOT NULL REFERENCES personal(id),
    fase         VARCHAR(15) NOT NULL
                 CHECK (fase IN ('recepcion','inspeccion','diagnostico','procura','ejecucion','pruebas','liberacion')),
    fecha        DATE NOT NULL,
    horas        NUMERIC(6,2) NOT NULL CHECK (horas > 0 AND horas <= 24),
    costo_hora   NUMERIC(12,2) NOT NULL CHECK (costo_hora >= 0),     -- snapshot del costo del técnico
    costo_total  NUMERIC(14,2) GENERATED ALWAYS AS (horas * costo_hora) STORED,
    descripcion  VARCHAR(300)
);
CREATE INDEX ix_mano_obra_orden ON orden_mano_obra(orden_id);

-- ---------- Vistas de métricas ----------
CREATE VIEW v_orden_totales AS
SELECT
    o.id AS orden_id,
    COALESCE((SELECT SUM(r.costo_total) FROM orden_repuestos r
              WHERE r.orden_id = o.id AND r.estado <> 'rechazado'), 0)::NUMERIC(16,2)      AS costo_repuestos,
    COALESCE((SELECT SUM(m.horas) FROM orden_mano_obra m WHERE m.orden_id = o.id), 0)::NUMERIC(10,2) AS horas_hombre,
    COALESCE((SELECT SUM(m.costo_total) FROM orden_mano_obra m WHERE m.orden_id = o.id), 0)::NUMERIC(16,2) AS costo_mano_obra,
    -- Downtime: desde la apertura hasta el cierre (o ahora), solo si el equipo quedó detenido.
    CASE WHEN o.equipo_detenido
         THEN EXTRACT(EPOCH FROM (COALESCE(o.fecha_cierre, now()) - o.fecha_apertura)) / 3600.0
         ELSE 0 END::NUMERIC(12,2)                                                          AS downtime_horas,
    -- Tiempo de reparación efectiva: ejecución + pruebas (sin esperas de procura).
    COALESCE((SELECT SUM(EXTRACT(EPOCH FROM (COALESCE(f.fin, now()) - f.inicio))) / 3600.0
              FROM fases_orden f
              WHERE f.orden_id = o.id AND f.fase IN ('ejecucion','pruebas')), 0)::NUMERIC(12,2) AS horas_reparacion
FROM ordenes_trabajo o;

CREATE VIEW v_equipo_metricas AS
WITH base AS (
    SELECT
        e.id AS equipo_id,
        COUNT(o.id)                                                                     AS total_ordenes,
        COUNT(o.id) FILTER (WHERE o.tipo IN ('correctivo','emergencia') AND o.estado <> 'cancelada') AS total_fallas,
        COUNT(o.id) FILTER (WHERE o.tipo = 'preventivo' AND o.estado <> 'cancelada')    AS total_preventivos,
        COUNT(o.id) FILTER (WHERE o.estado = 'abierta')                                 AS ordenes_abiertas,
        COALESCE(SUM(t.downtime_horas), 0)                                              AS downtime_horas,
        COALESCE(SUM(t.costo_repuestos), 0)                                             AS costo_repuestos,
        COALESCE(SUM(t.costo_mano_obra), 0)                                             AS costo_mano_obra,
        AVG(t.horas_reparacion) FILTER (WHERE o.tipo IN ('correctivo','emergencia') AND o.estado = 'cerrada') AS mttr_horas,
        AVG(t.downtime_horas)   FILTER (WHERE o.tipo IN ('correctivo','emergencia') AND o.estado = 'cerrada') AS mdt_horas
    FROM equipos e
    LEFT JOIN ordenes_trabajo o ON o.equipo_id = e.id
    LEFT JOIN v_orden_totales t ON t.orden_id = o.id
    GROUP BY e.id
)
SELECT
    b.*,
    COALESCE(h.horas_operadas, 0) AS horas_operadas,
    -- MTBF en horas de operación (horómetro) entre fallas.
    CASE WHEN b.total_fallas > 0 AND COALESCE(h.horas_operadas, 0) > 0
         THEN h.horas_operadas / b.total_fallas END::NUMERIC(12,2) AS mtbf_horas,
    -- Disponibilidad inherente = MTBF / (MTBF + MTTR)
    CASE WHEN b.total_fallas > 0 AND COALESCE(h.horas_operadas, 0) > 0 AND b.mttr_horas IS NOT NULL
         THEN (h.horas_operadas / b.total_fallas) / ((h.horas_operadas / b.total_fallas) + b.mttr_horas) * 100
         END::NUMERIC(6,2) AS disponibilidad_pct
FROM base b
LEFT JOIN (
    SELECT equipo_id, SUM(horas_trabajadas) AS horas_operadas
    FROM horometros_diarios GROUP BY equipo_id
) h ON h.equipo_id = b.equipo_id;

-- ---------- Datos iniciales ----------
INSERT INTO categorias_equipo (nombre) VALUES
    ('Excavadora'), ('Camión minero'), ('Cargador frontal'), ('Retroexcavadora'),
    ('Motoniveladora'), ('Tractor de oruga'), ('Rodillo compactador'), ('Camión volteo'),
    ('Grúa'), ('Otro');
