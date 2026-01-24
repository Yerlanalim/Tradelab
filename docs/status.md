# Status Log

## 2026-01-15
- Добавлен подробный документ архитектуры, стека и структуры проекта.
- Описаны модули, таблицы Supabase, ключевые Edge Functions и основные потоки.
- Зафиксированы требования к деплою на Vercel и нефункциональные требования.
- Уточнены бесплатные инструменты, контентные разделы, таблицы и функции.
- Добавлены политики RLS, storage buckets и оптимизации по API лимитам.
- Создан каркас Next.js (App Router) и базовые зависимости.
- Сформирован layout с сайдбаром и чат‑панелью.
- Добавлены страницы‑заглушки и базовые UI‑компоненты.
- Добавлены каталоги `supabase/functions`, `supabase/migrations`, `supabase/types`.
- Добавлен UI‑шаблон conversational form для продуктов.
- Обновлены страницы продуктов P1–P4 под новую форму.
- Сделаны страницы отчетов (список + детали) и улучшен UI‑чат.
- Добавлены страницы auth (login/register/reset).
- Реализовано mock‑состояние пользователя и UI‑переключатель.
- Добавлен AuthGate для приватных разделов.
- Добавлены базовые типы (Order/Report/Supplier).
- Создан mock API для отчетов и заказов.
- Подключен QueryClientProvider в layout.
- Дополнены контентные разделы (map/library/zones/exhibitions).
- Добавлен документ `docs/setup.md`.
- Установлен `@supabase/supabase-js` и добавлены supabase client (browser/server).
- Добавлен auth service wrapper для дальнейшей интеграции.
- Обновлены переменные окружения в `docs/setup.md`.
- Подключен Supabase Auth provider и реальный AuthGate.
- Формы login/register/reset переведены на Supabase.
- Добавлены публичные Supabase переменные в `.env`.
- Созданы таблицы ядра в Supabase и включены RLS политики.
- Засеян контент `content_items` и подключены контентные страницы к Supabase.
- Reports/Orders переведены на реальные таблицы Supabase и добавлен demo seed.
- Добавлены stubs Edge Functions для P1–P4 и генерации отчетов.
- Созданы buckets Storage и добавлены placeholder функции для PDF.
- Добавлены prompts и ai_orchestrator stub для AI‑слоя.
- Добавлен Sentry SDK и чек‑лист качества.
- Добавлены инструкции деплоя в `docs/deploy.md`.
- Подключён рабочий AI‑чат через OpenAI и Edge Function.
- Продукт 3 был настроен на legacy поиск поставщиков (временно).

## 2026-01-18
### добавление pdf генерации и страницы отчетов и наладка Product 3 (legacy)
#### сделано:
- Собраны данные Supabase/legacy поиска через MCP, зафиксированы таблицы и Edge Functions.
- Обновлен `docs/plan_3.md` с деплоями и новыми этапами (7–11).
- Синхронизированы prompts и логирование usage для `ai_orchestrator`; задеплоен.
- В legacy поиске добавлены лимиты dev (20/20), бенчмарки, дедупликация; задеплоен.
- Добавлен сбор `api_usage` для OpenAI.
- Реализован PDF через React‑PDF + загрузка в Storage.
- Добавлен API `/api/reports/generate` с проверкой JWT и связкой с `report_jobs`.
- Вынесен общий поток генерации отчетов в `runReportFlow`.
- Подключены P1/P2/P4 к генерации отчетов и PDF.
- Улучшен UI отчетов (индикатор PDF, таблица).
- Добавлены поля и валидации в Conversational Form.
- Включен CORS для Edge Functions и деплой всех функций.
- Исправлена связка формы и поиска в продукте 3.
- Заблокирован чат для неавторизованных пользователей.
#### доделать:
- кнопки запуска продукта 3 пока не работают, надо исправить
- чатбот пока не работает, надо исправить

### улучшение AI-чата (MVP)
#### сделано:
- Обновлен UI чата: архив диалогов, новый диалог, чипы подсказок, дисклеймер, обработка ошибок.
- Добавлены секции для чат‑контекста: zones/exhibitions/reports/settings/dashboard.
- История чатов привязана к разделам и подтягивается из Supabase.
- В `ai_orchestrator` добавлен контекст из `content_items`, расширены промпты и обработка ошибок OpenAI.
- Миграция `chat_history`: добавлены `title`, `summary`, `last_message_at`, индекс по `(user_id, section, last_message_at)`, триггер `updated_at`.
- Вызов `ai_orchestrator` переведен на явную передачу access token.
- `ai_orchestrator` задеплоен (v9) с ручной проверкой токена и `verify_jwt=false` для обхода 401 на gateway.

### деплой на Vercel и исправления сборки
#### сделано:
- Задеплоен проект на Vercel (production alias `https://tradelab-nine.vercel.app`).
- Исправлена сборка PDF: файл переименован в `reportPdf.tsx` для корректного JSX парсинга.
- Обработаны статусы отчетов `failed` и `draft` в UI.
- Добавлена декларация типов для `@svg-maps/china`.
- Исключены `supabase/functions` из проверки TypeScript в `tsconfig.json`.

### добавление карты Китая и выставок
#### сделано:
- Добавлены данные карты Китая в `src/data/chinaMapData.ts`.
- Перенесен компонент карты в `src/components/map/ChinaManufacturingMap.tsx`.
- Встроена карта в `/map`, заданы безопасные высоты контейнера.
- Добавлены заглушки фильтров для `/exhibitions` по `city/province`.
- Подключена зависимость `@svg-maps/china` и обновлен `package.json`.
- Исправлено позиционирование маркеров (bbox карты), добавлено масштабирование.
- Убран горизонтальный скролл, фильтры переведены на перенос строк.
- Приведены стили карты к общему дизайну (темные панели, glass, типографика).

#### доделать:
- города съезжают чуть вправо, надо исправить
- надписи городов слишком мелкие
- надо добавить выставки в раздел Выствки и связать со ссылками на карте

## 2026-01-18
### доработка Product 3 (legacy поиск) + отчёты и экспорт
#### сделано:
- Исправлен поток P3: новый `order`/`report` на каждый запуск, статусы `processing → ready/done`.
- Серверная обработка legacy поиска: fallback на частичный успех, дедуп, нормализация, bench.
- Запись `supplier_entities`, `supplier_matches`, `supplier_features` в legacy контуре.
- Добавлен web‑отчёт P3 на странице `/reports/[id]` с bench и списком поставщиков.
- Добавлен экспорт CSV через `/api/reports/export`, создан bucket `exports` и RLS‑политики.
- UI P3: RFQ‑кнопка, риск‑индикаторы, бейджи/метрики, апсейл на P1/P2.
- Усилена проверка сессии и ретрай в legacy контуре (refresh и auto‑signout при invalid JWT).
#### проблема:
- Legacy контур поиска отвечает 401 `invalid JWT` даже после логина; вероятно, сломанная/устаревшая сессия в клиенте. Требуется дополнительная диагностика auth‑потока.

## 2026-01-20
### исправление P3 / legacy поиск (ошибка 500 + "returned no data")
#### сделано:
- В legacy контуре отключен gateway‑JWT (`verify_jwt=false`) и оставлена серверная валидация токена.
- Найдена причина 404 в legacy контуре: неверный формат actor id (`username/actor` вместо `username~actor`).
- Исправлен `runActor`: actor id нормализуется и кодируется перед вызовом API.
- Расширена нормализация полей результатов (url, price, moq, min/max price, currency, countryCode).
- Добавлен fallback‑поиск и диагностическое логирование `actor_summary` для отладки.
- Задеплоены новые версии legacy контура, подтверждена рабочая выдача P3.

## 2026-01-23
### Milestone 0 — Unified Bot фундамент (deploy + миграции)
#### сделано:
- Добавлен `chat_handler` (единая Edge Function с режимами Assistant / Supplier Search / Report).
- Миграция `chat_history`: добавлены `mode` и `flow_state`, выполнен маппинг `section → mode`.
- Чат переведен на новый endpoint с `page_context` и `session_id`, добавлены `suggested_chips` и `ui_hints`.
- Обновлен UI Supplier Search (preview/paywall/progress) и редирект из Assistant.
- Legacy scrapers отключены в коде и UI; `apify_proxy` удален вручную в Supabase.
- Прогнан lint: ошибок нет.

## 2026-01-23
### Milestone 1 — Supplier Search (preview/full flow)
#### сделано:
- Добавлен preview и полный анализ в `chat_handler` с web search.
- Полный результат P3 сохраняется в `reports.result_summary` в формате, совместимом с UI.
- Обновлены ограничения Supabase: `apify` → `web_search` в `supplier_matches` и `api_usage`.
- `chat_handler` задеплоен (v5); `npm run lint` проходит без ошибок.

## 2026-01-23
### Milestone 2 — Trade Credits Core (MVP)
#### сделано:
- Добавлены таблицы `tc_ledger` и `tc_packs`, view `tc_balances`, функции `tc_get_balance`, `tc_apply_credit`, `tc_apply_debit` + RLS.
- Добавлена страница `/trade-credits` с балансом и историей операций.
- Баланс TC отображается в TopBar.
- В P3 full‑analysis добавлена проверка баланса и списание 500 TC (server-side).
- `chat_handler` задеплоен (v6); `npm run lint` проходит без ошибок.

## 2026-01-23
### Trade Credits — бонусы и подтверждение списания
#### сделано:
- Edge Function `tc_admin_grant` для ручной выдачи бонусов (admin‑only по `ADMIN_EMAILS`).
- Seed welcome‑bonus: триггер на `auth.users` выдаёт 250 TC (тип welcome, срок 3 месяца).
- Добавлен модал подтверждения списания перед full‑analysis в P3.
- `chat_handler` задеплоен (v7), `npm run lint` без ошибок.

## 2026-01-23
### Milestone 4 — Контентные разделы (тестовый контент)
#### сделано:
- Добавлен тестовый контент в `content_items` для `map`, `exhibition`, `library`.
- В разделах карты/выставок/библиотеки показан контент из Supabase.
- В выставках добавлена фильтрация по `city` и `province` через теги.
- `npm run lint` проходит без ошибок.

## 2026-01-23
### Milestone 4 — Контентные разделы (расширение)
#### сделано:
- Расширен тестовый набор контента до 40–60 карточек.
- Добавлена навигация из карты в фильтр выставок (`/exhibitions?city|province=...`).
- Добавлена панель фильтров в библиотеке по тегам.
- `npm run lint` проходит без ошибок.

## 2026-01-23
### Улучшения стабильности и UX
#### сделано:
- Добавлен auto‑refund при ошибке full‑analysis в P3.
- Добавлены repair/ретраи JSON‑ответов для web_search.
- Скрыта admin‑страница выдачи бонусов для не‑admin (по `NEXT_PUBLIC_ADMIN_EMAILS`).
- Синхронизированы теги выставок с регионами карты.
- `chat_handler` задеплоен (v8), `npm run lint` без ошибок.

## 2026-01-23
### Milestone 5 — Нормализация единого бота
#### сделано:
- В ответах бота теперь гарантированно есть блоки «Источник» и «Ограничение».
- В Assistant‑режиме запросы на поиск поставщиков всегда ведут в `/products/supplier-search` без запуска поиска.
- Для Supplier Search добавлены источники в preview/full.
- Усилено логирование ошибок OpenAI в `api_usage`, добавлено мягкое деградирование.
- `chat_handler` задеплоен (v9), `npm run lint` без ошибок.

## 2026-01-23
### Единый бот — tools и очистка legacy
#### сделано:
- Удалены legacy‑компоненты: `ConversationalForm` и `ai_orchestrator`.
- Добавлены `tool_calls`, `entities`, `summary` в `chat_history` и сохранение в UI.
- В `chat_handler` реализованы базовые tools (HS/Company/Risk/Cost) и ответы с метаданными.
- Миграция `chat_history_tools_entities` применена.
- `chat_handler` задеплоен (v11), `npm run lint` без ошибок.