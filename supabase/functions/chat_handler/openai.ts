type OpenAIResponse = Record<string, unknown>;

export const createOpenAIClient = (apiKey: string) => {
  const runOpenAI = async (payload: Record<string, unknown>): Promise<OpenAIResponse> => {
    

    const requestBody: Record<string, unknown> = {
      model: payload.model,
      input: payload.input,
      tools: payload.tools,
      tool_choice: payload.tool_choice
    };

    if (!payload.tools || (Array.isArray(payload.tools) && payload.tools.length === 0)) {
      requestBody.response_format = { type: "json_object" };
    }


    const controller = new AbortController();
    // Ставим 45 секунд (Edge Function живет 60 сек, нам нужно успеть ответить)
    const timeoutId = setTimeout(() => controller.abort(), 45000); 

    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal, 
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("OpenAI error", response.status, errorText);
        throw new Error(`AI service unavailable: ${response.status} ${errorText}`);
      }

      return await response.json();
    } catch (error: unknown) {
    
       if (error instanceof Error && error.name === 'AbortError') {
          console.error("OpenAI Timeout: Request took longer than 45s");
          throw new Error("AI Timeout: Model took too long to respond");
       }
       throw error;
    } finally {
      clearTimeout(timeoutId); 
    }
  };

  return { runOpenAI };
};