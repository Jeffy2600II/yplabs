'use client';

/**
 * /admin/duty/page.tsx — จัดการเวร (Admin)
 * - Supabase Realtime: รีเฟรชอัตโนมัติเมื่อมีเช็คอิน
 */

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/context/AuthContext';
import { getBrowserSupabase } from '@/lib/supabaseClient';
import { useRealtime } from '@/lib/realtimeHooks';

type DutyEntry = {
  id: string;
  student_name: string;
  student_id: string;
  auth_uid: string | null;
  duty_date: string;
  checked_in: boolean;
  checked_in_at: string | null;
  note: string | null;
};
type MemberRow = { auth_uid: string; full_name: string; student_id: string };

export default function AdminDutyPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const [duties, setDuties] = useState<DutyEntry[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [selected, setSelected] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isAdmin) router.replace('/');
  }, [authLoading, isAdmin, router]);

  async function getToken() {
    const { data } = await getBrowserSupabase().auth.getSession();
    return data?.session?.access_token ?? null;
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const h = { Authorization: `Bearer ${token ?? ''}` };
      const [dR, mR] = await Promise.all([
        fetch(`/api/admin/duty?date=${date}`, { headers: h }),
        fetch('/api/admin/users', { headers: h }),
      ]);
      if (dR.ok) setDuties(await dR.json() || []);
      if (mR.ok) setMembers(await mR.json() || []);
    } catch {}
    setLoading(false);
  }, [date]);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  // ★ Realtime
  useRealtime({
    table: 'council_duty',
    filter: `duty_date=eq.${date}`,
    onData: () => void load(),
    enabled: isAdmin,
  });

  async function addDuty() {
    if (!selected) { setError('กรุณาเลือกสมาชิก'); return; }
    setAdding(true); setError(null);
    try {
      const token = await getToken();
      const m = members.find(x => x.auth_uid === selected);
      if (!m) throw new Error('ไม่พบสมาชิก');
      const res = await fetch('/api/admin/duty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify({ auth_uid: m.auth_uid, student_name: m.full_name, student_id: m.student_id, duty_date: date }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'ล้มเหลว');
      setSelected('');
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'เกิดข้อผิดพลาด');
    } finally {
      setAdding(false);
    }
  }

  async function removeDuty(id: string, name: string) {
    if (!confirm(`ลบ "${name}" ออกจากเวรวันนี้?`)) return;
    const token = await getToken();
    await fetch(`/api/admin/duty/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token ?? ''}` } });
    await load();
  }

  if (authLoading) return (
    <AppShell pageTitle="จัดการเวร">
      <div className="loading-center"><div className="spinner" /></div>
    </AppShell>
  );
  if (!isAdmin) return null;

  const checkedCount = duties.filter(d => d.checked_in).length;
  const dateLabel = new Date(date + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <AppShell pageTitle="จัดการเวร">
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div className="page-title">จัดการเวรยืนหน้าโรงเรียน</div>
            <div className="page-subtitle">กำหนดรายชื่อผู้ปฏิบัติหน้าที่ประจำวัน</div>
          </div>
          <span style={{ fontSize: 11, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--green)', display: 'inline-block', animation: 'pulse 2s infinite' }} />
            Realtime
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid-2" style={{ marginBottom: 16, maxWidth: 360 }}>
        <div className="stat-card" style={{ borderTop: '3px solid var(--green)' }}>
          <div className="stat-label">เช็คอินแล้ว</div>
          <div className="stat-value" style={{ color: 'var(--green)' }}>{checkedCount}</div>
        </div>
        <div className="stat-card" style={{ borderTop: '3px solid var(--amber)' }}>
          <div className="stat-label">รอเช็คอิน</div>
          <div className="stat-value" style={{ color: 'var(--amber)' }}>{duties.length - checkedCount}</div>
        </div>
      </div>

      {/* Add duty form */}
      <div className="card" style={{ marginBottom: 16, maxWidth: 640 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>➕ เพิ่มรายชื่อเวร</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ flex: '0 0 auto' }}>
            <label className="form-label">วันที่</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ width: 'auto' }} />
          </div>
          <div className="form-group" style={{ flex: 1, minWidth: 200 }}>
            <label className="form-label">สมาชิกที่จะเพิ่ม</label>
            <select value={selected} onChange={e => setSelected(e.target.value)}>
              <option value="">— เลือกสมาชิก —</option>
              {members
                .filter(m => !duties.some(d => d.auth_uid === m.auth_uid))
                .map(m => (
                  <option key={m.auth_uid} value={m.auth_uid}>{m.full_name} ({m.student_id})</option>
                ))}
            </select>
          </div>
          <button
            onClick={addDuty}
            disabled={adding || !selected}
            className="btn btn-primary"
            style={{ flexShrink: 0 }}
          >
            {adding ? 'กำลังเพิ่ม...' : '＋ เพิ่ม'}
          </button>
        </div>
        {error && <div className="alert alert-error" style={{ marginTop: 10 }}>{error}</div>}
      </div>

      {/* Duty list */}
      <div className="table-wrap" style={{ maxWidth: 800 }}>
        <div style={{
          padding: '12px 16px', background: 'var(--surface-2)',
          borderBottom: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>เวรวันที่ {dateLabel}</span>
          <span className="badge badge-blue">{duties.length} คน</span>
        </div>

        {loading ? (
          <div className="loading-center"><div className="spinner" /></div>
        ) : duties.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📋</div>
            <div>ยังไม่มีรายชื่อเวรสำหรับวันนี้</div>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>#</th><th>ชื่อ</th><th>รหัส</th><th>สถานะ</th><th>เวลาเช็คอิน</th><th>หมายเหตุ</th><th></th>
              </tr>
            </thead>
            <tbody>
              {duties.map((d, i) => (
                <tr key={d.id}>
                  <td style={{ color: 'var(--text-3)' }}>{i + 1}</td>
                  <td style={{ fontWeight: 600 }}>{d.student_name}</td>
                  <td style={{ fontFamily: 'monospace' }}>{d.student_id}</td>
                  <td>
                    {d.checked_in
                      ? <span className="badge badge-green">✓ มาแล้ว</span>
                      : <span className="badge badge-gray">รอ</span>}
                  </td>
                  <td style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
                    {d.checked_in_at
                      ? new Date(d.checked_in_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.'
                      : '—'}
                  </td>
                  <td style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{d.note ?? '—'}</td>
                  <td>
                    <button
                      onClick={() => removeDuty(d.id, d.student_name)}
                      className="btn btn-danger btn-sm"
                    >
                      ลบ
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>
    </AppShell>
  );
}