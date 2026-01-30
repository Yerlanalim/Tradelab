import { GPT5_MINI_PRICING } from './config.js';

type OpenAIResponse = Record<string, unknown>;

export const calculateCost = (model: string, usage: any) => {
  if (!usage) return 0;
  
  const pricing = GPT5_MINI_PRICING;
  
  let promptTokens = usage.prompt_tokens || 0;
  let completionTokens = usage.completion_tokens || 0;
  const totalTokens = usage.total_tokens || 0;

  // Fallback: if breakdown is missing but total is present
  if (totalTokens > 0 && promptTokens === 0 && completionTokens === 0) {
    promptTokens = totalTokens;
  }
  
  const cachedTokens = usage.prompt_tokens_details?.cached_tokens || 0;
  const nonCachedInput = Math.max(0, promptTokens - cachedTokens);
  
  const cost = (
    (nonCachedInput * pricing.input) / 1000000 +
    (cachedTokens * pricing.cached_input) / 1000000 +
    (completionTokens * pricing.output) / 1000000
  );
  
  return cost;
};

export const createOpenAIClient = (apiKey?: string) => {
  const runOpenAI = async (payload: Record<string, unknown>, onPartialContent?: (content: string) => void): Promise<OpenAIResponse> => {
    if (!apiKey) {
      throw new Error('OpenAI API key not provided. Please configure OPENAI_API_KEY or use Google fallback.');
    }

    const model = typeof payload.model === 'string' ? payload.model : 'gpt-5-mini';
    
    const runOnce = async (requestModel: string): Promise<OpenAIResponse> => {
      const endpoint = 'https://api.openai.com/v1/responses';
      
      let apiInput = payload.input;
      if (!apiInput && Array.isArray(payload.messages)) {
        apiInput = payload.messages[payload.messages.length - 1]?.content;
      }

      const normalizeInput = (input: any) => {
        const messages = Array.isArray(input) ? input : [{ role: "user", content: String(input || "") }];
        return messages.map(msg => ({
          role: msg.role || "user",
          content: Array.isArray(msg.content) ? msg.content : [{ type: "input_text", text: String(msg.content || "") }]
        }));
      };

      const requestBody: Record<string, unknown> = {
        model: requestModel,
        input: normalizeInput(apiInput || payload.messages),
        tools: payload.tools,
        tool_choice: payload.tool_choice,
        stream: !!onPartialContent,
      };

      console.log(`[OpenAI Request] Model: ${requestModel}, Endpoint: ${endpoint}`);
      // Раскомментируйте ниже, чтобы увидеть полный JSON запроса в консоли
      // console.log(`[OpenAI Payload] ${JSON.stringify(requestBody, null, 2)}`);

      if (payload.response_format) {
        const rf = payload.response_format as any;
        if (rf.type === 'json_object') {
          requestBody.text = { format: { type: 'json_object' } };
        }
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 180000);

      let accumulatedContent = '';
      let usage: any = null;

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`OpenAI Error: ${response.status} ${errorText}`);
        }

        console.log(`[OpenAI] Status: ${response.status}`);

        if (onPartialContent && response.body) {
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');
            
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || trimmed === 'data: [DONE]') continue;
              
              if (trimmed.startsWith('data: ')) {
                try {
                  const rawJson = trimmed.slice(6);
                  const parsed = JSON.parse(rawJson);
                  const type = parsed.type || "unknown";
                  
                  // LOG EVERY TYPE FOR DEBUGGING
                  console.log(`  [SSE CHUNK] ${type}`);
                  
                  if (type === 'error' || type === 'response.failed') {
                      console.log("  🛑 ERROR DETAILS:", JSON.stringify(parsed, null, 2));
                      const errCode = parsed.error?.code || parsed.response?.error?.code || "unknown";
                      const errMsg = parsed.error?.message || parsed.response?.error?.message || "Stream failed";
                      throw new Error(`OPENAI_API_ERROR: ${errCode} - ${errMsg}`);
                  }

                  if (parsed.usage) {
                    usage = parsed.usage;
                  } else if (parsed.response?.usage) {
                    usage = parsed.response.usage;
                  }

                  let snatchedText = "";
                  
                  // 1. Standard text deltas
                  if (type.endsWith('output_text.delta') && typeof parsed.delta === 'string') {
                    snatchedText += parsed.delta;
                  }

                  // 2. AGGRESSIVE SNIFFING
                  const rawString = JSON.stringify(parsed);
                  const urlMatches = rawString.match(/https?:\/\/[^\s"'>\\]+/gi);
                  if (urlMatches) {
                    const cleaned = urlMatches.map(u => u.replace(/\\/g, "").replace(/[).,;]+$/, ""));
                    snatchedText += "\n" + cleaned.join("\n") + "\n";
                  }
                  
                  if (snatchedText) {
                    accumulatedContent += snatchedText;
                    onPartialContent(accumulatedContent);
                  }
                } catch (e) { /* partial chunk */ }
              }
            }
          }

          return { 
            output_text: accumulatedContent,
            choices: [{ message: { content: accumulatedContent } }],
            usage: usage
          } as OpenAIResponse;
        } else {
          const data = await response.json();
          usage = data.usage;
          if (data.output?.[0]?.content?.[0]?.text) {
            (data as any).output_text = data.output[0].content[0].text;
          }
          return data as OpenAIResponse;
        }
      } finally {
        if (usage) {
          const totalTokens = usage.total_tokens || ((usage.prompt_tokens || 0) + (usage.completion_tokens || 0));
          const cost = calculateCost(requestModel, usage);
          console.log(`[OpenAI Usage] Total Tokens: ${totalTokens}, Cost: $${cost.toFixed(6)}`);
        }
        clearTimeout(timeoutId);
      }
    };

    try {
      return await runOnce(model);
    } catch (error: any) {
      if (error.name === 'AbortError') console.warn('[OpenAI] Timeout 180s hit. Sniffed content returned.');
      throw error;
    }
  };

  return { runOpenAI };
};
