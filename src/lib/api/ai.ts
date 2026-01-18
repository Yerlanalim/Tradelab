import { supabaseClient } from "@/lib/supabase/client";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export async function sendChatMessage(section: string, messages: ChatMessage[]) {
  const { data: sessionData } = await supabaseClient.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    throw new Error("User is not authenticated");
  }

  const { data, error } = await supabaseClient.functions.invoke("ai_orchestrator", {
    body: { section, messages },
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  return data as { ok: boolean; message?: string };
}
