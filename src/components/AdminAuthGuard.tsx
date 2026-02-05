'use client';

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserSupabase } from "@/lib/supabaseClient";

/**
 * AdminAuthGuard - จะเปลี่ยนเส้นทางถ้าไม่ใช่ admin
 */
export default function AdminAuthGuard({ children }: { children ? : React.ReactNode }) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const supabase = getBrowserSupabase();
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData?.session?.user) {
          if (mounted) router.replace("/council-hub/login");
          return;
        }
        const userId = sessionData.session.user.id;
        const { data: row, error } = await supabase
          .from("council_users")
          .select("role,approved,disabled")
          .eq("auth_uid", userId)
          .limit(1)
          .maybeSingle();
        if (error || !row) { if (mounted) router.replace("/council-hub/login"); return; }
        if (row.role !== "admin" || !row.approved || row.disabled) { if (mounted) router.replace("/council-hub/login"); return; }
      } catch {
        if (mounted) router.replace("/council-hub/login");
        return;
      } finally {
        if (mounted) setChecking(false);
      }
    })();
    return () => { mounted = false; };
  }, [router]);
  
  // ขณะกำลังตรวจสอบสิทธิ์ ให้แสดงข้อความเล็ก ๆ เป็นภาษาไทย
  if (checking) {
    return (
      <div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:120}}>
        <div style={{textAlign:'center',color:'#374151'}}>
          <div style={{width:36,height:36,margin:'0 auto 10px',borderRadius:18,border:'4px solid #e6e9ef',borderTopColor:'#2563eb',animation:'spin 1s linear infinite'}} />
          <div>กำลังตรวจสอบสิทธิ์ผู้ดูแลระบบ...</div>
        </div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }
  
  return <>{children}</>;
}