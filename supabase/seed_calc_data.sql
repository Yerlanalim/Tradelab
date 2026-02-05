-- seed_calc_data.sql
-- Initial seed data for testing the Calculation Layer

-- 1. Exchange Rates (2026-02-04)
INSERT INTO calc_exchange_rates (date, rates) VALUES (
  '2026-02-04',
  '{
    "USD": 450.00,
    "EUR": 490.00,
    "CNY": 65.00,
    "RUB": 4.95,
    "BYN": 140.00,
    "AMD": 1.15,
    "KGS": 5.05,
    "KZT": 1.00
  }'
) ON CONFLICT ON CONSTRAINT calc_exchange_rates_date_base_currency_source_key DO NOTHING;

-- 2. Country Tax Config
INSERT INTO calc_country_tax_config (country_code, currency, import_vat_default_rate, config_version)
VALUES 
  ('KZ', 'KZT', 0.12, '1.0'),
  ('RU', 'RUB', 0.20, '1.0'),
  ('BY', 'BYN', 0.20, '1.0'),
  ('AM', 'AMD', 0.20, '1.0'),
  ('KG', 'KGS', 0.12, '1.0')
ON CONFLICT DO NOTHING;

-- 3. Customs Fees (Simple fixed example for KZ)
INSERT INTO calc_customs_fees_config (country_code, fee_type, calculation_rule, config_version)
VALUES (
  'KZ', 
  'Customs Clearance Fee', 
  '{"type": "fixed", "amount": 20000, "currency": "KZT"}', 
  '1.0'
) ON CONFLICT DO NOTHING;

-- 4. Shipping Lanes (CN -> KZ)
INSERT INTO calc_shipping_lanes (lane_id, origin_country, origin_city, dest_country, dest_city)
VALUES 
  ('CN-GZ-KZ-ALA', 'CN', 'Guangzhou', 'KZ', 'Almaty'),
  ('CN-SH-KZ-ALA', 'CN', 'Shanghai', 'KZ', 'Almaty'),
  ('CN-KZ-DEFAULT', 'CN', NULL, 'KZ', NULL)
ON CONFLICT DO NOTHING;

-- 5. Rate Cards (Air)
INSERT INTO calc_shipping_rate_cards (lane_id, rate_id, mode, rate_per_unit, min_charge, currency, transit_days_min, transit_days_max, config_version)
VALUES (
  'CN-GZ-KZ-ALA',
  'AIR-STANDARD-ALA',
  'air',
  5.50,
  100.00,
  'USD',
  5,
  10,
  '1.0'
) ON CONFLICT DO NOTHING;

-- 6. Surcharges (Fuel 12%)
INSERT INTO calc_shipping_surcharges (surcharge_id, rate_id, type, amount, currency)
VALUES (
  'FUEL-AIR-ALA',
  'AIR-STANDARD-ALA',
  'fuel_percent',
  0.12,
  NULL
) ON CONFLICT DO NOTHING;

-- 7. Surcharges (Terminal Fixed)
INSERT INTO calc_shipping_surcharges (surcharge_id, rate_id, type, amount, currency)
VALUES (
  'TERMINAL-FIXED-ALA',
  'AIR-STANDARD-ALA',
  'terminal_fixed',
  50.00,
  'USD'
) ON CONFLICT DO NOTHING;
