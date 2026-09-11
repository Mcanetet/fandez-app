-- Pedidos descartados del muro por socio ("No me interesa")
ALTER TABLE users ADD COLUMN wall_dismissed JSON DEFAULT NULL;
