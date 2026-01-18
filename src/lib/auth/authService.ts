import type { Provider } from "@supabase/supabase-js";

import { supabaseClient } from "@/lib/supabase/client";

export type AuthResult = {
  ok: boolean;
  error?: string;
};

export async function signInWithEmail(
  email: string,
  password: string
): Promise<AuthResult> {
  const { error } = await supabaseClient.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

export async function signUpWithEmail(
  email: string,
  password: string
): Promise<AuthResult> {
  const { error } = await supabaseClient.auth.signUp({
    email,
    password,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

export async function signInWithProvider(provider: Provider): Promise<AuthResult> {
  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

export async function signOut(): Promise<AuthResult> {
  const { error } = await supabaseClient.auth.signOut();

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

export async function requestPasswordReset(
  email: string
): Promise<AuthResult> {
  const { error } = await supabaseClient.auth.resetPasswordForEmail(email);

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}
