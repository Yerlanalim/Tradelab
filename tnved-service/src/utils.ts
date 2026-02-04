/**
 * Утилиты для нормализации кодов и текста
 */

/**
 * Нормализация кода для сравнения (удаление пробелов, точек, дефисов)
 * НЕ делает padding! Возвращает только цифры.
 */
export function normalizeForCompare(raw: string): string {
  return raw
    .replace(/[\s.\-]/g, '')  // убираем пробелы, точки, дефисы
    .trim();
}

/**
 * Интерпретация пользовательского ввода кода
 * Определяет тип поиска и валидирует длину
 */
export function interpretUserCode(raw: string): {
  normalized: string;
  searchType: 'exact' | 'prefix';
  length: number;
} {
  const normalized = normalizeForCompare(raw);
  const length = normalized.length;

  // Валидация: только допустимые длины
  if (![4, 6, 8, 9, 10].includes(length)) {
    throw new Error(
      `Invalid code length: ${length}. Expected 4, 6, 8, 9, or 10 digits.`
    );
  }

  // Проверка что это только цифры
  if (!/^\d+$/.test(normalized)) {
    throw new Error('Code must contain only digits after normalization');
  }

  return {
    normalized,
    searchType: length === 10 ? 'exact' : 'prefix',
    length
  };
}

/**
 * Очистка текста для поиска и хранения
 */
export function cleanText(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, 'е')                    // ё -> е
    .replace(/[^\w\s\u0400-\u04FF]/g, ' ') // оставляем только буквы, цифры, пробелы (включая кириллицу)
    .replace(/\s+/g, ' ')                   // схлопывание множественных пробелов
    .trim();
}

/**
 * Парсинг иерархии из разделителя 🠺
 */
export function parsePath(name: string): string {
  return name
    .split('🠺')
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .join(' > ');
}

/**
 * Очистка тарифа БЕЗ парсинга ставок/валют
 */
export function cleanTariff(raw: string): string {
  if (!raw) return '';
  
  return raw
    .trim()
    .replace(/\u00A0/g, ' ')           // NBSP → обычный пробел
    .replace(/\s+/g, ' ')               // схлопывание множественных пробелов
    .replace(/^['"]|['"]$/g, '');       // удаление leading/trailing кавычек
}
