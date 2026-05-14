-- 6.4: Seed calc_city_aliases (aliases stored in lowercase for case-insensitive lookup)
INSERT INTO public.calc_city_aliases (rule_version, country_code, alias, canonical_city)
VALUES
    ('v1.0.0', 'KZ', 'алматы',           'Almaty'),
    ('v1.0.0', 'KZ', 'alma-ata',          'Almaty'),
    ('v1.0.0', 'RU', 'москва',            'Moscow'),
    ('v1.0.0', 'RU', 'moskva',            'Moscow'),
    ('v1.0.0', 'RU', 'санкт-петербург',   'Saint Petersburg'),
    ('v1.0.0', 'RU', 'sankt-peterburg',   'Saint Petersburg'),
    ('v1.0.0', 'BY', 'минск',             'Minsk'),
    ('v1.0.0', 'AM', 'ереван',            'Yerevan'),
    ('v1.0.0', 'KG', 'бишкек',           'Bishkek')
ON CONFLICT (rule_version, country_code, alias) DO NOTHING;
