-- Recuperación de contraseña por enlace (un solo uso)
ALTER TABLE users ADD COLUMN password_reset_token_hash VARCHAR(128) NULL;
ALTER TABLE users ADD COLUMN password_reset_expires_at DATETIME NULL;
ALTER TABLE users ADD COLUMN password_reset_sent_at DATETIME NULL;
