import { NextResponse, type NextRequest } from "next/server";
import { getServerSupabase } from "./server";

export async function supabaseMiddleware(request: NextRequest) {
  const response = NextResponse.next();
  const supabase = getServerSupabase(request, response);

  try {
    await supabase.auth.getSession();
  } catch (error) {
    // Keep middleware lightweight; session errors should be handled in your app.
    console.warn("Supabase middleware session check failed:", error);
  }

  return response;
}
