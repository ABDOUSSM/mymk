import { supabase } from "./client";

type UserRole = "owner" | "admin" | "user";

type UserProfile = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: UserRole;
};

export async function getCurrentUserProfile(): Promise<{ user: { id: string; email: string | null } | null; profile: UserProfile | null; error: string | null }> {
  if (!supabase) {
    return { user: null, profile: null, error: "Supabase client is not initialized." };
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getUser();
  if (sessionError || !sessionData?.user) {
    return { user: null, profile: null, error: sessionError?.message ?? "Unable to get authenticated user." };
  }

  const authUser = sessionData.user;
  const { data: profileData, error: profileError } = await supabase
    .from("users")
    .select("id,email,full_name,role")
    .eq("id", authUser.id)
    .single();

  if (profileError) {
    return {
      user: { id: authUser.id, email: authUser.email ?? null },
      profile: null,
      error: profileError.message
    };
  }

  return {
    user: { id: authUser.id, email: authUser.email ?? null },
    profile: profileData,
    error: null
  };
}

export async function ensureCurrentUserProfile(): Promise<{ profile: UserProfile | null; error: string | null }> {
  if (!supabase) {
    return { profile: null, error: "Supabase client is not initialized." };
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getUser();
  if (sessionError || !sessionData?.user) {
    return { profile: null, error: sessionError?.message ?? "Unable to get authenticated user." };
  }

  const authUser = sessionData.user;
  const { data: profileData, error: profileError } = await supabase
    .from("users")
    .select("id,email,full_name,role")
    .eq("id", authUser.id)
    .single();

  if (profileError && profileError.code === "PGRST116") {
    return {
      profile: null,
      error: "User profile not found. Please refresh the page or sign in again."
    };
  }

  return { profile: profileData, error: profileError?.message ?? null };
}
