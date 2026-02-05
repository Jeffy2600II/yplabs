'use client';

import { useEffect, useState } from "react";
import AdminAuthGuard from "@/components/AdminAuthGuard";
import { getBrowserSupabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function AdminUsersNewPage() {
  const [years, setYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [mode, setMode] = useState<'single'|'bulk'>('bulk');
  const [bulkText, setBulkText] = useState<string>("");
  const [singleRows, setSingleRows] = useState<any[]>([{ full_name: "", student_id: "", account_type: "student", email: "", password: "" }]);
  const [processing, setProcessing] = useState(false);
  const router = useRouter();

  useEffect(() => { void loadYears(); }, []);

  async function getToken() {
    const supabase = getBrowserSupabase();
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token ?? null;
  }

  async function loadYears() {
    const token = await getToken();
    const res = await fetch("/api/admin/years", { headers: { Authorization: `Bearer ${token}` } });
    const json = await res.json();
    if (!res.ok) { alert(json?.error || "Failed to load years"); return; }
    setYears((json ?? []).map((r:any)=>r.year));
    if (json?.length) setSelectedYear(json[0].year);
  }

  function addRow() { setSingleRows([...singleRows, { full_name: "", student_id: "", account_type: "student", email: "", password: "" }]); }
  function removeRow(i:number){ setSingleRows(singleRows.filter((_,idx)=>idx!==i)); }
  function updateRow(i:number, key:string, value:any){ const copy = [...singleRows]; copy[i][key]=value; setSingleRows(copy); }

  async function submit() {
    if (!selectedYear) { alert("กรุณาเลือกปี"); return; }
    setProcessing(true);
    try {
      const token = await getToken();
      let usersPayload: any[] = [];
      if (mode === 'bulk') {
        // each line: full_name,student_id?,email?,account_type?,password?
        const lines = bulkText.split("\n").map(l=>l.trim()).filter(Boolean);
        for (const ln of lines) {
          const parts = ln.split(",").map(p=>p.trim());
          // try to parse: full_name, student_id, account_type, email, password (flexible)
          const [full_name, student_idOrEmail, maybeTypeOrEmail, maybeEmailOrPw, maybePw] = parts;
          let account_type = "student";
          let student_id = null;
          let email = null;
          let password = null;
          if (!full_name) continue;
          if (maybeTypeOrEmail && (maybeTypeOrEmail === "student" || maybeTypeOrEmail === "teacher")) {
            account_type = maybeTypeOrEmail;
          }
          // heuristics:
          if (account_type === "student") {
            student_id = student_idOrEmail ?? "";
          } else {
            // teacher: expect email in second column
            email = student_idOrEmail ?? "";
            password = maybeEmailOrPw ?? "";
          }
          usersPayload.push({ full_name, student_id, email, account_type, year: selectedYear });
        }
      } else {
        usersPayload = singleRows.map(r => ({ ...r, year: selectedYear }));
      }

      const res = await fetch("/api/admin/users/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ users: usersPayload }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Bulk create failed");
      const results = json.results ?? [];
      const successCount = results.filter((r:any)=>r.success).length;
      alert(`สร้างเสร็จ: สำเร็จ ${successCount} / ${results.length}`);
      router.push("/admin/users");
    } catch (err:any) {
      console.error(err);
      alert(err?.message ?? "Bulk create error");
    } finally {
      setProcessing(false);
    }
  }

  return (
    <>
      <AdminAuthGuard />
      <main style={{ padding: 24 }}>
        <h1>เพิ่มบัญชี (Create Accounts)</h1>

        <div style={{ marginTop: 12 }}>
          <label>เลือกปี: 
            <select value={selectedYear ?? ""} onChange={(e) => setSelectedYear(Number(e.target.value))}>
              <option value="">-- เลือกปี --</option>
              {years.map(y=> <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
        </div>

        <div style={{ marginTop: 12 }}>
          <label>
            <input type="radio" checked={mode==='bulk'} onChange={()=>setMode('bulk')} /> Bulk (paste lines)
          </label>
          <label style={{ marginLeft: 12 }}>
            <input type="radio" checked={mode==='single'} onChange={()=>setMode('single')} /> Single / multiple rows
          </label>
        </div>

        {mode === 'bulk' ? (
          <div style={{ marginTop: 12 }}>
            <p>รูปแบบบรรทัด: full_name,student_id (for student)  หรือ full_name,email,teacher,password (for teacher)</p>
            <textarea value={bulkText} onChange={(e)=>setBulkText(e.target.value)} rows={10} style={{ width: "100%" }} placeholder="นนทกร นนท์สุราช,12345"></textarea>
          </div>
        ) : (
          <div style={{ marginTop: 12 }}>
            {singleRows.map((r,i)=>(
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 160px 120px 160px 80px", gap: 8, marginBottom: 8 }}>
                <input placeholder="ชื่อเต็ม" value={r.full_name} onChange={(e)=>updateRow(i,"full_name",e.target.value)} />
                <input placeholder="รหัสนักเรียน (student_id)" value={r.student_id} onChange={(e)=>updateRow(i,"student_id",e.target.value)} />
                <select value={r.account_type} onChange={(e)=>updateRow(i,"account_type",e.target.value)}>
                  <option value="student">Student</option>
                  <option value="teacher">Teacher</option>
                  <option value="other">Other</option>
                </select>
                <input placeholder="email (for teacher)" value={r.email} onChange={(e)=>updateRow(i,"email",e.target.value)} />
                <div>
                  <button onClick={()=>removeRow(i)}>ลบ</button>
                </div>
              </div>
            ))}
            <div><button onClick={addRow}>เพิ่มแถว</button></div>
          </div>
        )}

        <div style={{ marginTop: 18 }}>
          <button disabled={processing} onClick={submit}>{processing ? "กำลังสร้าง..." : "สร้างบัญชี"}</button>
          <button style={{ marginLeft: 8 }} onClick={() => window.history.back()}>ยกเลิก</button>
        </div>
      </main>
    </>
  );
}