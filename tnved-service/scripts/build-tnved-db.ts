/**
 * Build script: XLSX → SQLite
 * Преобразует исходный XLSX файл в SQLite базу данных
 */

import XLSX from 'xlsx';
import Database from 'better-sqlite3';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  normalizeForCompare,
  cleanText,
  parsePath,
  cleanTariff
} from '../src/utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCHEMA_VERSION = '1'; // Версия схемы БД (увеличивать при breaking changes)

// Пути
// Автоматический поиск XLSX файла если не указан явно
const getXlsxPath = () => {
  if (process.argv[2]) return process.argv[2];
  
  const dataDir = path.join(__dirname, '../data');
  const files = fs.existsSync(dataDir) ? fs.readdirSync(dataDir) : [];
  const latestXlsx = files.find(f => f.endsWith('.xlsx') && f.startsWith('TWS_TNVED'));
  
  if (latestXlsx) return path.join(dataDir, latestXlsx);
  
  // Дефолт для обратной совместимости
  return path.join(__dirname, '../../TWS_TNVED_2026-02-03.xlsx');
};

const xlsxPath = getXlsxPath();
const dbPath = path.join(__dirname, '../data/tnved.db');
const schemaPath = path.join(__dirname, '../schema/schema.sql');

console.log('📦 Building ТНВЭД database...');
console.log(`📄 Source: ${xlsxPath}`);
console.log(`💾 Target: ${dbPath}`);

// Проверка существования файлов
if (!fs.existsSync(xlsxPath)) {
  console.error(`❌ XLSX file not found: ${xlsxPath}`);
  process.exit(1);
}

if (!fs.existsSync(schemaPath)) {
  console.error(`❌ Schema file not found: ${schemaPath}`);
  process.exit(1);
}

// Шаг 1: Чтение XLSX
console.log('\n1️⃣ Reading XLSX...');
const wb = XLSX.readFile(xlsxPath);
// defval: '' предотвращает пропуск пустых ячеек
const data = XLSX.utils.sheet_to_json(wb.Sheets['ТНВЭД'], { defval: '' }) as Array<{
  'Код': string;
  'Наименование': string;
  'Тариф': string;
}>;

console.log(`   Found ${data.length} rows`);

// Шаг 2: Нормализация
console.log('\n2️⃣ Normalizing data...');
const normalized = data.map((row, idx) => {
  const code = normalizeForCompare(row['Код']);
  
  // Валидация: все коды в XLSX должны быть 10-значными
  if (code.length !== 10) {
    throw new Error(
      `Invalid code in XLSX at row ${idx + 2}: "${row['Код']}" (normalized: "${code}", length: ${code.length})`
    );
  }

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
console.log('\n3️⃣ Validating...');
const valid = normalized.filter(r => /^\d{10}$/.test(r.code) && r.name);
console.log(`   Valid records: ${valid.length} / ${normalized.length}`);

if (valid.length === 0) {
  console.error('❌ No valid records found!');
  process.exit(1);
}

// Шаг 4: Создание БД
console.log('\n4️⃣ Creating database...');

// Удаляем старую БД если существует
if (fs.existsSync(dbPath)) {
  fs.unlinkSync(dbPath);
}

// Создаём директорию если не существует
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

// Применяем схему
const schema = fs.readFileSync(schemaPath, 'utf-8');
db.exec(schema);

// Шаг 5: Вставка данных
console.log('\n5️⃣ Inserting data...');
const insert = db.prepare(`
  INSERT INTO hs_codes (code, code4, code6, name, clean_name, path, tariff_raw, tariff_clean, created_at)
  VALUES (@code, @code4, @code6, @name, @clean_name, @path, @tariff_raw, @tariff_clean, @created_at)
`);

const insertMany = db.transaction((records: typeof valid) => {
  for (const record of records) {
    insert.run({ ...record, created_at: Date.now() });
  }
});

insertMany(valid);

// Шаг 6: Метаданные
console.log('\n6️⃣ Writing metadata...');
const fileHash = crypto.createHash('sha256')
  .update(fs.readFileSync(xlsxPath))
  .digest('hex');

db.prepare('INSERT INTO metadata VALUES (?, ?)').run('schema_version', SCHEMA_VERSION);
db.prepare('INSERT INTO metadata VALUES (?, ?)').run('data_version', fileHash);
db.prepare('INSERT INTO metadata VALUES (?, ?)').run('source_file', path.basename(xlsxPath));
db.prepare('INSERT INTO metadata VALUES (?, ?)').run('built_at', new Date().toISOString());
db.prepare('INSERT INTO metadata VALUES (?, ?)').run('records_count', valid.length.toString());

db.close();

// Проверка размера БД
const stats = fs.statSync(dbPath);
const sizeMB = (stats.size / 1024 / 1024).toFixed(2);

console.log('\n✅ Database built successfully!');
console.log(`   Records: ${valid.length}`);
console.log(`   Size: ${sizeMB} MB`);
console.log(`   Path: ${dbPath}`);
