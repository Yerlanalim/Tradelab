-- 20260204_calc_logistics_tables.sql
-- Logistics tables for the Calculation Layer

-- 1. Shipping Lanes
CREATE TABLE IF NOT EXISTS calc_shipping_lanes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lane_id VARCHAR(50) UNIQUE NOT NULL,
  origin_country VARCHAR(2) NOT NULL,
  origin_city VARCHAR(100), -- NULL means any city in country
  dest_country VARCHAR(2) NOT NULL,
  dest_city VARCHAR(100),
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calc_lanes_lookup ON calc_shipping_lanes(origin_country, dest_country, origin_city, dest_city);

-- 2. Shipping Rate Cards
CREATE TABLE IF NOT EXISTS calc_shipping_rate_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lane_id VARCHAR(50) REFERENCES calc_shipping_lanes(lane_id),
  rate_id VARCHAR(50) UNIQUE NOT NULL,
  mode VARCHAR(20) NOT NULL, -- air, rail, road, sea
  price_basis VARCHAR(20) NOT NULL DEFAULT 'kg', -- currently only 'kg' supported in MVP
  rate_per_unit NUMERIC(10,2) NOT NULL,
  min_charge NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  transit_days_min INTEGER NOT NULL,
  transit_days_max INTEGER NOT NULL,
  risks TEXT[],
  active BOOLEAN DEFAULT TRUE,
  valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_to DATE,
  config_version VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Shipping Surcharges (Fixed & Percent)
CREATE TABLE IF NOT EXISTS calc_shipping_surcharges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  surcharge_id VARCHAR(50) UNIQUE NOT NULL,
  rate_id VARCHAR(50) REFERENCES calc_shipping_rate_cards(rate_id),
  type VARCHAR(50) NOT NULL, -- fuel_percent, terminal_fixed, etc.
  amount NUMERIC(10,4) NOT NULL, -- 0.12 for 12% or absolute value
  currency VARCHAR(3), -- NULL for percent-based surcharges
  applies_to VARCHAR(20) NOT NULL DEFAULT 'base_cost',
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Last Mile Delivery Config
CREATE TABLE IF NOT EXISTS calc_shipping_last_mile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code VARCHAR(2) NOT NULL,
  city VARCHAR(100),
  service_provider VARCHAR(100),
  base_rate NUMERIC(10,2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'KZT',
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE calc_shipping_lanes ENABLE ROW LEVEL SECURITY;
ALTER TABLE calc_shipping_rate_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE calc_shipping_surcharges ENABLE ROW LEVEL SECURITY;
ALTER TABLE calc_shipping_last_mile ENABLE ROW LEVEL SECURITY;
