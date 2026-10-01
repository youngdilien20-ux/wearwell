import { createClient } from "@supabase/supabase-js";

const runtimeEnv = typeof import.meta.env === "object" && import.meta.env ? import.meta.env : {};
const supabaseUrl = runtimeEnv.VITE_SUPABASE_URL;
const supabasePublishableKey = runtimeEnv.VITE_SUPABASE_PUBLISHABLE_KEY;

export const cloudEnabled = Boolean(supabaseUrl && supabasePublishableKey);

export const supabase = cloudEnabled
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;