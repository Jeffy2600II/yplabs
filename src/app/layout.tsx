"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function CouncilLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  
  useEffect(() => {
    let mounted = true;
    async function check() {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!mounted) return;
      if (!session) {
        router.replace("/council-hub/login");
        return;
      }
      // TODO: optionally verify in council_users table approved/disabled/year
      setChecking(false);
    }
    check();
    
    // subscribe to auth changes (optional)
    const { data: sub } = supabase.auth.onAuthStateChange((_event, _session) => {
      // if logged out -> redirect
      if (!_session) {
        router.replace("/council-hub/login");
      }
    });
    
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [router]);
  
  if (checking) {
    return <div style={{ padding: 24 }}>กำลังตรวจสอบการเข้าสู่ระบบ…</div>;
  }
  
  return <>{children}</>;
}