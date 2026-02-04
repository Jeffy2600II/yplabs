'use client';

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserSupabase } from "@/lib/supabaseClient";

/**
 * AdminAuthGuard
 * - Redirect to /council-hub/login if not authenticated or not admin.
 * - Use this at top of admin pages.
 */
export default function AdminAuthGuard({ children }: { children ? : React.ReactNode }) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const supabase = getBrowserSupabase();
        const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
        if (sessionErr || !sessionData?.session?.user) {
          if (mounted) router.replace("/council-hub/login");
          return;
        }
        const userId = sessionData.session.user.id;
        
        const { data: row, error: qerr } = await supabase
          .from("council_users")
          .select("role,approved,disabled")
          .eq("auth_uid", userId)
          .limit(1)
          .maybeSingle();
        
        if (qerr || !row) {
          if (mounted) router.replace("/council-hub/login");
          return;
        }
        if (row.role !== "admin" || !row.approved || row.disabled) {
          if (mounted) router.replace("/council-hub/login");
          return;
        }
      } catch (e) {
        if (mounted) router.replace("/council-hub/login");
        return;
      } finally {
        if (mounted) setChecking(false);
      }
    })();
    return () => { mounted = false; };
  }, [router]);
  
  if (checking) return null; // or a small loader
  return <>{children}</>;
}