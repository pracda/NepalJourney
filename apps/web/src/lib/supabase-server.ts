/**
 * Server-side Supabase client for Next.js App Router Server Components.
 *
 * Uses @supabase/ssr to read/write cookies via Next.js `cookies()` so the
 * session is preserved across requests without client-side JavaScript.
 *
 * Why a separate file from supabase.ts:
 *   The browser client (supabase.ts) uses the anon key and runs on the client.
 *   This client also uses the anon key but runs on the server — it reads the
 *   session JWT from cookies and attaches it to PostgREST calls so RLS resolves
 *   `auth.uid()` correctly.
 *
 *   For admin mutations (approve/reject guide, read audit log) we call the
 *   FastAPI /admin/* endpoints with the admin JWT rather than hitting Supabase
 *   directly, so the role-check logic stays in one place (routers/admin.py).
 *
 * Usage (Server Component):
 *   const { supabase, session } = await createServerClient();
 *   if (!session) redirect("/login");
 *   const token = session.access_token;
 */

import { createServerClient as _createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Session } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function createServerClient() {
  const cookieStore = await cookies();

  const supabase = _createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        // Server Components cannot set cookies directly; Route Handlers and
        // Server Actions can. In read-only server components this is a no-op,
        // but the interface is required by @supabase/ssr.
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Intentionally swallowed — expected to throw in read-only contexts.
        }
      },
    },
  });

  const {
    data: { session },
  } = await supabase.auth.getSession();

  return { supabase, session: session as Session | null };
}

/**
 * Convenience: get just the access token (throws if not logged in).
 * Use in Server Components that should only render for authenticated admins.
 */
export async function requireAdminToken(): Promise<string> {
  const { session } = await createServerClient();
  if (!session) {
    // Dynamic import avoids bundling next/navigation into non-Next.js contexts
    const { redirect } = await import("next/navigation");
    redirect("/login");
  }
  return session.access_token;
}
