import { createBrowserClient } from '@supabase/ssr';

// Single shared client instance (avoids creating a new connection every time)
let browserClient = null;

export function createClient() {
  if (browserClient) return browserClient;

  browserClient = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  return browserClient;
}
