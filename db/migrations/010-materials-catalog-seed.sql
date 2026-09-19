-- Sincroniza productos/materiales en pricing_config (MySQL).
-- Preferible: node scripts/seed-materials-catalog.js
-- Este archivo documenta el destino; el seed JS escribe el JSON completo fusionado.

-- Tras ejecutar el script, verifica:
-- SELECT JSON_LENGTH(config, '$.materialsCatalog') AS productos FROM pricing_config WHERE id = 'default';
