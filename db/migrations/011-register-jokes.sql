-- Chistes del carrusel de registro
CREATE TABLE IF NOT EXISTS register_jokes (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  locale VARCHAR(8) NOT NULL,
  body VARCHAR(280) NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_register_jokes_locale (locale, enabled, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
