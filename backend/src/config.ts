import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Load .env from the project root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const getEnv = (key: string): string => {
  let value = process.env[key] || '';
  value = value.trim().replace(/^["']|["']$/g, '');
  return value;
};

export const OPENAI_API_KEY = getEnv('OPENAI_API_KEY');
export const P3_SEARCH_MODEL = getEnv('P3_SEARCH_MODEL') || 'gpt-5-mini';
export const P3_BASE_MODEL = getEnv('P3_BASE_MODEL') || 'gpt-5-mini';

export const SUPABASE_URL = getEnv('NEXT_PUBLIC_SUPABASE_URL') || getEnv('SUPABASE_URL');
export const SUPABASE_ANON_KEY = getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
export const SUPABASE_SERVICE_ROLE_KEY = getEnv('SUPABASE_SERVICE_ROLE_KEY');

export const PORT = parseInt(process.env.PORT || '3001', 10);

console.log('--- Env Debug ---');
console.log('SUPABASE_URL:', SUPABASE_URL || 'MISSING');
console.log('SUPABASE_ANON_KEY:', SUPABASE_ANON_KEY ? `PRESENT (len: ${SUPABASE_ANON_KEY.length})` : 'MISSING');
console.log('SUPABASE_SERVICE_ROLE_KEY:', SUPABASE_SERVICE_ROLE_KEY ? `PRESENT (len: ${SUPABASE_SERVICE_ROLE_KEY.length})` : 'MISSING');
console.log('-----------------');
