import { supabaseClient } from "@/lib/supabase/client";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type SuggestedChip = {
  id: string;
  label: string;
  action: "redirect" | "insert";
  payload: string;
};

export type ToolCall = {
  name: string;
  args?: Record<string, unknown>;
  result?: Record<string, unknown> | null;
};

export type ChatResponse = {
  ok: boolean;
  message?: string;
  response?: string;
  suggested_chips?: SuggestedChip[];
  ui_hints?: Record<string, unknown>;
  mode?: string;
  tool_calls?: ToolCall[];
  entities?: Record<string, unknown> | null;
  summary?: string | null;
};

type ChatRequest = {
  pageContext: string;
  messages: ChatMessage[];
  sessionId?: string;
  context?: unknown;
};

export async function sendChatMessage({ pageContext, messages, sessionId, context }: ChatRequest) {
  const { data: sessionData } = await supabaseClient.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    throw new Error("User is not authenticated");
  }

  const { data, error } = await supabaseClient.functions.invoke("chat_handler", {
    body: {
      page_context: pageContext,
      session_id: sessionId,
      messages,
      context,
    },
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  return data as ChatResponse;
}

export async function generateRfq(query: string) {
  const content = `Сформируй RFQ для поставщика. Товар и требования: ${query}. ` +
    "Ответь коротким готовым письмом на английском, без лишних пояснений.";
  return sendChatMessage({
    pageContext: "/products/supplier-search",
    messages: [{ role: "user", content }],
  });
}
