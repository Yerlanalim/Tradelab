import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Backend root is 3 levels up from this file (src/calc/config -> backend)
const backendRoot = path.resolve(__dirname, '../../..');

export interface ParserRules {
  currencies: string[];
  units: Array<{pattern: string; normalized: string}>;
  operators: Array<{pattern: string; type: string; escalation?: boolean}>;
}

function loadJson<T>(relativePath: string): T {
  const fullPath = path.join(backendRoot, relativePath);
  
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Config file not found: ${fullPath}`);
  }
  
  try {
    const content = fs.readFileSync(fullPath, 'utf-8');
    return JSON.parse(content) as T;
  } catch (error: any) {
    throw new Error(`Failed to load config from ${fullPath}: ${error.message}`);
  }
}

export function loadTariffParserRules(): ParserRules {
  return loadJson('data/customs/tariff_parser_rules.json');
}
