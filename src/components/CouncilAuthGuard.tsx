'use client';

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserSupabase } from "@/lib/supabaseClient";

/**
 * CouncilAuthGuard
 * - เปลี่ยนให้รับ children และแสดงหน้าเมื่อผ่านการตรวจสอบ
 * - หากยังไม่ผ่านหรือไม่อนุญาต จะเปลี่ยนเส้นทางไป /council-hub/login
 */
export default function CouncilAuthGuard({ children }: { children ? : React.ReactNode }) {
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
        
        // ผ่านการอนุมัติ — สามารถแสดง children ได้
      } catch {
        if (mounted) router.replace("/council-hub/login");
      } finally {
        if (mounted) setChecking(false);
      }
    })();
    
    return () => { mounted = false; };
  }, [router]);
  
  // ขณะตรวจสอบ แสดงข้อความภาษาไทย
  if (checking) {
    return (
      <div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:120}}>
        <div style={{textAlign:'center',color:'#374151'}}>
          <div style={{width:36,height:36,margin:'0 auto 10px',borderRadius:18,border:'4px solid #e6e9ef',borderTopColor:'#2563eb',animation:'spin 1s linear infinite'}} />
          <div>กำลังตรวจสอบสิทธิ์สมาชิกสภานักเรียน...</div>
        </div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }
  
  return <>{children}</>;
}