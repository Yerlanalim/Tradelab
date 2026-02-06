# Логика калькулятора доставки и landed cost

Документ описывает текущую реализацию расчёта в `backend/src/calc/*`: какие данные берутся из Supabase, какие вводит пользователь, и как формируются итоговые суммы для каждого типа Incoterms.

## 1) Поток расчёта (end-to-end)

1. UI собирает `DealPassport` и отправляет `POST /api/calc/quote`.
2. Бэкенд валидирует минимальные обязательные поля: `dest_country`, `incoterms`, `goods_value`, `currency`.
3. Оркестратор загружает:
   - курсы валют из Supabase (`calc_exchange_rates`),
   - кэш логистических и налоговых таблиц из Supabase.
4. Выполняются по шагам:
   - логистика (`LogisticsCalculator`),
   - таможенная стоимость (`CustomsValueCalculator`),
   - пошлина/НДС (`DutyVatCalculator`, включая HS lookup через TNVED).
5. Оркестратор собирает `totals` (landed cost), статус (`ok`/`incomplete`/`escalation_required`) и confidence.

## 2) Какие входные данные участвуют в расчёте

### 2.1 Поля, вводимые пользователем

Ключевые поля `DealPassport`, реально используемые в формулах:

- `dest_country` — выбор ставок НДС, last-mile и направлений логистики.
- `incoterms` — переключает формулу таможенной стоимости и включение доставки в landed cost.
- `goods_value` + `currency` — база инвойса (конвертируется в USD).
- `weight_gross_kg` — расчёт логистики по `per_kg` и специфических пошлин (за кг).
- `hs_code` — источник тарифа пошлины и VAT exemption через TNVED/HS client.
- `country_of_origin` (в UI сейчас отправляется как `origin_country`) — фильтрация логистических направлений; если не задано, подставляется `CN`.
- `origin_city` / `dest_city` — уточнение маршрута (точный lane match).
- `mode_preference` — ограничивает выбор rate cards по виду транспорта.
- `invoice_includes_freight` — критично для DAP (включать ли freight в customs value).
- `invoice_includes_insurance` — учитывать ли отдельную страховку в customs value.

### 2.2 Данные из Supabase

Используются в runtime через `DataCacheManager` и `CurrencyProvider`:

- `calc_exchange_rates` — курсы валют для перевода в USD.
- `calc_shipping_lanes` — доступные логистические направления.
- `calc_shipping_rate_cards` — базовые ставки фрахта (по mode, basis, currency).
- `calc_shipping_surcharges` — надбавки (фикс/процент).
- `calc_shipping_last_mile` — доставка «последней мили» в стране назначения.
- `calc_country_tax_config` — ставка импортного НДС по стране.
- `calc_customs_fees_config` — загружается в кэш, но в MVP фактически не участвует в итоговой формуле (fees отмечены как not included).

### 2.3 Локальные конфиги (не Supabase)

- `backend/data/calculator/customs_value_rules.json`:
  - `insurance_rate` (базовый % страховки),
  - `country_overrides` (например, для KZ страховой % отличается).
- `backend/data/calculator/cities_aliases.json`:
  - нормализация названий городов перед поиском маршрутов.

## 3) Логика по каждому виду расчёта (Incoterms)

Ниже `Invoice = goods_value в USD`, `FreightBorder = freight_to_border_usd`, `LastMile = last_mile_usd`.

### 3.1 CIF

**Таможенная стоимость**

- Формула: `CustomsValue = Invoice`.
- Обоснование: в коде CIF трактуется как «инвойс уже включает freight+insurance».

**Landed cost**

- Для CIF в итоговую сумму **не добавляется** `FreightBorder` (считается уже внутри invoice).
- Добавляется только `LastMile` (если найдена).
- Итого: `Landed = Invoice + LastMile + Duty + VAT + Fees`.

**Что нужно от пользователя**

- Минимум: `dest_country`, `incoterms`, `goods_value`, `currency`.
- `weight_gross_kg` может понадобиться для specific duty (если тариф специфический), хотя для самой CIF-логики customs value не обязателен.

**Что берётся из Supabase**

- Логистика (lanes/rate_cards/surcharges/last_mile) — для LastMile и сценариев.
- VAT rate из `calc_country_tax_config`.
- Курсы из `calc_exchange_rates`.

### 3.2 FOB

**Таможенная стоимость**

- Формула: `CustomsValue = Invoice + FreightBorder + Insurance`.
- Если `FreightBorder` не найден — в `missing_inputs` добавляется `freight_to_border for FOB`.
- `Insurance`:
  - если `invoice_includes_insurance=true`, не добавляется отдельно;
  - иначе добавляется как `Invoice * insurance_rate` (из локального rules, с country override).

**Landed cost**

- Для FOB в landed cost добавляются и border freight, и last mile:
- `Landed = Invoice + FreightBorder + LastMile + Duty + VAT + Fees`.

**Что нужно от пользователя**

- Обязательно практически: `weight_gross_kg` (для логистики per_kg и specific duty),
- желательно: `country_of_origin`/`origin_country`, `origin_city`, `mode_preference`.

**Что берётся из Supabase**

- Все логистические таблицы (для `FreightBorder` и `LastMile`).
- НДС-ставка и курсы валют.

### 3.3 EXW

Логика идентична FOB в текущей реализации.

**Таможенная стоимость**

- `CustomsValue = Invoice + FreightBorder + Insurance`.

**Landed cost**

- `Landed = Invoice + FreightBorder + LastMile + Duty + VAT + Fees`.

**Особенности**

- При отсутствии валидного freight для EXW система поднимает escalation reason, т.к. freight критичен для расчёта.

### 3.4 DAP

**Таможенная стоимость** зависит от `invoice_includes_freight`:

1. `invoice_includes_freight = true`
   - `CustomsValue = Invoice (+ Insurance, если не включена)`.
2. `invoice_includes_freight = false`
   - `CustomsValue = Invoice + FreightBorder (+ Insurance, если не включена)`.
   - если freight не найден: `missing_inputs += freight_to_border for DAP`.
3. `invoice_includes_freight = undefined`
   - расчёт помечается как неполный (`missing_inputs += invoice_includes_freight`),
   - формула неопределённая: «Invoice value (DAP freight inclusion unknown)».

**Landed cost**

- В оркестраторе DAP попадает в ветку «freight не включен в invoice», поэтому в landed cost добавляются и `FreightBorder`, и `LastMile`.
- Итого: `Landed = Invoice + FreightBorder + LastMile + Duty + VAT + Fees`.

> Важно: это может приводить к потенциальному double-counting, если по факту в DAP freight уже в invoice и пользователь поставил `invoice_includes_freight=true` (customs value это учитывает, а assembly landed cost — нет отдельной развилки для DAP=true).

### 3.5 DDP

**Текущая реализация**

- В `CustomsValueCalculator` DDP сразу кидает `EscalationRequiredError`:
  - причина: «duty paid breaks transparent base calculation».
- Оркестратор возвращает `status=escalation_required` и не строит полноценный landed cost.

## 4) Расчёт пошлины и НДС (общий для Incoterms)

### 4.1 Пошлина

1. Для каждого кандидата HS берётся тариф через `HSClient` (lookup в TNVED сервис).
2. Парсится AST тарифа:
   - ad valorem (% от таможенной стоимости),
   - specific (фикс за единицу; MVP поддерживает только `kg`),
   - sum (адвалорная + специфическая),
   - max (максимум из вариантов).
3. Формируется диапазон `duty.range_usd`.

### 4.2 НДС

- Если `vat_exempt=true` по HS — НДС = 0.
- Иначе берётся `import_vat_default_rate` из `calc_country_tax_config`.
- Формула: `VAT = (CustomsValue + Duty) * vat_rate`.

### 4.3 Сборы

- В MVP выставлен ассампшн `Customs fees not included in MVP calculation`.
- Таблица `calc_customs_fees_config` подгружается, но в текущем `DutyVatCalculator` итоговые fees по ней не начисляются.

## 5) Как формируется статус расчёта

- `ok` — есть все ключевые данные, нет escalation, есть валидный landed range.
- `incomplete` — есть пропуски (`all_missing_inputs`) или не удалось получить валидный shipping route/rates.
- `escalation_required` — DDP, низкая HS уверенность/unsupported tariff/критические проблемы логистики и т.п.

## 6) Ключевые ограничения реализации

- Для specific duty поддерживается только unit `kg`.
- Для DDP нет прозрачного автоматического расчёта.
- Для DAP есть риск расхождения между веткой customs value и сборкой landed cost при `invoice_includes_freight=true`.
- Если origin не задан — подставляется `CN`, что влияет на route matching и confidence.



## 7) Что доработать для правдоподобной работы калькулятора (по каждому Incoterms)

Ниже зафиксированы: (а) текущие допущения, (б) что именно нужно доработать, (в) целевая недвусмысленная логика после доработки.

### 7.1 CIF — допущения и доработка

**Текущие допущения**

- Предполагается, что invoice всегда уже включает freight до границы и insurance.
- В landed cost повторно не добавляется `FreightBorder`, но добавляется `LastMile`.

**Что доработать**

1. Добавить явный флаг `invoice_includes_border_freight` для всех Incoterms (не только DAP), чтобы исключить implicit-логику по списку `['CIF','CIP']`.
2. Разделить в UI/модели 2 компонента доставки:
   - `freight_to_border_included_in_invoice`;
   - `last_mile_included_in_invoice`.
3. Добавить проверку на двойной учёт: если freight включён в invoice, но одновременно есть внешний freight из rate card — этот freight должен идти только в аналитический breakdown, но не в сумму landed.

**Целевая недвусмысленная логика**

- `CustomsValue = Invoice + BorderFreightToAdd + InsuranceToAdd`, где `BorderFreightToAdd = 0`, если freight включён в invoice.
- `Landed = Invoice + ShippingToAdd + Duty + VAT + Fees`, где `ShippingToAdd = (BorderFreightToAdd + LastMileToAdd)` и каждый компонент добавляется только если он не включён в invoice.

### 7.2 FOB — допущения и доработка

**Текущие допущения**

- Freight до границы должен прийти из логистики, иначе расчёт неполный/эскалация.
- Insurance начисляется от `Invoice` по fixed-ставке из конфига.

**Что доработать**

1. Ввести источник insurance по приоритету:
   - фактическая страховка из invoice (если введена пользователем),
   - ставка из market/contract table (Supabase),
   - fallback из локального конфига.
2. Явно фиксировать базу для страховки (Invoice vs Invoice+Freight) по стране/режиму в таблице правил.
3. Добавить quality-метку логистического тарифа (`market`, `contract`, `fallback`) и повышать/понижать confidence в зависимости от источника.

**Целевая недвусмысленная логика**

- Для FOB правило должно быть параметризуемым: 
  - `InsuranceBase` и `InsuranceRate` задаются в конфиге версии правил;
  - формула и источники всегда возвращаются в ответе (`formula_used`, `sources`) в машиночитаемом виде.

### 7.3 EXW — допущения и доработка

**Текущие допущения**

- EXW сейчас считается так же, как FOB, что упрощает реальную структуру затрат.

**Что доработать**

1. Добавить pre-carriage (доставка от склада продавца до порта/терминала отправления) отдельным компонентом:
   - `origin_pickup_usd` / `export_terminal_usd`.
2. Разделить freight до границы на подэтапы:
   - `origin_pickup + main_leg + export_handling`.
3. Ввести fallback-правило, если нет точного origin_city: использовать региональные коэффициенты, но явно маркировать это как допущение.

**Целевая недвусмысленная логика**

- Для EXW: `BorderFreight = OriginPickup + ExportHandling + MainLeg`.
- Эти части должны отображаться отдельно и участвовать в customs/landed по прозрачным правилам включения.

### 7.4 DAP — допущения и доработка

**Текущие допущения**

- В customs value есть развилка по `invoice_includes_freight`, но в landed assembly отдельной развилки для DAP сейчас нет.

**Что доработать (критично)**

1. Исправить сборку landed cost:
   - если `invoice_includes_freight=true`, не добавлять `FreightBorder` повторно;
   - если также `invoice_includes_last_mile=true`, не добавлять и `LastMile`.
2. Добавить обязательный tri-state для DAP:
   - `yes`, `no`, `unknown` (а не только boolean/undefined),
   чтобы «unknown» явно переводил расчёт в incomplete с понятным reason-code.
3. Разделить в форме вопрос «включена ли доставка» на 2 вопроса:
   - до границы/терминала;
   - до двери (last mile).

**Целевая недвусмысленная логика**

- DAP должен рассчитываться тем же унифицированным движком включения компонентов, что и остальные Incoterms:
  - каждый компонент доставки имеет флаг inclusion в invoice;
  - в итоговую сумму добавляется только невключённая часть.

### 7.5 DDP — допущения и доработка

**Текущие допущения**

- DDP полностью уходит в escalation, т.к. в цене уже могут быть зашиты пошлина/НДС/сервисы брокера.

**Что доработать**

1. Добавить режим обратной декомпозиции DDP price:
   - вход: `invoice_ddp_total`, страна, HS, вес, маршрут;
   - выход: оценка диапазона `net_goods`, `embedded_duty`, `embedded_vat`, `embedded_logistics`.
2. Добавить сценарный расчёт (best/base/worst) с параметрами маржи поставщика и транспортного буфера.
3. Вводить DDP не как «невозможно посчитать», а как «аналитическая декомпозиция с низкой уверенностью».

**Целевая недвусмысленная логика**

- Для DDP API возвращает не только escalation, но и структурированный decomposition-result с флагом низкой уверенности и причинами.

## 8) Сквозные доработки модели данных и API для чёткой логики

### 8.1 Нормализация полей включённости в invoice

Рекомендуемые поля (единообразно для всех Incoterms):

- `invoice_includes_border_freight: 'yes' | 'no' | 'unknown'`
- `invoice_includes_last_mile: 'yes' | 'no' | 'unknown'`
- `invoice_includes_insurance: 'yes' | 'no' | 'unknown'`
- `invoice_includes_customs_duty: 'yes' | 'no' | 'unknown'`
- `invoice_includes_vat: 'yes' | 'no' | 'unknown'`

Это устраняет двусмысленность boolean+undefined и делает поведение формально определённым.

### 8.2 Единый алгоритм включения компонентов в customs и landed

Для каждого компонента `X` (`border_freight`, `last_mile`, `insurance`, `duty`, `vat`, `fees`) применять правило:

1. Определить `X_in_invoice`.
2. Если `X_in_invoice='yes'` → `X_to_add = 0`.
3. Если `X_in_invoice='no'` → `X_to_add = X_estimated`.
4. Если `X_in_invoice='unknown'` →
   - расчёт остаётся возможным как диапазон/сценарий,
   - но статус не выше `incomplete`, reason-code обязателен.

### 8.3 Версионирование правил расчёта

Нужно вынести правила Incoterms в отдельную версионируемую конфигурацию (Supabase table `calc_incoterms_rules`):

- формулы customs base;
- какие компоненты обязательны для полноты;
- как считается insurance base/rate;
- как обрабатывается `unknown` по inclusion.

Это позволит менять логику без хардкода в `switch/case`.

### 8.4 Прозрачность для пользователя и аудита

В ответ API добавить блок `calculation_trace`:

- список шагов и формул;
- какие входы взяты у пользователя, какие из Supabase;
- какие fallback/assumptions применены;
- какие компоненты были исключены из суммы как already included.

## 9) Принятые допущения для целевой версии (до появления фактических данных)

Пока нет полноценной коммерческой матрицы ставок и контрактных тарифов, зафиксировать временные правила:

1. Все денежные расчёты вести в USD внутри ядра.
2. Если нет точного city-level маршрута, использовать country-level lane с понижением confidence.
3. Если insurance неизвестна, брать rule-based ставку по стране с пометкой assumption.
4. Если inclusion-поля `unknown`, считать 2 сценария (included / not included) и возвращать диапазон + incomplete.
5. Для DDP в MVP-2 возвращать decomposition-сценарии вместо «пустой эскалации».

## 10) План внедрения (чтобы перейти к недвусмысленной логике)

1. **Модель данных и контракт API**
   - добавить tri-state inclusion поля;
   - добавить `calc_incoterms_rules`.
2. **Оркестратор/сборка totals**
   - заменить жёсткую проверку `['CIF','CIP']` на data-driven inclusion logic.
3. **Логистика EXW/FOB**
   - декомпозировать freight на этапы;
   - добавить quality source и fallback коэффициенты.
4. **DDP decomposition**
   - внедрить обратный расчёт в отдельный модуль.
5. **Наблюдаемость**
   - добавить `calculation_trace`, reason-codes и автоматические проверки на double-counting.

Ожидаемый результат: калькулятор даёт правдоподобный диапазон с прозрачным происхождением каждой цифры, без скрытых допущений и с однозначным поведением для любого набора входных данных.

## 11) Полный список требуемых ставок и контрактных тарифов, которые нужно собрать

Ниже — полный операционный чеклист данных, без которых расчёт не будет правдоподобным в production.

### 11.1 Валюты и курсы

1. **Официальные/учётные курсы валют к внутренней базовой валюте** (сейчас ядро считает в USD, но источник может быть KZT/EUR/USD-пивот).
   - Периодичность: минимум daily snapshot.
   - Валюты: USD, EUR, CNY, RUB, KZT, BYN, AMD, KGS, UZS, TJS, AZN, GEL.
2. **Курс для таможенных целей** (если регуляторно отличается от market FX).
   - Нужен отдельный source/type курса и дата действия.

### 11.2 Налоги, пошлины, таможенные платежи

3. **Ставки импортного НДС по стране назначения**:
   - standard rate,
   - reduced rates (если применимы),
   - правила VAT-exempt и исключения.
4. **Формулы базы НДС по стране**:
   - какие компоненты входят в базу: `customs_value`, `duty`, `fees`, прочие налоги.
5. **Ставки/правила таможенных сборов**:
   - фиксированные сборы,
   - диапазонные/ступенчатые,
   - сборы за оформление/реестр/процедуры.
6. **HS-специфичные ставки пошлины и условия**:
   - ad valorem,
   - specific (с единицами измерения),
   - комбинации (`sum`, `max`),
   - временные льготы/преференции.

### 11.3 Страхование

7. **Контрактные ставки insurance** по направлениям/грузам/Incoterms.
8. **Рыночные ставки insurance** (fallback), если контрактных нет.
9. **Правило базы для insurance**:
   - от `Invoice`,
   - от `Invoice + Freight`,
   - или фикс/минимальная премия.

### 11.4 Логистика: маршрутная матрица и основные тарифы

10. **Маршрутная матрица (lanes)**:
    - origin_country/origin_city,
    - dest_country/dest_city,
    - допустимые mode.
11. **Контрактные line-haul тарифы (main leg)** по каждому mode:
    - air,
    - road,
    - rail,
    - sea.
12. **Price basis для каждого тарифа**:
    - per_kg,
    - per_cbm,
    - per_container (20/40),
    - flat per shipment.
13. **Минимальные чарджи** (min charge) и условия применения.
14. **Сроки транзита** (min/max days) и SLA-окна.

### 11.5 Логистика: надбавки и локальные плечи

15. **Топливные надбавки** (percent/fixed) по mode и периоду.
16. **Терминальные сборы** (origin/destination terminal handling).
17. **Security/war/seasonal surcharges** (периодические надбавки).
18. **Портовые/жд/авиа доплаты** (документы, slot, congestion и т.д.).
19. **Last-mile тарифы** по стране/городу и типу доставки.
20. **Pre-carriage для EXW/FOB**:
    - pick-up от склада,
    - экспортная обработка,
    - довоз до порта/терминала.

### 11.6 Коэффициенты и конверсия единиц

21. **Объёмный вес/chargeable weight rules** по mode (air volumetric factor и т.д.).
22. **Плотностные/упаковочные коэффициенты** (если нет точных габаритов).
23. **Единицы измерения для specific duty** и официальные коэффициенты конвертации.

### 11.7 Правила применимости и fallback

24. **Приоритет источников тарифа**:
    - contract > market > fallback.
25. **Периоды действия (valid_from/valid_to)** для всех ставок.
26. **Географические алиасы и нормализация городов/регионов**.
27. **Fallback-коэффициенты при отсутствии city-level тарифа**.

### 11.8 Коммерческие параметры (для DDP decomposition)

28. **Диапазон маржи поставщика** (по категории товара/каналу).
29. **Буфер на логистическую волатильность** (best/base/worst).
30. **Вероятностные сценарии включённости компонентов в invoice** (если unknown).

---

### Минимально необходимый набор «чтобы стартовать правдоподобно»

Если собирать поэтапно, обязательный MVP+ набор:

- Курсы валют (daily),
- VAT + формула базы VAT,
- HS duty + parsed representation,
- Lanes + rate cards + surcharges + last mile,
- Insurance rules (rate + base),
- Customs fees,
- Validity windows + source priority.

## 12) Вынос в Supabase всех данных, не вводимых пользователем (без хардкода в коде)

Цель: в коде остаётся только алгоритм расчёта и orchestration; все константы, ставки, правила и fallback-политики берутся из БД.

### 12.1 Что обязательно убрать из хардкода

1. Локальный `customs_value_rules.json` (insurance_rate, overrides) → в таблицу правил.
2. Локальный `cities_aliases.json` → в справочник алиасов в Supabase.
3. Все списки «особых Incoterms» в коде (`['CIF','CIP']` и подобные) → в таблицу правил включённости компонентов.
4. Любые default/fallback коэффициенты (включая доли border freight и т.п.) → в БД с версией и периодом действия.

### 12.2 Предлагаемая целевая схема Supabase

#### Справочники и версии

- `calc_rule_versions`
  - `version`, `status`, `valid_from`, `valid_to`, `description`, `created_at`.

- `calc_city_aliases`
  - `alias`, `canonical_city`, `country_code`, `active`, `version`.

#### Incoterms-правила

- `calc_incoterms_rules`
  - `incoterms`,
  - `customs_formula_code`,
  - `landed_formula_code`,
  - `requires_border_freight`,
  - `requires_last_mile`,
  - `requires_insurance`,
  - `unknown_inclusion_policy` (`incomplete` / `scenario_range` / `escalate`),
  - `version`, `active`, `valid_from`, `valid_to`.

- `calc_component_inclusion_rules`
  - `incoterms`, `component` (`border_freight`, `last_mile`, `insurance`, `duty`, `vat`, `fees`),
  - `default_included_in_invoice` (`yes`/`no`/`unknown`),
  - `can_override_by_user` (bool),
  - `version`.

#### Налоги, пошлины, сборы

- `calc_country_tax_config` (расширить):
  - хранить base formula параметризовано и машиночитаемо.

- `calc_customs_fees_config` (расширить):
  - `calculation_rule` + приоритет + applicability filters.

- `calc_hs_tariff_cache` (опционально к TNVED):
  - хранить нормализованный parsed AST и effective period,
  - чтобы расчёт не зависел от «живого» внешнего сервиса в runtime.

#### Страхование

- `calc_insurance_rules`
  - `country_code`, `incoterms`, `cargo_type`,
  - `rate_type` (`percent`/`fixed`), `rate_value`,
  - `base_type` (`invoice`/`invoice_plus_freight`/`fixed`),
  - `min_premium`,
  - `source_quality` (`contract`/`market`/`fallback`),
  - `version`, `valid_from`, `valid_to`, `active`.

#### Логистика

- Использовать текущие таблицы `calc_shipping_lanes`, `calc_shipping_rate_cards`, `calc_shipping_surcharges`, `calc_shipping_last_mile`,
  но расширить:
  - `source_quality`,
  - `provider_id`,
  - `service_level`,
  - `price_basis_params` (для контейнеров/объёмного веса),
  - `priority`.

#### Fallback и сценарии

- `calc_fallback_policies`
  - тип нехватки данных (`missing_city_rate`, `missing_insurance`, `unknown_inclusion`),
  - стратегия (`use_country_level`, `use_market_avg`, `scenario_split`, `escalate`),
  - параметры стратегии,
  - влияние на confidence.

### 12.3 Изменения в API-контракте (чтобы логика была недвусмысленной)

1. Поля включённости в invoice сделать tri-state:
   - `yes | no | unknown`.
2. Добавить `calculation_trace`:
   - используемая версия правил,
   - выбранные записи тарифов/ставок (id + source_quality),
   - формулы и подстановки,
   - применённые fallback-политики.
3. Добавить reason-codes стандартизованно:
   - `MISSING_BORDER_FREIGHT_RATE`,
   - `UNKNOWN_INVOICE_INCLUSION`,
   - `NO_ACTIVE_VAT_RULE`, и т.д.

### 12.4 План миграции без остановки текущего расчёта

1. Создать новые таблицы Supabase и наполнить baseline-данными.
2. Добавить слой `RuleRepository` в backend:
   - сначала read-through (БД → fallback в старый JSON),
   - затем отключить fallback и удалить JSON.
3. Перевести `CustomsValueCalculator` и `CalculationOrchestrator` на data-driven правила из БД.
4. Перевести `LogisticsCalculator` на city aliases/fallback policies из БД.
5. Включить контроль качества данных:
   - проверки полноты обязательных ставок,
   - проверки пересечения периодов действия,
   - проверки конфликтов приоритетов.
6. После стабилизации удалить из репозитория все расчётные константы и json-правила, кроме тестовых фикстур.

### 12.5 Definition of Done для «логика без хардкода»

Готово, когда:

- любой коэффициент/ставка/правило можно изменить в Supabase без деплоя кода;
- в backend нет incoterms-списков и фиксированных ставок в business-логике;
- каждое число в ответе калькулятора имеет ссылку на запись БД или user input в `calculation_trace`;
- regression-тесты проходят на нескольких версиях правил (versioned configs).
