import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

const supabaseKey = supabaseServiceRoleKey || supabaseAnonKey;

type SupabaseCookie = {
  name: string;
  value: string;
  options: Record<string, unknown>;
};

function requireSupabaseEnv(name: string, value: string) {
  if (!value) {
    throw new Error(`Missing ${name}. Set this environment variable in your server environment.`);
  }
  return value;
}

export function getServerSupabase(req: NextRequest, res: NextResponse) {
  return createServerClient(requireSupabaseEnv("NEXT_PUBLIC_SUPABASE_URL", supabaseUrl), requireSupabaseEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY", supabaseKey), {
    cookies: {
      getAll: async () =>
        req.cookies.getAll().map((cookie) => ({ name: cookie.name, value: cookie.value })),
      setAll: async (cookies: SupabaseCookie[], headers: Record<string, string>) => {
        cookies.forEach(({ name, value, options }) => {
          res.cookies.set(name, value, options as Record<string, string | number | boolean>);
        });
        Object.entries(headers).forEach(([key, value]) => {
          res.headers.set(key, value);
        });
      },
    },
  });
}
