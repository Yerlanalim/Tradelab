import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Load .env from the project root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const getEnv = (key: string): string => {
  const value = (process.env[key] || '').trim();
  // Simply remove wrapping quotes if they exist
  return value.replace(/^['"](.*)['"]$/, '$1').trim();
};

export const OPENAI_API_KEY = getEnv('OPENAI_API_KEY');
export const P3_SEARCH_MODEL = getEnv('P3_SEARCH_MODEL') || 'gpt-5-mini';
export const P3_BASE_MODEL = getEnv('P3_BASE_MODEL') || 'gpt-5-mini';

export const GPT5_MINI_PRICING = {
  input: 0.25,        // $ per 1M tokens
  cached_input: 0.025, // $ per 1M tokens
  output: 2.00        // $ per 1M tokens
};

export const GEMINI_2_5_PRO_PRICING = {
  input: 1.25,
  input_large: 2.50, // > 200k
  output: 10.00,
  output_large: 15.00 // > 200k
};

export const GEMINI_2_5_FLASH_PRICING = {
  input: 0.30,
  output: 2.50
};

// Google Fallback Configuration
export const GOOGLE_SEARCH_API_KEY = getEnv('GOOGLE_SEARCH_API_KEY');
export const GOOGLE_SEARCH_CX = getEnv('GOOGLE_SEARCH_CX');
export const GOOGLE_GEMINI_KEY = getEnv('GOOGLE_GEMINI_KEY');
export const GEMINI_MODEL = getEnv('GEMINI_MODEL') || 'gemini-2.5-pro';
export const SERPER_API_KEY = getEnv('SERPER_API_KEY');

export const SUPABASE_URL = getEnv('NEXT_PUBLIC_SUPABASE_URL') || getEnv('SUPABASE_URL');
export const SUPABASE_ANON_KEY = getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
export const SUPABASE_SERVICE_ROLE_KEY = getEnv('SUPABASE_SERVICE_ROLE_KEY');

export const PORT = parseInt(process.env.PORT || '3001', 10);

const maskKey = (key: string) => key ? `${key.slice(0, 4)}...${key.slice(-4)}` : 'MISSING';

console.log('--- Env Debug ---');
console.log('SUPABASE_URL:', SUPABASE_URL || 'MISSING');
console.log('SUPABASE_ANON_KEY:', maskKey(SUPABASE_ANON_KEY), `(len: ${SUPABASE_ANON_KEY.length})`);
console.log('SUPABASE_SERVICE_ROLE_KEY:', maskKey(SUPABASE_SERVICE_ROLE_KEY), `(len: ${SUPABASE_SERVICE_ROLE_KEY.length})`);
console.log('AI STACK:', OPENAI_API_KEY ? 'OpenAI (Primary)' : (GOOGLE_GEMINI_KEY ? `Google ${GEMINI_MODEL} (Fallback)` : 'MISSING'));
console.log('SEARCH STACK:', SERPER_API_KEY ? 'Serper.dev (Primary)' : (OPENAI_API_KEY ? 'OpenAI Search' : (GOOGLE_SEARCH_API_KEY ? 'Google Custom Search' : 'MISSING')));
console.log('-----------------');
