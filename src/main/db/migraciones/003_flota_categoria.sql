-- =====================================================================
-- 003 - Flota liviana / pesada. Es una propiedad del TIPO de equipo
-- (categoría), no de cada unidad. Se ajusta en Catálogos > Categorías.
-- =====================================================================

ALTER TABLE categorias_equipo
    ADD COLUMN flota VARCHAR(10) NOT NULL DEFAULT 'pesada' CHECK (flota IN ('liviana','pesada'));

-- Clasificación inicial de las categorías ya existentes (mismo criterio que la importación).
UPDATE categorias_equipo SET flota = 'liviana'
WHERE translate(upper(nombre), 'ÁÉÍÓÚÜ', 'AEIOUU') ~ '^(CAMIONETA|AUTOMOVIL|VAN|AMBULANCIA|MOTOCICLETA|MOTO|CUADRILLERA)\M';
