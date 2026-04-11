import { supabaseMiddleware } from "./utils/supabase/middleware";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  return supabaseMiddleware(request);
}
