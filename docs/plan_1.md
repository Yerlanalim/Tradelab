# План работ: TradeLab (каркас веб‑приложения)

Цель: быстро создать стабильный каркас (UI + структура + страницы),
без интеграции доменов и внешних API.

## Этап 1. Каркас проекта (MVP skeleton)
Статус: done

- [x] Инициализация Next.js (App Router, TypeScript, Tailwind)
- [x] Базовая структура каталогов (`app`, `components`, `lib`, `supabase`)
- [x] Layout (Sidebar + Main + Chat) + глобальные стили
- [x] Страницы‑заглушки под все разделы
- [x] Базовые UI компоненты (button, card, table)
- [x] Общий набор зависимостей (forms, query, icons)

## Этап 2. UX‑каркас продуктов
Статус: done

- [x] Conversational form (UI‑шаблон, без логики)
- [x] Страницы продуктов P1–P4
- [x] Страницы Reports (list + detail)
- [x] Заглушка AI‑чата (UI)

## Этап 3. Auth scaffold и state
Статус: done

- [x] Страницы auth (login/register/reset)
- [x] Мок‑состояние пользователя
- [x] Блокировка приватных страниц (UI)

## Этап 4. Подготовка к Supabase
Статус: done

- [x] Типы данных (Order, Report, Supplier)
- [x] Мок‑API в `lib/api`
- [x] Провайдеры (QueryClient)

## Этап 5. Полировка и готовность к интеграции
Статус: done

- [x] Контентные разделы (map/library/zones/exhibitions)
- [x] Единые элементы навигации
- [x] Документация `docs/setup.md`

## Этап 6. Supabase integration scaffold
Статус: done

- [x] Установить `@supabase/supabase-js`
- [x] Добавить `supabaseClient` (browser/server)
- [x] Подготовить auth service wrapper (без реальной логики)
- [x] Обновить `docs/setup.md` с env переменными Supabase

## Этап 7. Supabase Auth integration (базовый)
Статус: done

- [x] Auth provider с Supabase session
- [x] Реальный AuthGate вместо mock
- [x] Login/Register/Reset формы с Supabase
- [x] Обновить `.env` под публичные ключи

## Этап 8. База данных и RLS (Supabase)
Статус: done

- [x] Создать базовые таблицы (orders, reports, profiles, content и т.д.)
- [x] Включить RLS и политики для user-таблиц

## Этап 9. Контент из Supabase
Статус: done

- [x] Засеять `content_items`
- [x] Подключить контентные страницы к Supabase

## Этап 10. Заказы и отчёты из Supabase
Статус: done

- [x] Перевести reports/orders на реальные таблицы
- [x] Подключить RLS‑чтение по user_id
- [x] Базовый seed/demo для отчетов

## Этап 11. Edge Functions (P1–P4)
Статус: done

- [x] `qcc_proxy` (P1)
- [x] `tendata_proxy` (P2, P4)
- [x] `apify_proxy` (P3)
- [x] `report_generator`

## Этап 12. Генерация PDF и Storage
Статус: done

- [x] Storage buckets: reports/exports/assets
- [x] Генерация PDF (React‑PDF или server) — placeholder
- [x] Ссылки на PDF в reports — placeholder

## Этап 13. AI orchestration
Статус: done

- [x] `ai_orchestrator` (prompts per section)
- [x] HS‑match, релевантность, интерпретация — placeholder
- [x] Логи/лимиты через `api_usage` — placeholder

## Этап 14. Payments
Статус: pending

- [ ] Stripe интеграция
- [ ] Halyk ePay / Kaspi Pay
- [ ] `payment_webhook` и статус заказов

## Этап 15. Наблюдаемость и качество
Статус: done

- [x] Sentry + базовые алерты
- [x] Минимальные e2e checks — checklist
- [x] Проверка RLS и security review — checklist

## Этап 16. Deploy
Статус: done

- [x] Vercel production + preview — doc
- [x] Проверка env vars — doc
- [x] Smoke‑тесты на prod — checklist