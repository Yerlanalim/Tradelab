План реализации микросервиса ТНВЭД/HS
Offline-first архитектура с опциональным AI fallback

1. Анализ исходного XLSX
Структура данных
Источник: 
TWS_TNVED_2026-02-03.xlsx

Выявленные характеристики:

Листы: 1 лист ТНВЭД
Колонки: Код, Наименование, Тариф
Количество: 13 279 записей
Формат кодов: все коды 10-символьные (формат: 0101210000)
Кодировка: UTF-8, кириллица + спецсимволы (🠺 как разделитель иерархии)
Пустые значения: отсутствуют
Спецификация формата
interface TNVEDRecord {
  code: string;        // "0101210000" - всегда 10 цифр
  name: string;        // "лошади: 🠺 чистопородные племенные животные"
  tariff: string;      // "0%", "5%", "8%" и т.д.
}
Правила обработки
Нормализация кода:

// Только очистка, БЕЗ дополнения нулями
function normalizeForCompare(raw: string): string {
  return raw.replace(/[\s.-]/g, '');
}
// Интерпретация пользовательского ввода
function interpretUserCode(raw: string): {
  normalized: string;
  searchType: 'exact' | 'prefix';
  length: number;
} {
  const cleaned = normalizeForCompare(raw);
  const length = cleaned.length;
  
  // 10 цифр — точный поиск
  if (length === 10) {
    return { normalized: cleaned, searchType: 'exact', length };
  }
  
  // 8-9 цифр — поиск по префиксу (вернуть все варианты)
  if (length === 8 || length === 9) {
    return { normalized: cleaned, searchType: 'prefix', length };
  }
  
  // 4 или 6 цифр — группы
  if (length === 4 || length === 6) {
    return { normalized: cleaned, searchType: 'prefix', length };
  }
  
  throw new Error(`Invalid code length: ${length}. Expected 4, 6, 8, 9, or 10 digits.`);
}
Нормализация текста:

lowercase
замена ё → е
удаление пунктуации (кроме пробелов)
схлопывание множественных пробелов
удаление стоп-слов опционально
Извлечение префиксов:

code4: первые 4 цифры (товарная группа)
code6: первые 6 цифр (подгруппа)
code10: полный код (товарная позиция)
Валидация
✅ Код содержит только цифры
✅ Длина после нормализации = 10
✅ name не пустое
⚠️ Дубликаты кодов → использовать последнюю версию
Инструмент чтения
Библиотека: 
xlsx
 (Node.js)

import XLSX from 'xlsx';
const workbook = XLSX.readFile('TWS_TNVED_2026-02-03.xlsx');
const sheet = workbook.Sheets['ТНВЭД'];
const records = XLSX.utils.sheet_to_json<TNVEDRecord>(sheet);
2. Модель данных и схема SQLite
DDL Schema
-- Основная таблица кодов
CREATE TABLE hs_codes (
  code TEXT PRIMARY KEY,           -- "0101210000"
  code4 TEXT NOT NULL,              -- "0101"
  code6 TEXT NOT NULL,              -- "010121"
  name TEXT NOT NULL,               -- оригинальное наименование
  clean_name TEXT NOT NULL,         -- нормализованное для поиска
  path TEXT,                        -- иерархия: "Животные > Лошади > Племенные" (из 🠺)
  tariff_raw TEXT,                  -- тариф как в XLSX (trim only)
  tariff_clean TEXT,                -- нормализованный: без мусора, но БЕЗ парсинга ставок/валют
  created_at INTEGER NOT NULL       -- Unix timestamp
);
-- Индексы для быстрого поиска по префиксам кодов
CREATE INDEX idx_code4 ON hs_codes(code4);
CREATE INDEX idx_code6 ON hs_codes(code6);
-- ПРИМЕЧАНИЕ: idx_clean_name НЕ создаём, т.к. B-Tree индекс бесполезен для LIKE '%query%'
-- Для полнотекстового поиска используется FTS5 ниже
-- FTS5 для полнотекстового поиска
CREATE VIRTUAL TABLE hs_codes_fts USING fts5(
  code UNINDEXED,
  clean_name,
  content='hs_codes',
  content_rowid='rowid'
);
-- Триггеры синхронизации FTS
CREATE TRIGGER hs_codes_ai AFTER INSERT ON hs_codes BEGIN
  INSERT INTO hs_codes_fts(rowid, code, clean_name)
  VALUES (new.rowid, new.code, new.clean_name);
END;
CREATE TRIGGER hs_codes_ad AFTER DELETE ON hs_codes BEGIN
  DELETE FROM hs_codes_fts WHERE rowid = old.rowid;
END;
-- Метаданные версии
CREATE TABLE metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
Сравнение подходов поиска
Подход	Скорость	Точность	Сложность	Выбор
FTS5	O(log N)	Высокая (BM25 rank)	Средняя	✅ MVP
LIKE %query%	O(N) full scan*	Средняя	Низкая	Fallback
Токены + INTERSECT	O(k·log N)	Средняя	Высокая	Будущее
*LIKE с ведущим % не использует B-Tree индекс, всегда full table scan

Решение: FTS5 как основа MVP (встроен в SQLite 3.9+). LIKE используется только как emergency fallback.

3. Build Step: XLSX → SQLite
Структура скрипта
Файл: scripts/build-tnved-db.ts

import XLSX from 'xlsx';
import Database from 'better-sqlite3';
import crypto from 'crypto';
async function buildDatabase(xlsxPath: string, dbPath: string) {
  // 1. Чтение XLSX
  // 2. Валидация и нормализация
  // 3. Создание SQLite schema
  // 4. Вставка данных (bulk transaction)
  // 5. Сохранение метаданных
}
Зависимости
{
  "dependencies": {
    "better-sqlite3": "^11.0.0",
    "xlsx": "^0.18.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0",
    "tsx": "^4.0.0"
  }
}
NPM Script
{
  "scripts": {
    "build:db": "tsx scripts/build-tnved-db.ts"
  }
}
Алгоритм сборки
// Шаг 1: Чтение
const wb = XLSX.readFile(xlsxPath);
// defval: '' предотвращает пропуск пустых ячеек
const data = XLSX.utils.sheet_to_json(wb.Sheets['ТНВЭД'], { defval: '' });
// Шаг 2: Нормализация (для загрузки в БД все коды уже 10-значные)
const normalized = data.map(row => {
  const code = normalizeForCompare(row['Код']);
  if (code.length !== 10) {
    throw new Error(`Invalid code in XLSX: ${row['Код']} (length: ${code.length})`);
  }
  
  // Парсинг иерархии из 🠺
  const parsePath = (name: string): string => {
    return name
      .split('🠺')
      .map(s => s.trim())
      .filter(s => s.length > 0)
      .join(' > ');
  };
  
  // Очистка тарифа БЕЗ парсинга ставок/валют
  const cleanTariff = (raw: string): string => {
    if (!raw) return '';
    
    return raw
      .trim()
      .replace(/\u00A0/g, ' ')           // NBSP → обычный пробел
      .replace(/\s+/g, ' ')               // схлопывание множественных пробелов
      .replace(/^['"]|['"]$/g, '');       // удаление leading/trailing кавычек
  };
  
  const tariffRaw = (row['Тариф'] || '').trim();
  
  return {
    code,
    code4: code.slice(0, 4),
    code6: code.slice(0, 6),
    name: row['Наименование'],
    clean_name: cleanText(row['Наименование']),
    path: parsePath(row['Наименование']),
    tariff_raw: tariffRaw,
    tariff_clean: cleanTariff(tariffRaw)
  };
});
// Шаг 3: Валидация
const valid = normalized.filter(r => /^\d{10}$/.test(r.code) && r.name);
// Шаг 4: Запись в SQLite
const db = new Database(dbPath);
db.exec(DDL_SCHEMA); // из файла schema.sql
const insert = db.prepare(`
  INSERT INTO hs_codes (code, code4, code6, name, clean_name, path, tariff_raw, tariff_clean, created_at)
  VALUES (@code, @code4, @code6, @name, @clean_name, @path, @tariff_raw, @tariff_clean, @created_at)
`);
db.transaction(() => {
  for (const record of valid) {
    insert.run({ ...record, created_at: Date.now() });
  }
})();
// Шаг 5: Метаданные
const SCHEMA_VERSION = '1'; // Версия схемы БД (увеличивать при breaking changes)
const fileHash = crypto.createHash('sha256')
  .update(fs.readFileSync(xlsxPath))
  .digest('hex');
db.prepare('INSERT INTO metadata VALUES (?, ?)').run('schema_version', SCHEMA_VERSION);
db.prepare('INSERT INTO metadata VALUES (?, ?)').run('data_version', fileHash);
db.prepare('INSERT INTO metadata VALUES (?, ?)').run('source_file', path.basename(xlsxPath));
db.prepare('INSERT INTO metadata VALUES (?, ?)').run('built_at', new Date().toISOString());
db.prepare('INSERT INTO metadata VALUES (?, ?)').run('records_count', valid.length);
db.close();
Выходные артефакты
data/tnved.db (SQLite database, ~3-5 MB)
data/tnved.db.sha256 (checksum)
Лог сборки: количество обработанных/пропущенных записей
4. Runtime: TypeScript микросервис
Framework: Fastify
Обоснование:

Самый быстрый фреймворк для Node.js
Встроенная валидация через JSON Schema
TypeScript-first
Легковесный (~1.5 MB)
Архитектура
src/
├── server.ts          # Точка входа
├── db.ts              # SQLite connection manager
├── routes/
│   ├── health.ts      # GET /health
│   ├── version.ts     # GET /version
│   └── hs/
│       ├── code.ts    # GET /hs/code/:code
│       └── search.ts  # GET /hs/search
├── services/
│   └── search.service.ts  # Логика поиска
└── types.ts           # TypeScript типы
API Endpoints
1. GET /hs/code/:code
Описание: Поиск по коду (точный + representative examples)

Query params:

include_examples (boolean, default: true) - включать примеры из префиксов
Response:

{
  exact?: HSCodeRecord,                    // если найден точный код (10 цифр)
  prefix_info?: {
    code4: string,                         // "0101"
    code6: string,                         // "010121"
    examples_4?: HSCodeRecord[],           // Top 10 примеров из группы code4
    examples_6?: HSCodeRecord[],           // Top 10 примеров из подгруппы code6
    note: string                           // "Описание группы отсутствует в источнике. Показаны примеры позиций."
  },
  meta: {
    query_time_ms: number,
    source: "offline",                       // всегда offline для этого эндпойнта
    match: "exact" | "prefix",               // тип совпадения
    dataset_coverage: {
      records_count: number,
      source_file: string,
      built_at: string,
      coverage_note: "Неполная выборка; используйте как справочник-подсказку"
    }
  }
}
2. GET /hs/search
Описание: Поиск по описанию

Query params:

q (string, required, min: 3, max: 200)
limit (number, default: 10, max: 50)
Response:

{
  results: Array<HSCodeRecord & { score: number }>,
  total: number,
  meta: {
    query_time_ms: number,
    source: "offline",                       // всегда offline (или "ai" если fallback активен)
    match: "fts" | "like" | "ai",            // метод поиска
    dataset_coverage: {
      records_count: number,
      source_file: string,
      built_at: string,
      coverage_note: "Неполная выборка; используйте как справочник-подсказку"
    }
  }
}
3. GET /health
{ "status": "ok", "db_connected": true }
4. GET /version
{
  "schema_version": "1",
  "data_version": "sha256_hash",
  "dataset_coverage": {
    "records_count": 13279,
    "source_file": "TWS_TNVED_2026-02-03.xlsx",
    "built_at": "2026-02-03T16:00:00Z",
    "coverage_note": "Неполная выборка; используйте как справочник-подсказку"
  }
}
Database Connection
// db.ts
import Database from 'better-sqlite3';
const EXPECTED_SCHEMA_VERSION = '1'; // Должна совпадать с версией при сборке БД
let db: Database.Database | null = null;
export function getDB(): Database.Database {
  if (!db) {
    db = new Database(process.env.DB_PATH || 'data/tnved.db', {
      readonly: true,
      fileMustExist: true
    });
    
    // Оптимизация для чтения (WAL и synchronous бессмысленны в readonly режиме)
    db.pragma('cache_size = -64000');  // 64 MB cache
    db.pragma('temp_store = MEMORY');  // временные таблицы в RAM
    // mmap_size: конфигурируемый, консервативный по умолчанию (2 GB вместо 30 GB)
    const mmapSize = process.env.SQLITE_MMAP_SIZE ?? '2147483648';
    db.pragma(`mmap_size = ${mmapSize}`);
    
    // КРИТИЧНО: Проверка совместимости схемы
    validateSchema(db);
  }
  return db;
}
function validateSchema(db: Database.Database): void {
  const schemaVersion = db.prepare('SELECT value FROM metadata WHERE key = ?')
    .get('schema_version')?.value;
  
  if (!schemaVersion) {
    throw new Error('Database missing schema_version in metadata. Rebuild required.');
  }
  
  if (schemaVersion !== EXPECTED_SCHEMA_VERSION) {
    throw new Error(
      `Schema version mismatch! Database: ${schemaVersion}, Service: ${EXPECTED_SCHEMA_VERSION}. ` +
      'Please rebuild the database or update the service.'
    );
  }
  
  console.info('✓ Schema version validated:', schemaVersion);
}
Error Handling
// Middleware для обработки ошибок
fastify.setErrorHandler((error, request, reply) => {
  if (error.validation) {
    return reply.status(400).send({
      error: 'Validation error',
      details: error.validation
    });
  }
  
  request.log.error(error);
  reply.status(500).send({ error: 'Internal server error' });
});
Опциональный LRU Cache
import LRU from 'lru-cache';
const searchCache = new LRU<string, SearchResult>({
  max: 500,
  ttl: 1000 * 60 * 10 // 10 минут
});
5. Логика поиска без лемматизации
Алгоритм распознавания запроса
// Определение типа запроса: код только если ВСЯ строка после очистки = цифры нужной длины
function detectQueryType(q: string): 'code' | 'text' {
  const cleaned = normalizeForCompare(q);
  // Код только если точно 4, 6, 8, 9 или 10 цифр БЕЗ других символов
  if (/^\d{4}$|^\d{6}$|^\d{8}$|^\d{9}$|^\d{10}$/.test(cleaned)) {
    return 'code';
  }
  return 'text';
}
Поиск по коду
function searchByCode(userInput: string): SearchResult {
  const { normalized, searchType, length } = interpretUserCode(userInput);
  
  if (searchType === 'exact') {
    // Точное совпадение (10 цифр)
    const exact = db.prepare('SELECT * FROM hs_codes WHERE code = ?').get(normalized);
    
    if (!exact) {
      return { exact: null, query_type: 'exact' };
    }
    
    // Representative examples из префиксов (НЕ "группы")
    const prefix_info = {
      code4: normalized.slice(0, 4),
      code6: normalized.slice(0, 6),
      examples_4: db.prepare(`
        SELECT * FROM hs_codes 
        WHERE code LIKE ? 
        ORDER BY code 
        LIMIT 10
      `).all(`${normalized.slice(0, 4)}%`),
      examples_6: db.prepare(`
        SELECT * FROM hs_codes 
        WHERE code LIKE ? 
        ORDER BY code 
        LIMIT 10
      `).all(`${normalized.slice(0, 6)}%`),
      note: 'Описание группы отсутствует в источнике. Показаны примеры позиций.'
    };
    
    return { exact, prefix_info, query_type: 'exact' };
  }
  
  if (searchType === 'prefix') {
    // Поиск по префиксу (4, 6, 8, 9 цифр)
    const matches = db.prepare(`
      SELECT * FROM hs_codes 
      WHERE code LIKE ? 
      ORDER BY code 
      LIMIT 50
    `).all(`${normalized}%`);
    
    return {
      matches,
      query_type: 'prefix',
      prefix: normalized,
      prefix_length: length,
      need_clarification: matches.length > 1,
      suggestion: matches.length > 1 
        ? `Найдено ${matches.length} вариантов. Уточните код.`
        : undefined
    };
  }
  
  throw new Error('Invalid search type');
}
Поиск по описанию (FTS5)
// Подготовка запроса для FTS5
function prepareFTSQuery(text: string): string {
  // 1. Нормализация текста
  const cleaned = cleanText(text);
  
  // 2. Разбивка на токены (слова)
  const tokens = cleaned
    .split(/\s+/)
    .filter(token => token.length > 2); // игнорируем короткие слова
  
  if (tokens.length === 0) {
    throw new Error('Query too short after cleaning');
  }
  
  // 3. Экранирование специальных символов FTS5: " - ( ) * :
  const escaped = tokens.map(token => 
    token.replace(/["()*:-]/g, '')
  );
  
  // 4. Формируем запрос: "слово1" "слово2" (каждое в кавычках для точного поиска)
  return escaped.map(t => `"${t}"`).join(' ');
}
function searchByText(query: string, limit: number): SearchResult {
  const cleanQuery = cleanText(query);
  
  // Приоритет A: FTS5 (с защитой от ошибок синтаксиса)
  try {
    const ftsQuery = prepareFTSQuery(query);
    
    const ftsResults = db.prepare(`
      SELECT 
        c.*,
        bm25(f) as score
      FROM hs_codes_fts f
      JOIN hs_codes c ON c.rowid = f.rowid
      WHERE f.clean_name MATCH ?
      ORDER BY score ASC
      LIMIT ?
    `).all(ftsQuery, limit);
    
    if (ftsResults.length > 0) {
      return { results: ftsResults, source: 'offline', match: 'fts' };
    }
  } catch (error) {
    // FTS запрос не удался (невалидный синтаксис или другая ошибка)
    console.warn('FTS search failed, falling back to LIKE:', error.message);
  }
  
  // Приоритет B: Fallback LIKE (всегда работает, но МЕДЛЕННО)
  // ВАЖНО: LIKE '%query%' делает full table scan O(N), т.к. ведущий % не даёт использовать индекс
  // На 13k записей это ~5-20ms, но на больших базах будет проблема
  const likeResults = db.prepare(`
    SELECT *, 0 as score
    FROM hs_codes
    WHERE clean_name LIKE ?
    LIMIT ?
  `).all(`%${cleanQuery}%`, limit);
  
  return { results: likeResults, source: 'offline', match: 'like' };
}
Ранжирование
FTS5 BM25: встроенный алгоритм взвешивания релевантности. Возвращает отрицательные значения, где меньше = лучше.

Важно: Пороги score зависят от данных и не универсальны. Не фиксируем их в коде.

AI Fallback активация:

Если results.length < AI_FALLBACK_MIN_RESULTS (default: 3)
Или если лучший score > AI_FALLBACK_MAX_BEST_SCORE (default: -5, эмпирически подбирается)
Эти пороги настраиваются через env переменные.

Обработка неоднозначности
Пример: "часы наручные"

{
  results: [
    { code: "9102110000", name: "часы: наручные: механические", score: -1.2 },
    { code: "9102120000", name: "часы: наручные: кварцевые", score: -1.3 }
  ],
  need_clarification: true,
  suggestion: "Уточните тип механизма: механические или кварцевые?"
}
6. Online Fallback (опционально)
Правила активации
Условия:

Офлайн поиск вернул < 3 результата ИЛИ score < -10
ENABLE_AI_FALLBACK=true в конфиге
Не превышен лимит запросов (rate limit)
Интеграция LLM
Провайдер: Google Generative AI (существующий в проекте)

import { generateText } from './google-ai';
async function aiSearch(query: string): Promise<SearchResult> {
  const prompt = `
Найди код ТНВЭД для товара: "${query}"
Верни только код (10 цифр) и краткое название.
Формат: CODE | NAME
  `;
  
  const response = await generateText(prompt, { maxTokens: 50 });
  
  // Робастный парсинг: ищем 10 цифр через regex (LLM может вернуть мусор)
  const match = response.match(/\b(\d{10})\b/);
  
  if (!match) {
    return {
      results: [],
      error: 'AI не вернул валидный 10-значный код',
      source: 'ai_invalid'
    };
  }
  
  const code = match[1];
  
  // ОБЯЗАТЕЛЬНАЯ ВАЛИДАЦИЯ: код должен существовать в БД
  const exists = db.prepare('SELECT * FROM hs_codes WHERE code = ?').get(code);
  
  if (!exists) {
    return {
      results: [],
      error: 'AI вернул несуществующий код',
      source: 'ai_invalid'
    };
  }
  
  return {
    results: [{ ...exists, score: -99, ai_suggested: true }],
    source: 'ai'
  };
}
Меры безопасности
Rate limiting: 10 запросов/минуту на IP
Логирование всех AI-запросов
AI_DAILY_LIMIT в .env
Отдельная метрика для мониторинга расходов
7. Тестирование
Структура тестов
tests/
├── unit/
│   ├── normalize.test.ts       # Нормализация кода/текста
│   ├── detect-query.test.ts    # Детектор типа запроса
│   └── clean-text.test.ts      # Очистка текста
├── integration/
│   ├── search-by-code.test.ts  # Поиск по коду
│   ├── search-by-text.test.ts  # Поиск по описанию
│   └── api.test.ts             # E2E тесты API
└── golden/
    ├── queries.yaml            # Набор тестовых запросов
    └── expected.yaml           # Ожидаемые результаты
Golden Tests
queries.yaml:

- query: "часы наручные механические"
  expected_code: "9102110000"
  min_score: -3.0
- query: "0101210000"
  expected_exact: true
  expected_name: "лошади: чистопородные"
- query: "яблоки свежие"
  expected_top3: ["0808100000", "0808300000"]
Тесты базы данных
describe('Database integrity', () => {
  it('should have expected number of records', () => {
    const count = db.prepare('SELECT COUNT(*) as c FROM hs_codes').get();
    expect(count.c).toBe(13279);
  });
  
  it('should have unique codes', () => {
    const duplicates = db.prepare(`
      SELECT code, COUNT(*) as c 
      FROM hs_codes 
      GROUP BY code 
      HAVING c > 1
    `).all();
    expect(duplicates).toHaveLength(0);
  });
  
  it('should have FTS index', () => {
    const tables = db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%fts%'
    `).all();
    expect(tables.length).toBeGreaterThan(0);
  });
});
Команды запуска
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:golden": "vitest run tests/golden"
  }
}
8. Деплой и эксплуатация
Контейнеризация
Dockerfile:

FROM node:20-alpine
WORKDIR /app
# Копирование зависимостей
COPY package*.json ./
RUN npm ci --only=production
# Копирование кода
COPY dist/ ./dist/
COPY data/tnved.db ./data/
ENV NODE_ENV=production
ENV DB_PATH=/app/data/tnved.db
EXPOSE 3000
CMD ["node", "dist/server.js"]
Обновление базы данных
Процесс:

Билд новой базы: npm run build:db
Создание нового Docker image с обновленной tnved.db
Rolling update в Kubernetes/Docker Swarm
Health check перед переключением трафика
Zero-downtime:

# docker-compose.yml
services:
  hs-service:
    image: hs-service:latest
    volumes:
      - ./data/tnved.db:/app/data/tnved.db:ro  # read-only
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 10s
Observability
Метрики (Prometheus):

import prom from 'prom-client';
const searchLatency = new prom.Histogram({
  name: 'hs_search_duration_seconds',
  help: 'Search latency',
  labelNames: ['method', 'source']
});
const cacheHits = new prom.Counter({
  name: 'hs_cache_hits_total',
  help: 'Cache hits'
});
Логирование (Structured):

fastify.addHook('onRequest', (request, reply, done) => {
  request.log.info({
    method: request.method,
    url: request.url,
    ip: request.ip
  });
  done();
});
Конфигурация
.env:

# Database
DB_PATH=./data/tnved.db
# Server
PORT=3000
LOG_LEVEL=info
# Features
ENABLE_AI_FALLBACK=false
AI_DAILY_LIMIT=100
# Performance
CACHE_TTL_SECONDS=600
MAX_SEARCH_LIMIT=50
9. Риски и компромиссы
Риск	Симптом	Вероятность	Решение
Производительность FTS	Поиск > 500ms на длинных запросах	Средняя	Ограничение длины q (200 символов), индексация по токенам
Качество без лемматизации	"машины" ≠ "машина"	Высокая	FTS stemming (porter), синонимы в будущем
Изменение структуры XLSX	Build script падает	Средняя	Версионирование schema, fallback на старый маппинг
Рост размера базы	>100 MB	Низкая	Compression, денормализация, переход на PostgreSQL
Несовместимость версий	Старый API ≠ новая база	Низкая	Semantic versioning, migration guide
AI hallucinations	Несуществующие коды	Высокая	Обязательная валидация по SQLite
Rate limit AI	Превышение квоты	Средняя	Circuit breaker, экспоненциальный backoff
Компромиссы MVP
✅ Принято:

FTS5 вместо морфологии (баланс качество/сложность)
Offline-first (99% запросов без AI)
Read-only SQLite (простота деплоя)
❌ Отложено:

Лемматизация в runtime
Поддержка синонимов
Нечеткий поиск (fuzzy matching)
GraphQL API
Этапы реализации
Этап 1: Подготовка базы (2-3 дня)
 Создать scripts/build-tnved-db.ts
 Реализовать нормализацию
 Написать DDL schema
 Протестировать сборку
Артефакт: Рабочая SQLite база

Этап 2: Микросервис Core (3-4 дня)
 Настроить Fastify
 Реализовать /hs/code/:code
 Реализовать /hs/search (FTS)
 Unit + integration тесты
Артефакт: Работающий API

Этап 3: Тестирование и доработка (2 дня)
 Golden tests
 Оптимизация запросов
 Обработка edge cases
Артефакт: Стабильный сервис

Этап 4: Деплой (1 день)
 Dockerfile
 CI/CD pipeline
 Мониторинг
Артефакт: Продакшн-ready сервис

Этап 5 (Опционально): AI Fallback (2 дня)
 Интеграция LLM
 Валидация
 Rate limiting
Общее время: 8-12 дней

Checklist перед продакшном
 База содержит все 13 279 записей
 FTS индекс построен корректно
 Все golden tests проходят
 Response time p95 < 100ms
 Health check отвечает
 Метрики экспортируются
 Логи структурированы
 .env.example актуален
 README с примерами API
 Версия базы документирована