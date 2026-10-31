-- Lista de usuarios bloqueados por convivencia (sexo, violencia, lenguaje)
ALTER TABLE users ADD COLUMN blocked_user_ids JSON DEFAULT NULL;
