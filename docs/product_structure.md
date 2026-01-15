# Product Structure: TradeLab (v2.1)

Документ описывает архитектуру, стек, структуру проекта и ключевые функции
платформы TradeLab. Цель: чтобы новый чат/разработчик быстро понял, как все
устроено и что нужно реализовать.

## 1) Технологический стек

### Frontend
- Next.js 14 (App Router)
- React 18 + TypeScript
- Tailwind CSS
- shadcn/ui + Radix UI
- TanStack Query
- React Hook Form + Zod
- Recharts или Tremor (дашборды/аналитика)

### Backend
- Supabase (Postgres, Auth, Storage, Edge Functions)
- Supabase Edge Functions (Deno runtime)
- pg_trgm + full-text search (поиск)
- pg_net/pg_cron (по необходимости для фоновых задач)

### AI/LLM
- OpenAI GPT-4o/mini
- Промпты по разделам (контекстный бот)
- Логика "evidence-first + human-in-the-loop"

### Инфраструктура
- Vercel (хостинг фронта)
- Supabase (все данные, API, фоновые задачи)
- Sentry + Vercel Analytics (наблюдаемость)
- Upstash QStash (очереди/фоновая обработка, если нагрузка растет)

### Платежи
- Stripe (USD)
- Halyk ePay + Kaspi Pay (KZT)

## 2) Архитектурные принципы

1. Все данные в Supabase, минимальная загрузка на фронт.
2. Edge Functions как единственная точка доступа к внешним API
   (Tendata, QCC, Apify, платежи).
3. RLS-first: доступ к данным ограничен политиками в Postgres.
4. Feature store вместо хранения сырых trade-записей.
5. Контекстный AI-бот для каждого раздела.
6. Server-first: максимум логики на сервере, фронт получает только
   готовые агрегаты и short list.

## 3) Основные домены и модули

### 3.1. Пользователи и доступ
- Аутентификация: Supabase Auth (email + OAuth).
- Роли: user, admin, analyst.
- Профиль пользователя: страна, валюта, язык, тариф.

### 3.2. Продукты (P1-P4)
1. P1 — Проверка компании (QCC)
2. P2 — Экспортный профиль (Tendata)
3. P3 — Поиск поставщиков (Apify)
4. P4 — Анализ рынка KZ (Tendata)

Каждый продукт:
- Input через conversational form
- Валидация параметров
- Запуск edge function
- Генерация отчета (PDF + web)
- Сохранение агрегатов в data-layer

### 3.3. Бесплатные инструменты
- Калькулятор landed cost (Xport-бот)
- HS-код определитель
- Бот оценки рисков сделки

### 3.4. AI-чат
- Отдельный бот на каждой странице.
- Таблица chat_history:
  - id, user_id, section, messages, created_at, updated_at
- История доступна пользователю.

### 3.5. Data-layer (Supplier ID)
- USCC = canonical ID.
- Tendata match к USCC.
- Apify match через ссылку и вероятностный матч.
- Храним признаки, а не сырые записи.

### 3.6. Отчеты и PDF
- Веб-отчет: React/Next (SSR + CSR).
- PDF: React-PDF или генерация через edge function.
- PDF хранится в Supabase Storage.

### 3.7. Контентные разделы
- Карта производителей
- Библиотека
- Торговые зоны и хабы
- Выставки

## 4) Предлагаемая структура репозитория

```
/app
  /dashboard
  /products
    /company-check
    /export-profile
    /supplier-search
    /market-analysis
  /reports
  /library
  /map
  /zones
  /exhibitions
  /settings

/components
  /ui (shadcn)
  /charts
  /chat
  /forms

/lib
  /auth
  /db (queries, types)
  /api (external api wrappers)
  /ai (prompts, tools)
  /pdf
  /utils

/supabase
  /functions
  /migrations
  /types
```

## 5) Таблицы Supabase (ядро)

### users
- id (uuid)
- email
- role
- created_at

### user_profiles
- user_id
- country
- currency
- language
- company_name

### orders
- id
- user_id
- product_type (p1|p2|p3|p4|bundle)
- status (pending|processing|done|failed)
- price
- currency
- payment_status
- created_at

### reports
- id
- order_id
- product_type
- params (jsonb)
- result_summary (jsonb)
- pdf_url
- web_report_url
- created_at

### report_jobs
- id
- order_id
- status (queued|running|done|failed)
- attempts
- last_error
- created_at

### supplier_entities
- id (canonical)
- uscc
- name_en
- name_cn
- source_links (jsonb)
- created_at

### supplier_features
- supplier_id
- features (jsonb)
- updated_at

### supplier_matches
- id
- supplier_id
- source (tendata|apify)
- source_ref
- confidence
- created_at

### chat_history
- id
- user_id
- section
- messages (jsonb)
- created_at
- updated_at

### payments
- id
- order_id
- provider (stripe|halyk|kaspi)
- status (pending|paid|failed|refunded)
- amount
- currency
- provider_ref
- created_at

### api_usage
- id
- provider (tendata|qcc|apify|openai)
- user_id
- request_meta (jsonb)
- cost_estimate
- created_at

### content_items
- id
- type (map|library|zone|exhibition)
- title
- body (markdown)
- tags (text[])
- created_at

## 6) Supabase Edge Functions (ключевые)

### 6.1. auth
- validate session
- role enforcement

### 6.2. tendata_proxy
- Получение access token.
- Выполнение trade/company запросов.
- Преобразование в внутренние форматы.
- Ретрай + backoff при 429.

### 6.3. qcc_proxy
- Поиск по USCC.
- Получение регистрационных данных.

### 6.4. apify_proxy
- Запуск scrapers Alibaba/MIC.
- Получение + нормализация результатов.

### 6.5. report_generator
- Компоновка отчета.
- Расчет агрегатов.
- Сохранение PDF в Storage.

### 6.6. ai_orchestrator
- Conversational form.
- Проверка параметров.
- Prompt per section.

### 6.7. payment_webhook
- Прием вебхуков оплаты.
- Подтверждение статуса платежа.
- Перевод заказа в processing.

## 7) Потоки данных (основные сценарии)

### P1: Проверка компании
1. Пользователь вводит USCC.
2. Edge function qcc_proxy получает данные.
3. report_generator формирует отчет.
4. Итог → web + PDF, сохраняется в reports.

### P2: Экспортный профиль
1. Ввод USCC или имени.
2. tendata_proxy → trade данные.
3. Вычисление признаков: HS-match, динамика, география.
4. report_generator сохраняет отчет.

### P3: Поиск поставщиков
1. Пользователь описывает товар + HS.
2. apify_proxy → список поставщиков.
3. Фильтрация + benchmark.
4. Сохранение short list.

### P4: Анализ рынка KZ
1. Ввод HS + период.
2. tendata_proxy → trade data.
3. Аггрегация: объем, экспортёры, сезонность.
4. report_generator сохраняет отчет.

### Free tools
1. HS-бот: AI → предложенные HS-коды → пользователь подтверждает.
2. Risk-бот: опросник → карта рисков + рекомендации.
3. Landed cost: расчет через Xport-логики + дисклеймер.

## 8) UX и правила AI

- Evidence-first: всегда показываем факты.
- Human-in-the-loop: при низкой уверенности бот уточняет.
- Контекстность: бот понимает текущий раздел.
- Дисклеймеры: на каждом отчете.
- Мультиязычность: RU + EN + ZH (приоритет RU).

## 9) Vercel deployment

- Один репозиторий.
- Production + Preview окружения.
- Env vars:
  - SUPABASE_URL
  - SUPABASE_ANON_KEY
  - SUPABASE_SERVICE_ROLE
  - OPENAI_API_KEY
  - TENDATA_API_KEY
  - QCC_API_KEY
  - APIFY_API_KEY
  - STRIPE_SECRET
  - HALYK_API_KEY
  - KASPI_API_KEY

## 10) Нефункциональные требования

- SLA API: 200 req/min (Tendata).
- Кеширование heavy запросов.
- Retry + backoff на 429.
- Без хранения сырой trade data.

## 11) Хранилище (Supabase Storage)

- bucket: reports (PDF)
- bucket: exports (xlsx/csv)
- bucket: assets (logos, content)

## 12) Политики безопасности (RLS)

- users: доступ только к своему профилю
- orders/reports/payments: доступ по user_id
- chat_history: доступ по user_id
- supplier_entities/features: только через функции (server-only)

## 13) Оптимизации и контроль качества

- Кеш access token Tendata (2 часа).
- Дедупликация запросов по hash параметров.
- Вычисление HS-match и стабильности на сервере.
- Аудит расхода лимитов API через api_usage.