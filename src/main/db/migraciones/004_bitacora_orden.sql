-- =====================================================================
-- 004 - Bitácora técnica de la orden.
-- Cada fase agrega sus propias entradas (diagnóstico, trabajo realizado,
-- pruebas, notas) en vez de sobrescribir un único texto. Cada entrada
-- indica si el trabajo lo hizo el taller propio o uno externo.
-- Las columnas diagnostico / trabajo_realizado / resultado_pruebas de la
-- orden quedan como resumen derivado de la bitácora (las mantiene el servicio).
-- =====================================================================

CREATE TABLE orden_bitacora (
    id              SERIAL PRIMARY KEY,
    orden_id        INTEGER NOT NULL REFERENCES ordenes_trabajo(id) ON DELETE CASCADE,
    fase            VARCHAR(15) NOT NULL
                    CHECK (fase IN ('recepcion','inspeccion','diagnostico','procura','ejecucion','pruebas','liberacion')),
    fecha_hora      TIMESTAMPTZ NOT NULL,
    responsable_id  INTEGER REFERENCES personal(id),
    descripcion     TEXT NOT NULL,
    ejecucion       VARCHAR(8) NOT NULL DEFAULT 'interno' CHECK (ejecucion IN ('interno','externo')),
    taller_externo  VARCHAR(100),
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_bitacora_externo CHECK (ejecucion = 'interno' OR taller_externo IS NOT NULL)
);
CREATE INDEX ix_bitacora_orden ON orden_bitacora(orden_id, fecha_hora);

-- Los textos ya cargados pasan a ser la primera entrada de su fase.
INSERT INTO orden_bitacora (orden_id, fase, fecha_hora, descripcion)
SELECT id, 'diagnostico', actualizado_en, diagnostico FROM ordenes_trabajo WHERE diagnostico IS NOT NULL
UNION ALL
SELECT id, 'ejecucion', actualizado_en, trabajo_realizado FROM ordenes_trabajo WHERE trabajo_realizado IS NOT NULL
UNION ALL
SELECT id, 'pruebas', actualizado_en, resultado_pruebas FROM ordenes_trabajo WHERE resultado_pruebas IS NOT NULL;
