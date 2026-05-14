-- 6.4: Add border_freight_fraction to calc_insurance_rules
ALTER TABLE public.calc_insurance_rules
    ADD COLUMN IF NOT EXISTS border_freight_fraction numeric NOT NULL DEFAULT 0.7;

-- Update global fallback row
UPDATE public.calc_insurance_rules
    SET border_freight_fraction = 0.7
    WHERE rule_version = 'v1.0.0' AND country_code IS NULL;

-- KZ: insurance_rate override = 0.6%
INSERT INTO public.calc_insurance_rules
    (rule_version, country_code, rate_type, rate_value, base_type, min_premium_usd, source_quality, border_freight_fraction)
VALUES
    ('v1.0.0', 'KZ', 'percent', 0.006, 'invoice', 0, 'market', 0.7)
ON CONFLICT DO NOTHING;

-- RU: border_freight_fraction override = 0.65
INSERT INTO public.calc_insurance_rules
    (rule_version, country_code, rate_type, rate_value, base_type, min_premium_usd, source_quality, border_freight_fraction)
VALUES
    ('v1.0.0', 'RU', 'percent', 0.005, 'invoice', 0, 'market', 0.65)
ON CONFLICT DO NOTHING;
