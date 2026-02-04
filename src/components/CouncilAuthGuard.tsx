'use client';

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserSupabase } from "@/lib/supabaseClient";

/**
 * CouncilAuthGuard
 * - Redirects to /council-hub/login if not authenticated or not approved.
 * - Use at top of Council pages (e.g., in /council-hub/page.tsx).
 */
export default function CouncilAuthGuard() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const supabase = getBrowserSupabase();
        const { data, error } = await supabase.auth.getUser();
        if (error || !data.user) {
          if (mounted) router.replace("/council-hub/login");
          return;
        }
        const userId = data.user.id;
        const { data: row, error: qerr } = await supabase
          .from("council_users")
          .select("*")
          .eq("auth_uid", userId)
          .limit(1)
          .maybeSingle();
        
        if (qerr || !row || !row.approved || row.disabled) {
          if (mounted) router.replace("/council-hub/login");
          return;
        }
        
        // OK: user approved
      } catch {
        if (mounted) router.replace("/council-hub/login");
      } finally {
        if (mounted) setChecking(false);
      }
    })();
    
    return () => { mounted = false; };
  }, [router]);
  
  // while checking, render nothing (or a loader)
  if (checking) return null;
  return null;
}