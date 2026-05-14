-- 20260514_seed_calc_data_v2.sql
-- Полный seed данных для calc-движка (snapshot 2026-05-14)
-- Заменяет seed_calc_data.sql (тот не применялся)

-- ──────────────────────────────────────────────
-- 1. Курсы валют (база: KZT, источник: НБРК + рыночные медианы)
-- ──────────────────────────────────────────────
INSERT INTO calc_exchange_rates (date, base_currency, rates, source)
VALUES (
  '2026-05-14',
  'KZT',
  '{
    "USD": 493.50,
    "EUR": 535.20,
    "CNY": 67.80,
    "RUB": 5.28,
    "BYN": 152.00,
    "AMD": 1.27,
    "KGS": 5.72,
    "KZT": 1.00
  }',
  'NBRK'
) ON CONFLICT ON CONSTRAINT calc_exchange_rates_date_base_currency_source_key DO UPDATE
  SET rates = EXCLUDED.rates;

-- ──────────────────────────────────────────────
-- 2. НДС по странам ЕАЭС
-- ──────────────────────────────────────────────
INSERT INTO calc_country_tax_config
  (country_code, currency, import_vat_default_rate, vat_base_formula, config_version, active, valid_from)
VALUES
  ('KZ', 'KZT', 0.1200, 'customs_value + duty + fees', '1.0', true, '2026-01-01'),
  ('RU', 'RUB', 0.2000, 'customs_value + duty + fees', '1.0', true, '2026-01-01'),
  ('BY', 'BYN', 0.2000, 'customs_value + duty + fees', '1.0', true, '2026-01-01'),
  ('AM', 'AMD', 0.2000, 'customs_value + duty + fees', '1.0', true, '2026-01-01'),
  ('KG', 'KGS', 0.1200, 'customs_value + duty + fees', '1.0', true, '2026-01-01')
ON CONFLICT DO NOTHING;

-- ──────────────────────────────────────────────
-- 3. Таможенные сборы KZ (ст. 539 ТК ЕАЭС, ставки RK)
-- Фиксированный сбор за таможенное оформление + регистрационный сбор
-- ──────────────────────────────────────────────
INSERT INTO calc_customs_fees_config
  (country_code, fee_type, calculation_rule, config_version, active, valid_from)
VALUES
  (
    'KZ',
    'Таможенный сбор за таможенное оформление',
    '{
      "type": "tiered",
      "currency": "KZT",
      "brackets": [
        {"max_customs_value_kzt": 200000,  "fee_kzt": 4200},
        {"max_customs_value_kzt": 500000,  "fee_kzt": 8000},
        {"max_customs_value_kzt": 1000000, "fee_kzt": 11000},
        {"max_customs_value_kzt": 2000000, "fee_kzt": 15000},
        {"max_customs_value_kzt": 5000000, "fee_kzt": 20000},
        {"max_customs_value_kzt": null,    "fee_kzt": 30000}
      ]
    }',
    '1.0',
    true,
    '2026-01-01'
  )
ON CONFLICT DO NOTHING;

-- ──────────────────────────────────────────────
-- 4. Маршруты (lanes) CN → KZ
-- rate_id указывает default rate card для Strategy B
-- ──────────────────────────────────────────────
INSERT INTO calc_shipping_lanes
  (lane_id, origin_country, origin_city, dest_country, dest_city, enabled, rate_id)
VALUES
  ('CN-KZ-DEFAULT', 'CN', NULL, 'KZ', NULL, true, 'RAIL-CN-KZ-STD')
ON CONFLICT (lane_id) DO UPDATE
  SET rate_id = EXCLUDED.rate_id,
      enabled = EXCLUDED.enabled;

-- ──────────────────────────────────────────────
-- 5. Rate Cards (рыночные медианы CN→KZ, 2026-05)
-- ──────────────────────────────────────────────
INSERT INTO calc_shipping_rate_cards
  (lane_id, rate_id, mode, price_basis, rate_per_unit, min_charge, currency,
   transit_days_min, transit_days_max, risks, active, config_version, valid_from)
VALUES
  -- Железная дорога (Хоргос/Достык): основной режим для ЕАЭС
  (
    'CN-KZ-DEFAULT', 'RAIL-CN-KZ-STD', 'rail', 'kg',
    0.90, 200.00, 'USD',
    15, 22,
    ARRAY['border_delays', 'schedule_changes'],
    true, '1.0', '2026-01-01'
  ),
  -- Авиа (HKG/PVG → ALA): срочные грузы
  (
    'CN-KZ-DEFAULT', 'AIR-CN-KZ-STD', 'air', 'kg',
    5.00, 100.00, 'USD',
    5, 8,
    ARRAY['weight_restrictions', 'dangerous_goods_restricted'],
    true, '1.0', '2026-01-01'
  ),
  -- Автодорога (через Хоргос): средний сегмент
  (
    'CN-KZ-DEFAULT', 'ROAD-CN-KZ-STD', 'road', 'kg',
    1.50, 150.00, 'USD',
    10, 16,
    ARRAY['seasonal_road_conditions', 'border_delays'],
    true, '1.0', '2026-01-01'
  )
ON CONFLICT (rate_id) DO UPDATE
  SET rate_per_unit = EXCLUDED.rate_per_unit,
      min_charge    = EXCLUDED.min_charge,
      active        = EXCLUDED.active;

-- ──────────────────────────────────────────────
-- 6. Надбавки (surcharges) к каждому тарифу
-- ──────────────────────────────────────────────
INSERT INTO calc_shipping_surcharges
  (surcharge_id, rate_id, type, amount, currency, applies_to, active)
VALUES
  -- Rail
  ('FUEL-RAIL-CN-KZ', 'RAIL-CN-KZ-STD', 'fuel_percent',     0.05, NULL,  'base_cost', true),
  ('TERM-RAIL-CN-KZ', 'RAIL-CN-KZ-STD', 'terminal_fixed',   120.00,'USD', 'base_cost', true),
  -- Air
  ('FUEL-AIR-CN-KZ',  'AIR-CN-KZ-STD',  'fuel_percent',     0.15, NULL,  'base_cost', true),
  ('TERM-AIR-CN-KZ',  'AIR-CN-KZ-STD',  'terminal_fixed',   80.00, 'USD', 'base_cost', true),
  -- Road
  ('FUEL-ROAD-CN-KZ', 'ROAD-CN-KZ-STD', 'fuel_percent',     0.08, NULL,  'base_cost', true)
ON CONFLICT (surcharge_id) DO UPDATE
  SET amount = EXCLUDED.amount,
      active = EXCLUDED.active;

-- ──────────────────────────────────────────────
-- 7. Last Mile KZ (до двери получателя)
-- ──────────────────────────────────────────────
INSERT INTO calc_shipping_last_mile
  (country_code, city, service_provider, base_rate, currency, active)
VALUES
  ('KZ', 'Almaty', 'DHL Kazakhstan', 59000.00, 'KZT', true),
  ('KZ', 'Astana', 'DHL Kazakhstan', 88500.00, 'KZT', true),
  ('KZ', NULL,     'Generic KZ',     69000.00, 'KZT', true)
ON CONFLICT DO NOTHING;
