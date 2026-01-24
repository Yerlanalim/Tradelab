# Plan 1 — Milestone 0: Unified Bot фундамент
Дата: 23.01.2026

## Этап 0 — Подготовка и правила
- [ ] Утвердить режимы бота: Assistant / Supplier Search / Report
- [ ] Утвердить матрицу страниц → режим
- [ ] Зафиксировать минимальный UI-контракт ответа (`response`, `suggested_chips`, `ui_hints`, `tool_calls`)
- [ ] Определить политику хранения `session_id` (cookie / localStorage / DB)

## Этап 1 — Legacy cleanup (обязательно)
- [x] Удалить Supabase Edge Function `apify_proxy`
- [x] Удалить `APIFY_TOKEN` и связанные env переменные
- [x] Удалить `src/lib/api/apify.ts`
- [x] Удалить/заменить `src/components/products/Product3Search.tsx`
- [x] Убрать все упоминания legacy scrapers из UI/доков
- [x] Зафиксировать политику по `supplier_*` (feature store остаётся, источник legacy запрещён)

## Этап 2 — Единая Edge Function `chat_handler`
- [x] Создать функцию `chat_handler` как единую точку входа
- [x] Принимать `messages`, `page_context`, `session_id` (+ user token)
- [x] Определять `mode` серверно по `page_context`
- [x] Возвращать `response`, `suggested_chips`, `ui_hints`, `tool_calls`
- [x] Запретить "опасные" tool calls вне нужного режима (anti-bypass)
- [x] Логировать запросы/ответы в `api_usage` (provider = openai)

## Этап 3 — Хранилище чата и flow_state
- [x] Добавить в `chat_history` поля `mode` и `flow_state` (jsonb)
- [x] Миграция legacy записей: `section → mode`
- [x] Определить схему `flow_state` для Supplier Search (step/status/preview/confirmed)
- [x] Ввести TTL/cleanup для устаревших flow_state (если нужно)

## Этап 4 — UI: единый чат и режимы
- [x] Перевести `ChatPanel` на новый endpoint `chat_handler`
- [x] Передавать `page_context` и `session_id`
- [x] Реализовать обработку `suggested_chips`
- [x] Реализовать `ui_hints` (redirect_to / show_paywall / progress_state)
- [x] Assistant mode: при запросе поиска показывать чип → `/products/supplier-search`
- [x] Supplier Search mode: special UI (preview/paywall/progress/result)
- [x] Report mode: интерпретация отчёта + апсейл

## Этап 5 — Тесты и приемка
- [x] Smoke тесты для трёх режимов (Assistant/Supplier Search/Report)
- [x] Проверка, что поиск поставщиков не запускается вне `/products/supplier-search`
- [x] Проверка сохранения истории чата и восстановления flow_state
- [x] Проверка запрета tool calls вне режима
- [x] Зафиксировать чек-лист DoD для Milestone 0

## DoD — Milestone 0
- [x] Один чат на всех страницах, режим определяется серверно
- [x] `chat_handler` отвечает `response` + `suggested_chips` + `ui_hints`
- [x] История чатов хранится по `mode`, flow_state сохраняется
- [x] Assistant не запускает поиск, а направляет в `/products/supplier-search`
- [x] Legacy scrapers полностью отключены в коде и UI
