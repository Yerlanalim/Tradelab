# Google Fallback Configuration

Этот проект поддерживает использование Google Search API и Google Gemini в качестве fallback, когда OpenAI API недоступен.

## Настройка Google APIs

### 1. Google Custom Search API (для поиска товаров)

1. Перейдите в [Google Cloud Console](https://console.cloud.google.com/)
2. Создайте новый проект или выберите существующий
3. Включите **Custom Search API**:
   - Перейдите в "APIs & Services" → "Library"
   - Найдите "Custom Search API"
   - Нажмите "Enable"
4. Создайте API ключ:
   - Перейдите в "APIs & Services" → "Credentials"
   - Нажмите "Create Credentials" → "API Key"
   - Скопируйте ключ в `.env` как `GOOGLE_SEARCH_API_KEY`

5. Настройте поисковый движок:
   - Перейдите на [Programmable Search Engine](https://programmablesearchengine.google.com/)
   - Нажмите "Add" для создания нового движка
   - В "Sites to search" добавьте:
     - `alibaba.com/*`
     - `made-in-china.com/*`
   - Включите "Search the entire web"
   - Скопируйте "Search engine ID" (cx) в `.env` как `GOOGLE_SEARCH_CX`

### 2. Google Gemini API (для анализа)

1. Перейдите в [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Нажмите "Get API key"
3. Создайте новый ключ или используйте существующий
4. Скопируйте ключ в `.env` как `GOOGLE_GEMINI_KEY`

## Конфигурация .env

```bash
# OpenAI (приоритет)
OPENAI_API_KEY=sk-...

# Google Fallback
GOOGLE_SEARCH_API_KEY=AIza...
GOOGLE_SEARCH_CX=619329...
GOOGLE_GEMINI_KEY=AIza...
```

## Логика работы

### Harvester Agent (поиск товаров)
- **Если есть `OPENAI_API_KEY`**: Использует OpenAI с web_search_preview
- **Если нет OpenAI, но есть Google Search**: Использует Google Custom Search API

### Analyst Agent (анализ и оценка рисков)
- **Если есть `OPENAI_API_KEY`**: Использует GPT-5-mini
- **Если нет OpenAI, но есть `GOOGLE_GEMINI_KEY`**: Использует Gemini 1.5 Pro

## Тестирование

Чтобы протестировать Google fallback:

1. Временно закомментируйте `OPENAI_API_KEY` в `.env`:
   ```bash
   # OPENAI_API_KEY=sk-...
   ```

2. Убедитесь, что заполнены Google ключи:
   ```bash
   GOOGLE_SEARCH_API_KEY=AIza...
   GOOGLE_SEARCH_CX=619329...
   GOOGLE_GEMINI_KEY=AIza...
   ```

3. Перезапустите сервер:
   ```bash
   npm run dev
   ```

4. Выполните поиск товаров через интерфейс

В логах вы увидите:
```
[Harvester] Using Google Custom Search API
[Analyst] Using Google Gemini
```

## Ограничения

### Google Custom Search API
- **Бесплатно**: 100 запросов/день
- **Платно**: $5 за 1000 запросов (после первых 100)

### Google Gemini API
- **Бесплатно**: 15 запросов/минуту, 1500 запросов/день (Gemini 1.5 Pro)
- **Платно**: $3.50 за 1M input tokens, $10.50 за 1M output tokens

## Рекомендации

1. **Используйте OpenAI как основной вариант** — он более стабильный для production
2. **Google fallback** — отличный вариант для разработки и тестирования
3. **Мониторьте квоты** — Google APIs имеют строгие лимиты на бесплатном плане
