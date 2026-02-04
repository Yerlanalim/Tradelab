/**
 * Database connection manager
 */

import Database from 'better-sqlite3';
import { resolve } from 'path';

// Внутренняя версия схемы, с которой умеет работать этот код.
// Изменяется только при обновлении скриптов сборки БД.
const EXPECTED_SCHEMA_VERSION = '1';

let db: Database.Database | null = null;

export function getDB(): Database.Database {
  if (!db) {
    // Получаем путь к БД из окружения или штатный дефолт
    const rawPath = process.env.DB_PATH || './data/tnved.db';
    // Резолвим путь относительно корня сервиса для надежности
    const dbPath = resolve(process.cwd(), rawPath);
    
    db = new Database(dbPath, {
      readonly: true,
      fileMustExist: true
    });
    
    // Продвинутые настройки SQLite для максимальной производительности чтения
    const cacheSizeKB = parseInt(process.env.SQLITE_CACHE_SIZE_KB || '64000'); // 64 MB по умолчанию
    const mmapSize = process.env.SQLITE_MMAP_SIZE || '2147483648'; // 2 GB по умолчанию
    
    db.pragma(`cache_size = -${cacheSizeKB}`); 
    db.pragma('temp_store = MEMORY');
    db.pragma(`mmap_size = ${mmapSize}`);
    db.pragma('journal_mode = OFF'); // В readonly режиме журнал не нужен
    
    validateSchema(db);
  }
  return db;
}

/**
 * Проверка совместимости структуры БД с текущим кодом
 */
function validateSchema(db: Database.Database): void {
  const schemaVersion = db.prepare('SELECT value FROM metadata WHERE key = ?')
    .get('schema_version') as { value: string } | undefined;
  
  if (!schemaVersion) {
    throw new Error('Database integrity error: missing schema_version in metadata. Rebuild recommended.');
  }
  
  if (schemaVersion.value !== EXPECTED_SCHEMA_VERSION) {
    throw new Error(
      `Incompatible database schema! Expected: ${EXPECTED_SCHEMA_VERSION}, Found: ${schemaVersion.value}. ` +
      'Please run "npm run build:db" to update your local storage.'
    );
  }
  
  console.info(`✓ TNVED Database connected. Schema v${schemaVersion.value}`);
}

export function closeDB(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// Корректное завершение при сигналах системы
const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
signals.forEach(sig => {
  process.on(sig, () => {
    closeDB();
    process.exit(0);
  });
});
