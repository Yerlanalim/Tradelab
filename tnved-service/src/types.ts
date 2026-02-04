/**
 * TypeScript type definitions
 */

export interface HSCodeRecord {
  code: string;              // "0101210000"
  code4: string;             // "0101"
  code6: string;             // "010121"
  name: string;              // оригинальное наименование
  clean_name: string;        // нормализованное
  path: string | null;       // иерархия
  tariff_raw: string | null; // тариф как в XLSX
  tariff_clean: string | null; // очищенный тариф
  created_at: number;        // Unix timestamp
}

export interface HSCodeWithScore extends HSCodeRecord {
  score: number;             // FTS BM25 score
}

export interface DatasetCoverage {
  records_count: number;
  source_file: string;
  built_at: string;
  coverage_note: string;
}

export interface SearchByCodeResponse {
  exact?: HSCodeRecord;
  prefix_info?: {
    code4: string;
    code6: string;
    examples_4?: HSCodeRecord[];
    examples_6?: HSCodeRecord[];
    note: string;
  };
  meta: {
    query_time_ms: number;
    source: 'offline';
    match: 'exact' | 'prefix';
    dataset_coverage: DatasetCoverage;
  };
}

export interface SearchByTextResponse {
  results: HSCodeWithScore[];
  total: number;
  meta: {
    query_time_ms: number;
    source: 'offline' | 'ai' | 'hybrid';
    match: 'fts' | 'like' | 'ai';
    dataset_coverage: DatasetCoverage;
  };
}

export interface VersionResponse {
  schema_version: string;
  data_version: string;
  dataset_coverage: DatasetCoverage;
}

export interface HealthResponse {
  status: 'ok' | 'error';
  db_connected: boolean;
}
