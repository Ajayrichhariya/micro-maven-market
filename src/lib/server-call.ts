import { supabase } from "@/integrations/supabase/client";

type ServerFn<TData, TResult> = (opts: { data: TData }) => Promise<TResult>;

/**
 * Calls a server function and, if the request is rejected because the access
 * token is missing/stale/expired, refreshes the session once and retries.
 */
export async function callWithAuth<TData, TResult>(
  fn: ServerFn<TData, TResult>,
  data: TData,
): Promise<TResult> {
  try {
    return await fn({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/unauthorized|invalid token|jwt|expired/i.test(message)) throw error;

    const { data: refreshed } = await supabase.auth.refreshSession();
    if (!refreshed.session) {
      throw new Error("Your session expired. Please sign in again.");
    }
    return await fn({ data });
  }
}
