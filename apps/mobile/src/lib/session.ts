import { supabase } from "./supabase";
import { saveToken, clearToken } from "@/api/client";

export async function signUpWithEmail(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      data: { role: "tourist" },
      shouldCreateUser: true,
    },
  });
  if (error) throw new Error(error.message);
}

export async function verifyOtp(email: string, token: string): Promise<void> {
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });
  if (error) throw new Error(error.message);
  if (data.session?.access_token) {
    await saveToken(data.session.access_token);
  }
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
  await clearToken();
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}
