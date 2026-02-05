-- 20260204_calc_core_tables.sql
-- Core tables for the Calculation Layer

-- 1. Exchange Rates (Pivot: KZT)
CREATE TABLE IF NOT EXISTS calc_exchange_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  base_currency VARCHAR(3) NOT NULL DEFAULT 'KZT',
  rates JSONB NOT NULL, -- { "USD": 450.5, "EUR": 490.2, ... }
  source VARCHAR(50) NOT NULL DEFAULT 'NBRK',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(date, base_currency, source)
);

CREATE INDEX IF NOT EXISTS idx_calc_rates_date ON calc_exchange_rates(date DESC);

-- 2. Country Tax Configuration
CREATE TABLE IF NOT EXISTS calc_country_tax_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code VARCHAR(2) NOT NULL, -- RU, KZ, etc.
  currency VARCHAR(3) NOT NULL,
  import_vat_default_rate NUMERIC(5,4) NOT NULL, -- e.g. 0.12 for 12%
  import_vat_reduced_rate NUMERIC(5,4),
  vat_base_formula TEXT NOT NULL DEFAULT 'customs_value + duty + fees',
  config_version VARCHAR(50) NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_to DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calc_country_active ON calc_country_tax_config(country_code, active, valid_from DESC);

-- 3. Customs Fees Configuration
CREATE TABLE IF NOT EXISTS calc_customs_fees_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code VARCHAR(2) NOT NULL,
  fee_type VARCHAR(100) NOT NULL, -- "Customs Processing", "Registry Fee", etc.
  calculation_rule JSONB NOT NULL, -- { "type": "fixed", "amount": 500, "currency": "KZT" } or { "type": "range", "brackets": [...] }
  config_version VARCHAR(50) NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_to DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Configuration Versions (Snapshots)
CREATE TABLE IF NOT EXISTS calc_config_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  snapshot_checksum VARCHAR(64), -- SHA256 of the active config state
  tables_snapshot JSONB, -- list of table IDs included in this version
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Basic RLS (following product structure: only via functions or admin)
ALTER TABLE calc_exchange_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE calc_country_tax_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE calc_customs_fees_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE calc_config_versions ENABLE ROW LEVEL SECURITY;

-- Note: Policies will be added in a separate migration or manually via dashboard
-- as per the project's standard practice if needed. For now, we just enable RLS.
