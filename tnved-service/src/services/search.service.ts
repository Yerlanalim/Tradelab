/**
 * Search service - бизнес-логика поиска с поддержкой AI Fallback
 */

import OpenAI from 'openai';
import { getDB } from '../db.js';
import { cleanText, normalizeForCompare, interpretUserCode } from '../utils.js';
import type {
  HSCodeRecord,
  HSCodeWithScore,
  DatasetCoverage,
  SearchByTextResponse
} from '../types.js';

// --- Конфигурация сервиса ---
const CONFIG = {
  // Настройки AI
  AI: {
    get model() {
      return (process.env.P3_BASE_MODEL || "gpt-4o-mini").replace(/['"]/g, "").trim();
    },
    get enabled() {
      return process.env.ENABLE_AI_FALLBACK === 'true';
    },
    // Пороги активации AI
    thresholds: {
      get minResults() { return parseInt(process.env.AI_FALLBACK_MIN_RESULTS || '3', 10); },
      get maxBestScore() { return parseFloat(process.env.AI_FALLBACK_MAX_BEST_SCORE || '-5'); }
    }
  },
  // Настройки поиска
  search: {
    defaultLimit: 10,
    maxLimit: 50
  }
};

let openai: OpenAI | null = null;

/**
 * Инициализация клиента OpenAI (Lazy loading)
 */
function getOpenAIClient(): OpenAI {
  if (!openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is missing. AI features will be disabled.');
    }
    openai = new OpenAI({ apiKey });
  }
  return openai;
}

/**
 * Определение типа входящего запроса (Текст или Код)
 */
export function detectQueryType(q: string): 'code' | 'text' {
  const cleaned = normalizeForCompare(q);
  // Код ТНВЭД всегда состоит из 4, 6, 8, 9 или 10 цифр
  return /^\d{4}$|^\d{6}$|^\d{8}$|^\d{9}$|^\d{10}$/.test(cleaned) ? 'code' : 'text';
}

/**
 * Получение текущей статистики и метаданных базы данных
 */
export function getDatasetCoverage(): DatasetCoverage {
  const db = getDB();
  const metadata = db.prepare('SELECT key, value FROM metadata').all() as Array<{ key: string; value: string }>;
  const meta = Object.fromEntries(metadata.map(m => [m.key, m.value]));
  
  return {
    records_count: parseInt(meta.records_count || '0', 10),
    source_file: meta.source_file || 'unknown',
    built_at: meta.built_at || 'unknown',
    coverage_note: meta.coverage_note || 'Справочные данные ТНВЭД ЕАЭС'
  };
}

/**
 * Поиск по точному коду или префиксу
 */
export function searchByCode(userInput: string, includeExamples: boolean = true) {
  const db = getDB();
  const { normalized, searchType } = interpretUserCode(userInput);
  
  if (searchType === 'exact') {
    const exact = db.prepare('SELECT * FROM hs_codes WHERE code = ?').get(normalized) as HSCodeRecord | undefined;
    if (!exact) return { exact: null, query_type: 'exact' };
    
    let prefix_info;
    if (includeExamples) {
      prefix_info = {
        code4: normalized.slice(0, 4),
        code6: normalized.slice(0, 6),
        examples_4: db.prepare(`SELECT * FROM hs_codes WHERE code LIKE ? LIMIT 5`).all(`${normalized.slice(0, 4)}%`) as HSCodeRecord[],
        examples_6: db.prepare(`SELECT * FROM hs_codes WHERE code LIKE ? LIMIT 5`).all(`${normalized.slice(0, 6)}%`) as HSCodeRecord[],
        note: 'Примеры смежных позиций из той же группы.'
      };
    }
    return { exact, prefix_info, query_type: 'exact' };
  }
  
  // Поиск по префиксу (подсказки)
  const matches = db.prepare(`SELECT * FROM hs_codes WHERE code LIKE ? ORDER BY code LIMIT 20`).all(`${normalized}%`) as HSCodeRecord[];
  return {
    matches,
    query_type: 'prefix',
    prefix: normalized,
    need_clarification: matches.length > 1
  };
}

/**
 * Генерация FTS5 запроса с псевдо-лемматизацией
 */
function buildFTSQuery(text: string): string {
  const tokens = cleanText(text).split(/\s+/).filter(t => t.length > 0);
  if (tokens.length === 0) throw new Error('Query contains no searchable tokens');
  
  return tokens.map(t => {
    if (t.length <= 3) return `"${t.replace(/"/g, '')}"`;
    // Псевдо-лемматизация: убираем русские окончания и добавляем префиксный поиск
    const root = t.replace(/[аеиоуыэюяшьй]+$/g, '');
    return root.length >= 3 ? `${root}*` : `"${t}"`;
  }).join(' AND '); // Используем AND для более точного соответствия
}

/**
 * Вызов AI для предсказания кода на основе семантики
 */
async function getCodePrediction(query: string): Promise<string | null> {
  if (!CONFIG.AI.enabled) return null;
  
  try {
    const client = getOpenAIClient();
    const response = await client.chat.completions.create({
      model: CONFIG.AI.model,
      messages: [
        {
          role: "system",
          content: "You are a customs broker expert. Predict the most accurate 10-digit HS Code (ТНВЭД) for the given product description. Respond ONLY with the 10-digit code. If multiple apply, choose the most specific."
        },
        { role: "user", content: query }
      ],
      temperature: 0.1, // Низкая температура для стабильности
    });

    const body = response.choices[0].message?.content || "";
    const digitsOnly = body.replace(/[.\s-]/g, "");
    const match = digitsOnly.match(/(\d{10})/);
    
    return match ? match[1] : null;
  } catch (error) {
    console.warn('[AI Service] Prediction failed:', (error as Error).message);
    return null;
  }
}

/**
 * Основной метод текстового поиска: Офлайн -> LIKE -> AI
 */
export async function searchByText(query: string, limit: number = CONFIG.search.defaultLimit): Promise<{
  results: HSCodeWithScore[];
  source: 'offline' | 'ai' | 'hybrid';
  match: 'fts' | 'like' | 'ai';
}> {
  const db = getDB();
  const cleanQuery = cleanText(query);
  let results: HSCodeWithScore[] = [];
  let matchType: 'fts' | 'like' | 'ai' = 'fts';
  let source: 'offline' | 'ai' | 'hybrid' = 'offline';

  // 1. Полнотекстовый поиск (FTS5)
  try {
    const fts = buildFTSQuery(query);
    results = db.prepare(`
      SELECT c.*, bm25(hs_codes_fts) as score
      FROM hs_codes_fts
      JOIN hs_codes c ON c.rowid = hs_codes_fts.rowid
      WHERE hs_codes_fts MATCH ?
      ORDER BY score ASC LIMIT ?
    `).all(fts, limit) as HSCodeWithScore[];
  } catch (e) {
    matchType = 'like';
  }

  // 2. Fallback: LIKE поиск (если FTS5 пуст)
  if (results.length === 0) {
    matchType = 'like';
    results = db.prepare(`SELECT *, 0 as score FROM hs_codes WHERE clean_name LIKE ? LIMIT ?`)
      .all(`%${cleanQuery}%`, limit) as HSCodeWithScore[];
  }

  // 3. AI Fallback: Умная достройка результатов
  const isInsufficient = results.length < CONFIG.AI.thresholds.minResults;
  const isLowRelevance = results.length > 0 && results[0].score > CONFIG.AI.thresholds.maxBestScore;

  if (CONFIG.AI.enabled && (isInsufficient || isLowRelevance)) {
    const aiCode = await getCodePrediction(query);
    if (aiCode && !results.some(r => r.code === aiCode)) {
      const dbMatch = db.prepare('SELECT * FROM hs_codes WHERE code = ?').get(aiCode) as HSCodeRecord | undefined;
      
      const record: HSCodeWithScore = dbMatch 
        ? { ...dbMatch, score: -100 } 
        : {
            code: aiCode,
            code4: aiCode.slice(0,4),
            code6: aiCode.slice(0,6),
            name: `[AI Suggestion] ${query}`,
            clean_name: query,
            path: "Рекомендация экспертной системы AI",
            tariff_raw: "н/д",
            tariff_clean: "н/д",
            created_at: Date.now(),
            score: -100
          };
      
      results = [record, ...results].slice(0, limit);
      source = results.length > 1 ? 'hybrid' : 'ai';
      if (results.length === 1) matchType = 'ai';
    }
  }

  return { results, source, match: matchType };
}
