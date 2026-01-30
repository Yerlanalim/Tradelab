import express, { Request, Response } from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import { OPENAI_API_KEY, P3_SEARCH_MODEL, P3_BASE_MODEL, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, PORT } from './config.js';
import { createOpenAIClient } from './openai.js';
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
    // Validate API keys
    if (!OPENAI_API_KEY) {
      return res.status(500).json({ ok: false, message: 'Missing OPENAI_API_KEY' });
    }
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
      return res.status(500).json({ ok: false, message: 'Missing Supabase configuration' });
    }

    // Create Supabase clients
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    
    // We'll use the admin client for DB and the anon key for token verification if needed
    // Actually, passing them to chatHandler is cleaner
    const { runOpenAI } = createOpenAIClient(OPENAI_API_KEY);

    const result = await chatHandler(req.body, req.headers.authorization || '', supabaseAdmin, runOpenAI, SUPABASE_URL, SUPABASE_ANON_KEY);
    
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
