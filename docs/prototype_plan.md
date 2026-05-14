# План доведения до устойчивого прототипа
**Дата:** 2026-05-14  
**Статус:** В работе

---

## Критерий готовности прототипа

Пользователь вводит товар (HS-код, вес, стоимость, страну, Incoterms) → получает числовой диапазон landed cost с источниками и допущениями. Все компоненты (логистика, пошлина, НДС) рассчитаны на реальных данных, а не заглушках.

---

## Этап 1 — Чистка: тесты и логи
**Приоритет:** Критично. Два упавших теста и console.log в production-коде.

### 1.1 Починить упавший тест: `tariffParser.golden.test.ts`
- **Проблема:** `"1 EUR за 1000 шт"` не парсится — лексер не матчит паттерн `1000pcs` с пробелом `"1 000 шт"`.
- **Файлы:** `backend/src/calc/duty/TariffLexer.ts`, `backend/data/customs/tariff_parser_rules.json`
- **Действие:** Отладить регулярку `1\s*000\s*шт` в лексере, добавить тест-кейс.
- [ ] Тест проходит

### 1.2 Починить упавший тест: `golden.test.ts` — DDP escalation
- **Проблема:** Golden-тест `"Golden: DDP requires escalation"` падает.
- **Файл:** `backend/tests/golden.test.ts`, `backend/src/calc/orchestrator/CalculationOrchestrator.ts`
- **Действие:** Разобраться почему оркестратор не возвращает `status=escalation_required` для DDP.
- [ ] Тест проходит

### 1.3 Заменить console.log/warn на структурированное логирование
- **Файлы:**
  - `backend/src/calc/duty/DutyVatCalculator.ts:144` — `console.log`
  - `backend/src/calc/hs/HSClient.ts` — несколько `console.warn`
- **Действие:** Заменить на вызовы через `logger` (тот же, что используется в `calc-routes.ts`).
- [ ] Нет console.* в calc-слое

### 1.4 Разобраться с `CustomsValueCalculatorV2_Real.ts`
- **Проблема:** `Cannot find module '../../../lib/api/calc'` — сломанный импорт. V2 пайплайн с `V2_CUSTOMS_VALUE_IMPL=v2` недоступен.
- **Действие:** Либо починить импорт и реализовать, либо удалить файл-заглушку и убрать ссылки на него.
- [ ] TypeScript typecheck проходит без ошибок

**Готовность Этапа 1:** `npm test` — 0 failures, `npm run typecheck` — 0 errors.

---

## Этап 2 — Данные: seed реальных ставок в Supabase
**Приоритет:** Блокер для любого ручного тестирования. Без данных — `status=incomplete` на каждый запрос.

### 2.1 Курсы валют
- Таблица: `calc_exchange_rates`
- **Нужно:** USD, EUR, CNY, RUB, KZT, BYN — актуальные курсы (хотя бы снапшот на дату).
- [x] Курсы заведены (snapshot 2026-05-14, 8 валют ЕАЭС+CNY)

### 2.2 VAT-конфиг по странам
- Таблица: `calc_country_tax_config`
- **Нужно:** KZ (12%), RU (20%), BY (20%), AM (20%), KG (12%).
- [x] VAT-конфиг для 5 стран ЕАЭС заведён

### 2.3 Логистические маршруты CN→KZ (минимальный набор)
- Таблицы: `calc_shipping_lanes`, `calc_shipping_rate_cards`, `calc_shipping_surcharges`, `calc_shipping_last_mile`
- **Нужно:** 3 маршрута (air, rail, road) CN→KZ с реальными ставками и transit days.
- [x] 4 режима (air/rail/road/sea) CN→KZ заведены, last_mile KZ = $40 USD
- [x] Сопутствующий фикс: V2 rule-таблицы добавлены в `DataCacheManager`

### 2.4 Таможенные сборы KZ
- Таблица: `calc_customs_fees_config`
- **Нужно:** Сбор за таможенное оформление KZ (ступенчатая шкала от таможенной стоимости).
- [x] Сборы KZ заведены (tiered brackets, ст.539 ТК ЕАЭС)

### 2.5 Проверка что DataCacheManager подхватывает данные
- Запустить `POST /api/calc/quote` с тестовым паспортом CIF CN→KZ — убедиться что `status=ok`, а не `incomplete`.
- [x] End-to-end запрос возвращает `status=ok`, `totals.landed_cost_range_usd=[5640,5640]`

**Готовность Этапа 2:** Ручной curl-тест с CIF CN→KZ отдаёт `status=ok` с `total_landed_cost_usd_range`.

---

## Этап 3 — Логика: исправление расчётных дыр
**Приоритет:** Без этого результат может быть неверным (double-counting, неподдерживаемые тарифы).

### 3.1 Исправить DAP double-counting
- **Файл:** `backend/src/calc/orchestrator/CalculationOrchestrator.ts`
- **Проблема:** При `invoice_includes_freight=true` в DAP freight добавляется в landed cost повторно.
- **Документ:** `docs/delivery_calc_logic.md:141`
- **Действие:** В assembly-фазе оркестратора добавить проверку по `incoterms=DAP` + `invoice_includes_freight`.
- [x] `isFreightIncludedInInvoice` учитывает `invoice_includes_freight=true`

### 3.2 Расширить поддержку specific-единиц в DutyVatCalculator
- **Файл:** `backend/src/calc/duty/DutyVatCalculator.ts`
- **Текущее:** только `kg`. Бросает `UnsupportedTariffError` для `pcs`, `l`, `m2`, `cm3`, `ton`, `pair`.
- **Действие:** Реализовать расчёт для `pcs` (quantity), `l` (volume_l), `m2` (area_m2). Остальные — escalation с понятным reason-code, не crash.
- [x] `pcs`, `l`, `m2` поддержаны
- [x] Остальные единицы → `UNSUPPORTED_UNIT:...` escalation

### 3.3 Подключить customs fees в расчёт
- **Файл:** `backend/src/calc/duty/DutyVatCalculator.ts`
- **Проблема:** `calc_customs_fees_config` подгружается, но `fees_usd` всегда пустой.
- **Действие:** Реализовать начисление сборов по записям из конфига (flat fee + percent от таможенной стоимости).
- [x] `fees_usd` заполняется реальными данными из Supabase (tiered KZT brackets)
- [x] Assumption `"Customs fees not included"` удалён при наличии данных

**Готовность Этапа 3:** `npm test` — 0 failures (80/80), typecheck clean.

---

## Этап 4 — UI: подключение фронта к calc-движку
**Приоритет:** Без этого прототип нельзя показать.

### 4.1 Страница калькулятора `/library/logistics-calculator`
- **Текущее состояние:** Заглушка-страница, не вызывает `/api/calc/quote`.
- **Действие:**
  - Форма с полями `DealPassport` (dest_country, incoterms, goods_value, currency, weight_gross_kg, hs_code).
  - `POST` на `http://localhost:3001/api/calc/quote`.
  - Отображение результата: landed cost range, breakdown по компонентам, assumptions, escalation-причины.
- [x] Форма отправляет запрос
- [x] Результат отображается: суммы + breakdown
- [x] Состояния incomplete/escalation отображаются понятно пользователю
- [x] Читает `hs_code` из URL params (`useSearchParams`)

### 4.2 HS-поиск `/library/hs-search`
- **Текущее состояние:** Заглушка-страница, TNVED сервис (порт 3002) реализован но не подключён к UI.
- **Действие:** Подключить поле поиска к `GET http://localhost:3002/hs/search?q=...` и `/hs/code/:code`.
- [x] Поиск по тексту работает
- [x] Поиск по коду работает (числовой запрос → `/hs/code/:code` + нормализация ответа)
- [x] Результат (код + название + тариф) отображается

### 4.3 Связать HS-поиск с калькулятором
- **Действие:** Кнопка "Рассчитать landed cost" из карточки HS-кода → передаёт `hs_code` в форму калькулятора.
- [x] Переход из HS-поиска в калькулятор с заполненным hs_code работает

**Готовность Этапа 4:** Сквозной флоу в браузере: поиск товара → выбор HS-кода → расчёт landed cost.

---

## Этап 5 — Наблюдаемость и качество данных
**Приоритет:** Без этого нельзя доверять результатам и отлаживать.

### 5.1 `calculation_trace` в ответе API
- **Файл:** `backend/src/calc/orchestrator/CalculationOrchestrator.ts`
- **Действие:** Добавить в ответ блок `calculation_trace`:
  - используемая версия правил,
  - какие записи Supabase были применены (id + таблица),
  - формулы и подстановки,
  - применённые fallback.
- [ ] `calculation_trace` присутствует в ответе `/api/calc/quote`

### 5.2 Отображение trace в UI (debug-панель)
- **Действие:** Сворачиваемый блок "Детали расчёта" под результатом.
- [ ] Trace доступен в UI (за аккордеоном)

### 5.3 Стандартизировать reason-codes
- **Документ:** `docs/refactoriing_plan_calc.md:3.4`
- **Действие:** Проверить что все reason-codes из каталога реально возвращаются (не свободный текст), добавить missing.
- [ ] Reason-codes — machine-readable строки, не свободный текст

---

## Этап 6 — V2 пайплайн (data-driven правила)
**Приоритет:** Целевая архитектура. Нужен для масштабирования на новые страны без деплоя кода.

### 6.1 Создать и засеять таблицы правил в Supabase
- `calc_rule_versions`, `calc_incoterms_rules`, `calc_component_inclusion_rules`, `calc_insurance_rules`
- **Документ:** `docs/refactoriing_plan_calc.md:2`
- [ ] Миграции созданы и применены
- [ ] Данные для v1.0 правил засеяны (CIF/FOB/EXW/DAP)

### 6.2 Починить `CustomsValueCalculatorV2_Real.ts`
- Реализовать полноценный data-driven CustomsValue на основе `calc_incoterms_rules`.
- [ ] `V2_CUSTOMS_VALUE_IMPL=v2` работает без ошибок

### 6.3 Перевести tri-state поля в API-контракт
- **Документ:** `docs/refactoriing_plan_calc.md:2` — breaking change
- Заменить `invoice_includes_freight?: boolean` на tri-state `'yes' | 'no' | 'unknown'`.
- [ ] Контракт `DealPassport` обновлён
- [ ] Все тесты обновлены и проходят

### 6.4 Убрать hardcode из CustomsValueCalculator
- Удалить `customs_value_rules.json` и `cities_aliases.json`, перевести на чтение из Supabase через `RuleRepository`.
- [ ] Нет расчётных констант в JSON-файлах
- [ ] `RuleRepository` использует только Supabase

**Готовность Этапа 6:** `CALC_ENGINE=v2` работает, все golden-тесты проходят, diff с legacy < $0.01.

---

## Бэклог (после прототипа)

- DDP decomposition mode (обратный расчёт из DDP-цены)
- Поддержка маршрутов CN→RU, CN→BY
- Fuzzy search + лемматизация в TNVED сервисе
- AI-fallback для HS классификации (порог < 3 результатов)
- Страница отчёта по расчёту (PDF export)
- Rate limiting на `/api/calc/quote`
- Мониторинг расходов API через `api_usage`

---

## Текущий прогресс

| Этап | Статус |
|------|--------|
| 1 — Чистка | ✅ Завершён (80/80 тестов, typecheck OK) |
| 2 — Данные Supabase | ✅ Завершён (status=ok, landed_cost=[5640,5640]) |
| 3 — Логические дыры | ✅ Завершён (80/80 тестов, typecheck OK) |
| 4 — UI | ✅ Завершён (калькулятор + HS-поиск + связка через URL params) |
| 5 — Наблюдаемость | 🔴 Не начат |
| 6 — V2 пайплайн | 🔴 Не начат |
