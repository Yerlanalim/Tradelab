# Deploy (Vercel)

## Шаги
1. Подключить репозиторий в Vercel.
2. Добавить переменные окружения из `.env`.
3. Выбрать `npm run build` как build command.
4. Убедиться, что Preview и Production окружения созданы.

## Env vars (минимум)
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- OPENAI_API_KEY (позже)
- APIFY_TOKEN (позже)

## Smoke‑тесты после деплоя
- Авторизация работает
- Reports list доступен
- Контентные разделы загружаются
- Ошибки попадают в Sentry (если DSN задан)

См. также `docs/quality_checklist.md`.
