import express, { Request, Response } from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import { 
  OPENAI_API_KEY, P3_SEARCH_MODEL, P3_BASE_MODEL, 
  SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, 
  PORT,
  GOOGLE_SEARCH_API_KEY, GOOGLE_SEARCH_CX, GOOGLE_GEMINI_KEY, GEMINI_MODEL, SERPER_API_KEY
} from './config.js';
import { createOpenAIClient } from './openai.js';
import { createGoogleAIClient } from './google-ai.js';
import { chatHandler } from './chat-handler.js';

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health check endpoint
app.get('/health', async (req: Request, res: Response) => {
  let supabaseStatus = 'unknown';
  try {
    const resp = await fetch(`${SUPABASE_URL}/auth/v1/settings`, {
      headers: { 'apikey': SUPABASE_ANON_KEY }
    });
    supabaseStatus = resp.ok ? 'ok' : `error: ${resp.status} ${resp.statusText}`;
  } catch (e: any) {
    supabaseStatus = `failed: ${e.message}`;
  }
  res.json({ status: 'ok', supabase: supabaseStatus, timestamp: new Date().toISOString() });
});

// Chat handler endpoint
app.post('/chat', async (req: Request, res: Response) => {
  try {
    // Validate API keys - require either OpenAI OR Google stack
    const hasOpenAI = !!OPENAI_API_KEY;
    const hasGoogleSearch = !!(GOOGLE_SEARCH_API_KEY && GOOGLE_SEARCH_CX);
    const hasGemini = !!GOOGLE_GEMINI_KEY;
    
    if (!hasOpenAI && !hasGoogleSearch && !hasGemini) {
      return res.status(500).json({ 
        ok: false, 
        message: 'Missing API keys: Configure either OPENAI_API_KEY, (GOOGLE_SEARCH_API_KEY + GOOGLE_SEARCH_CX), or GOOGLE_GEMINI_KEY' 
      });
    }
    
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
      return res.status(500).json({ ok: false, message: 'Missing Supabase configuration' });
    }

    // Create Supabase clients
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    
    // Create AI clients
    const { runOpenAI } = createOpenAIClient(OPENAI_API_KEY);
    const { runGemini, runGeminiSearch, runSerperSearch } = createGoogleAIClient(GOOGLE_GEMINI_KEY);

    const result = await chatHandler(
      req.body, 
      req.headers.authorization || '', 
      supabaseAdmin, 
      runOpenAI,
      runGemini,
      runGeminiSearch,
      runSerperSearch,
      SUPABASE_URL, 
      SUPABASE_ANON_KEY,
      {
        hasOpenAI,
        hasSerper: !!SERPER_API_KEY,
        hasGoogleSearch,
        hasGemini,
        googleSearchKey: GOOGLE_SEARCH_API_KEY,
        googleSearchCx: GOOGLE_SEARCH_CX,
        geminiModel: GEMINI_MODEL
      }
    );
    
    res.status(result.status || 200).json(result.body);
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ 
      ok: false, 
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 TradeLab Backend running on http://localhost:${PORT}`);
  console.log(`🔗 Supabase URL: ${SUPABASE_URL || 'MISSING'}`);
  console.log(`🔑 Service Role Key: ${SUPABASE_SERVICE_ROLE_KEY ? 'CONFIGURED' : 'MISSING'}`);
});
