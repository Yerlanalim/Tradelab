# План обновления логики калькулятора доставки

## Цель
Перевести калькулятор доставки на data-driven архитектуру ("Component Engine"), устранив хардкод логики и добавив прозрачность через `calculation_trace`. Внедрить версионирование правил, "tri-state" логику включения (yes/no/unknown) и строгую типизацию компонентов.

## Требуется ревизия пользователя
> [!IMPORTANT]
> **Контракт API (Breaking Change)**:
> - Удаляется `invoice_includes_freight` (boolean).
> - Добавляются tri-state поля: `invoice_includes_border_freight`, `invoice_includes_last_mile`, `invoice_includes_insurance` ('yes'|'no'|'unknown').
> - Backend трактует `undefined` **только** как `'unknown'`.

## 1. Определение компонентов (Component Definitions)

Чёткий список компонентов стоимости.
**Важно**: Invoice является неявной базой (Implicit Base) и **не хранится** в списках компонентов в БД (во избежание двойного учета).

| Component Code | Описание | Customs Base? | Landed Total? | Источник оценки |
| :--- | :--- | :--- | :--- | :--- |
| `invoice` | Стоимость товара | **Implicit Base** | **Implicit Base** | User Input |
| `border_freight` | Доставка до границы | Configurable | Configurable | Logistics Calc |
| `last_mile` | Доставка до двери | Configurable | Configurable | Logistics Calc |
| `insurance` | Страховка груза | Configurable | Configurable | Rules / User Input |
| `duty` | Таможенная пошлина | N/A | **Всегда** | TNVED / Rules |
| `vat` | НДС при импорте | N/A | **Всегда** | Tax Rules |
| `fees` | Таможенные сборы | N/A | **Всегда** | Taxes/Flat Fee |

## 2. Модели данных (Supabase)

### Таблицы правил (Rules Engine)

#### `calc_incoterms_rules`
Определяет формулы для каждого Incoterms.
*   `incoterms`: 'CIF', 'FOB', 'DAP', ...
*   `customs_components_in_base`: `jsonb string[]` (список *добавляемых* компонентов, напр. `['border_freight', 'insurance']`).
*   `landed_components_in_total`: `jsonb string[]` (список *добавляемых* компонентов, напр. `['border_freight', 'last_mile', 'duty', 'vat', 'fees']`).
*   `critical_components`: `jsonb string[]` (компоненты, отсутствие которых блокирует "ok" статус, напр. `['border_freight']` для EXW).
*   `unknown_policy`: Enum политика для неопределённостей.

#### `calc_component_inclusion_rules`
Дефолтные значения включения в инвойс (v1).
*   `incoterms`: 'CIF'
*   `component`: 'border_freight'
*   `default_included`: 'yes'
*   `can_override_by_user`: boolean (если false, то user input игнорируется).

#### `calc_rule_versions`
*   `version`: semantic versioning (v1.0.0)
*   `active_from`, `active_to`
*   **Scope**: Global (active by date). В MVP нет деления на страны.

### Политики Unknown (UNKNOWN_POLICY)
1.  **INCOMPLETE_ONLY**: Не строим диапазон, сразу ставим `status=incomplete`.
2.  **SCENARIO_RANGE**: Строим min/max (included/not included), но статус всё равно `incomplete`.
3.  **ESCALATE**: Если компонент критичен, ставим `status=escalation_required`.

## 3. Backend: Архитектура (The Component Engine)

### 3.1 RuleRepository (Caching Strategy)
Интерфейс с обязательным **request-scope кэшированием** (не дёргать БД 20 раз за запрос).
Методы:
*   `getActiveRuleVersion(date)` (Global Scope).
*   `getIncotermsRule(version, incoterms)`
*   `getInclusionDefaults(version, incoterms, component)`
*   `getInsuranceRule(...)`

**Правило**: Никакой логики с fallback на жестко закодированный JSON. Если в таблицах нет данных — возвращаем ошибку/reason code `MISSING_RULE`.

### 3.2 Pipeline калькуляции (Single Pass)
1.  **Estimation Phase**: Сбор `ComponentEstimate[]` (реальные суммы в USD из логистики/тарифов).
2.  **Decision Phase** (Logic: Inclusion Resolution):
    *   Приоритет 1: **User Input** (если `can_override_by_user=true` и значение валидное).
    *   Приоритет 2: **Default Rule** (из `calc_component_inclusion_rules`).
    *   Fallback: **'unknown'**.
    *   *Result*: `ComponentDecision[]` (in_invoice: yes/no/unknown).
3.  **Assembly Phase**:
    *   `CustomsValue` = `Invoice` + Sum(decisions where code in `customs_components_in_base` AND **in_invoice = 'no'**).
    *   `LandedCost` = `Invoice` + Sum(decisions where code in `landed_components_in_total` AND **in_invoice = 'no'**).
    *   **Unknown handling**: Если `in_invoice = 'unknown'`, компонент обрабатывается отдельно согласно `unknown_policy` (range generation).
4.  **Trace Generation**: Собираем полный трейс.

### 3.3 Статус-машина (Strict Status Logic)
*   **ok**: Возвращается **только** если выполнены все условия:
    *   Нет Reason Codes категории `ESCALATION`.
    *   Нет Reason Codes категории `INCOMPLETE`.
    *   Нет `unknown` (**effective, после применения политики**) по `critical_components`.
    *   Нет `missing estimates` по `critical_components`.
*   **incomplete**: Есть коды категории `INCOMPLETE` или сработала политика `SCENARIO_RANGE` (range подразумевает incomplete).
*   **escalation_required**: Есть коды категории `ESCALATION`.

### 3.4 Catalog of Reason Codes (Tiered)
**Stability Contract**: Reason codes являются публичным контрактом. Удаление или переименование запрещено без version bump.

| Category | Codes |
| :--- | :--- |
| **ESCALATION** | `INCOTERMS_POLICY_ESCALATION` (DDP), `UNSUPPORTED_TARIFF_TYPE` |
| **INCOMPLETE** | `UNKNOWN_INVOICE_INCLUSION_*`, `MISSING_*_RATE`, `HS_LOOKUP_LOW_CONFIDENCE` |
| **INFO** | `FEES_NOT_SUPPORTED` (если config позволяет 0) |

## 4. Calculation Trace & Logging

### API Response (`calculation_trace`)
*   `rule_version`: v1.0
*   `inputs_used`: hash/normalized inputs
*   `components`: Detailed array (estimate, decision, to_add, assumptions).
*   `selected_records`: `[{ table, id, source_quality, applied_filters }]` (для отладки выбора тарифов).
*   `assumptions`: `[{ code, message, severity }]` (читаемый список допущений).

### Parallel Run Logging (Shadow Mode)
В логах при включенном флаге `CALC_RULE_ENGINE_V2`:
*   `legacy_total` (USD)
*   `v2_total` (USD)
*   `delta_abs` (USD)
*   `delta_pct` (%)
*   `rule_version`

## 5. План Верификации (Golden Tests)
*   **CIF**: `border_freight` in invoice = yes. Проверка: Landed Cost не увеличивается на сумму фрахта.
*   **DAP**: `border_freight` included = yes. Проверка: Landed Cost не увеличивается на сумму фрахта (**Fix Double Counting**).
*   **DAP**: `inclusion = unknown`. Проверка: Status `incomplete` + Range (если политика SCENARIO_RANGE).
*   **EXW**: Freight missing. Проверка: Status `escalation` / code `MISSING_BORDER_FREIGHT_RATE`.

## 6. Стратегия миграций (Supabase Migrations)

**Обязательный процесс**:
1.  Агент создает SQL-файлы в `supabase/migrations/`.
2.  Агент **останавливается** и просит пользователя применить миграции.
3.  Агент продолжает работу только после подтверждения.

**Список файлов**:
1.  `*_001_rule_versions.sql`
2.  `*_002_incoterms_rules.sql`
3.  `*_003_component_inclusion_rules.sql`
4.  `*_004_insurance_rules.sql`
5.  `*_005_city_aliases.sql`
6.  `*_006_seed_v1_rules.sql`