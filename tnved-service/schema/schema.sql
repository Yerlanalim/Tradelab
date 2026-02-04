-- ТНВЭД/HS Codes Database Schema
-- Version: 1

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

-- FTS5 виртуальная таблица для полнотекстового поиска
CREATE VIRTUAL TABLE hs_codes_fts USING fts5(
  clean_name,
  content='hs_codes',
  content_rowid='rowid'
);

-- Триггеры для синхронизации FTS индекса
CREATE TRIGGER hs_codes_ai AFTER INSERT ON hs_codes BEGIN
  INSERT INTO hs_codes_fts(rowid, clean_name) VALUES (new.rowid, new.clean_name);
END;

CREATE TRIGGER hs_codes_ad AFTER DELETE ON hs_codes BEGIN
  INSERT INTO hs_codes_fts(hs_codes_fts, rowid, clean_name) VALUES('delete', old.rowid, old.clean_name);
END;

CREATE TRIGGER hs_codes_au AFTER UPDATE ON hs_codes BEGIN
  INSERT INTO hs_codes_fts(hs_codes_fts, rowid, clean_name) VALUES('delete', old.rowid, old.clean_name);
  INSERT INTO hs_codes_fts(rowid, clean_name) VALUES (new.rowid, new.clean_name);
END;

-- Метаданные
CREATE TABLE metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
