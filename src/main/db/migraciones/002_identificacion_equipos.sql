-- =====================================================================
-- 002 - Identificación de equipos para la carga desde el listado de flota.
-- Todos los equipos tienen serial o placa (la maquinaria pesada y las
-- unidades nuevas sin título no tienen placa). El código interno es la
-- placa o, si no tiene, el serial, por eso se amplía a 60.
-- =====================================================================

ALTER TABLE equipos ALTER COLUMN codigo_interno TYPE VARCHAR(60);
ALTER TABLE equipos ALTER COLUMN numero_serie DROP NOT NULL;
ALTER TABLE equipos ADD COLUMN placa VARCHAR(20);
ALTER TABLE equipos ADD CONSTRAINT equipos_placa_key UNIQUE (placa);
ALTER TABLE equipos ADD COLUMN serial_motor VARCHAR(60);
ALTER TABLE equipos ADD COLUMN capacidad VARCHAR(60);
ALTER TABLE equipos ADD CONSTRAINT ck_equipo_identificacion CHECK (numero_serie IS NOT NULL OR placa IS NOT NULL);

ALTER TABLE categorias_equipo ALTER COLUMN nombre TYPE VARCHAR(100);
