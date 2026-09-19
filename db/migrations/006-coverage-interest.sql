-- Demanda de cobertura: comunas donde aún no operamos

CREATE TABLE IF NOT EXISTS coverage_interest (
  id VARCHAR(64) PRIMARY KEY,
  commune_text VARCHAR(160) NOT NULL,
  email VARCHAR(190) NOT NULL,
  phone VARCHAR(40) NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'client',
  source VARCHAR(64) NOT NULL DEFAULT 'registro',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_coverage_interest_created (created_at),
  INDEX idx_coverage_interest_commune (commune_text),
  INDEX idx_coverage_interest_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
