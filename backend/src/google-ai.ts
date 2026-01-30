import { GoogleGenerativeAI } from '@google/generative-ai';
import { GOOGLE_GEMINI_KEY, GEMINI_MODEL } from './config.js';

export const createGoogleAIClient = (apiKey?: string) => {
  const key = apiKey || GOOGLE_GEMINI_KEY;
  
  const runGemini = async (prompt: string, responseFormat?: { type: string }): Promise<any> => {
    if (!key) {
      throw new Error('Google Gemini API key not provided');
    }

    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ 
      model: GEMINI_MODEL,
      generationConfig: responseFormat?.type === 'json_object' 
        ? { responseMimeType: 'application/json' }
        : undefined
    });

    console.log(`[Gemini Request] Model: ${GEMINI_MODEL}`);
    
    try {
      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response.text();
      
      return {
        output_text: text,
        choices: [{ message: { content: text } }],
        usage: {
          prompt_tokens: Math.ceil(prompt.length / 4),
          completion_tokens: Math.ceil(text.length / 4),
          total_tokens: Math.ceil((prompt.length + text.length) / 4)
        }
      };
    } catch (error: any) {
      console.error('[Gemini Error]:', error.message);
      throw error;
    }
  };

  const runGeminiSearch = async (query: string): Promise<any> => {
    if (!key) throw new Error('Google Gemini API key not provided');

    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ 
      model: GEMINI_MODEL,
      tools: [
        {
          // @ts-ignore
          googleSearch: {},
        },
      ] as any,
    });

    const prompt = `SEARCH REQUEST: Find direct product listing URLs for "${query}" on Alibaba.com and Made-in-China.com.
    
    INSTRUCTIONS:
    1. Perform a Google search for the product.
    2. Identify URLs that lead to SPECIFIC product pages (usually contain /product-detail/ or a long numeric ID).
    3. Return ONLY the list of URLs. No extra text.
    4. If no specific product pages are found, list the closest relevant Alibaba showroom or product URLs.`;

    console.log(`[Gemini Search] Searching with Grounding for: ${query}`);
    
    try {
      const result = await model.generateContent(prompt);
      const response = result.response;
      let text = response.text();
      
      const metadata = (response as any).candidates?.[0]?.groundingMetadata;
      const links: string[] = [];

      // 1. Извлекаем ссылки из чанков (если есть)
      if (metadata?.groundingChunks) {
        metadata.groundingChunks.forEach((chunk: any) => {
          if (chunk.web?.url) links.push(chunk.web.url);
        });
      }

      // 2. Извлекаем из текста (Fallback)
      const textLinks = text.match(/https?:\/\/(?:www\.)?(?:alibaba\.com|made-in-china\.com)\/[^\s)\]>"']+/gi) || [];
      links.push(...textLinks);

      // Фильтруем мусор и главные страницы
      const uniqueLinks = Array.from(new Set(links)).filter(l => {
        const isHome = l.endsWith('.com') || l.endsWith('.com/') || l.includes('/index.html');
        return !isHome;
      });

      console.log(`[Gemini Search Debug] Extracted ${uniqueLinks.length} unique raw links.`);
      
      return {
        output_text: uniqueLinks.length > 0 ? uniqueLinks.join('\n') : "NO_RESULTS_FOUND",
        usage: {
          total_tokens: Math.ceil((prompt.length + text.length) / 4)
        }
      };
    } catch (error: any) {
      console.error('[Gemini Search Error]:', error.message);
      throw error;
    }
  };

  return { runGemini, runGeminiSearch };
};
