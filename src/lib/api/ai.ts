import { supabaseClient } from "@/lib/supabase/client";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type SuggestedChip = {
  id: string;
  label: string;
  action: "redirect" | "insert" | "confirm";
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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

const getAccessToken = async () => {
  const { data: sessionData } = await supabaseClient.auth.getSession();
  return sessionData.session?.access_token ?? null;
};

const refreshAccessToken = async () => {
  const { data } = await supabaseClient.auth.refreshSession();
  return data.session?.access_token ?? null;
};

const invokeChatHandler = async (
  token: string,
  payload: { page_context: string; session_id?: string; messages: ChatMessage[]; context?: unknown }
) => {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase env is not configured");
  }
  const response = await fetch(`${supabaseUrl}/functions/v1/chat_handler`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (response.status === 504) {
    return {
      ok: true,
      message: "Сервер не успел ответить (Timeout). Попробуйте упростить запрос или повторить позже.",
    };
  }

  const data = (await response.json().catch(() => null)) as ChatResponse | null;
  if (!response.ok) {
    const error = new Error(data?.message ?? "Edge Function returned a non-2xx status code");
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  return data ?? { ok: false };
};

export async function sendChatMessage({ pageContext, messages, sessionId, context }: ChatRequest) {
  let accessToken = await getAccessToken();
  if (!accessToken) {
    accessToken = await refreshAccessToken();
  }
  if (!accessToken) {
    throw new Error("User is not authenticated");
  }

  const payload = {
    page_context: pageContext,
    session_id: sessionId,
    messages,
    context,
  };

  try {
    return (await invokeChatHandler(accessToken, payload)) as ChatResponse;
  } catch (error) {
    const status = (error as { status?: number }).status ?? null;
    const message = error instanceof Error ? error.message : "";
    if (status === 401 || message.includes("Invalid JWT")) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        try {
          return (await invokeChatHandler(refreshed, payload)) as ChatResponse;
        } catch {
          await supabaseClient.auth.signOut();
          throw new Error("Session expired. Please sign in again.");
        }
      }
      await supabaseClient.auth.signOut();
      throw new Error("Session expired. Please sign in again.");
    }
    throw error;
  }
}

