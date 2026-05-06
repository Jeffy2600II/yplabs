// Path:    src/app/zone-check/page.tsx
// Purpose: Zone inspection page — members record each zone's cleanliness.
//          Uses rtTick double-trigger pattern identical to admin pages.
//          Invalidating ZONES_URL ที่นี่จะอัปเดต home page ด้วย

'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';
import { fetchWithAuth } from '@/lib/sessionUtils';
import { useData, invalidate } from '@/lib/dataCore';
import { useRealtime } from '@/lib/realtimeHooks';
import { remoteLog } from '@/lib/remoteLogger';
import { getTodayTH } from '@/lib/clientDateUtils';

const ZONES = ['ม.1/1', 'ม.1/2', 'ม.2/1', 'ม.2/2', 'ม.3/1', 'ม.3/2', 'ม.4', 'ม.5', 'ม.6'];

// ★ Shared URL key — switched to central API but UI unchanged
const TODAY = getTodayTH();
// Select raw columns from DB (we map names below to keep compatibility with original UI)
const ZONES_URL = `/api/data?resource=council_zone_checks&filters=${encodeURIComponent(JSON.stringify({ check_date: TODAY }))}&select=${encodeURIComponent('zone,status,inspector_name,note,created_at,check_date')}`;

// ── Types ─────────────────────────────────────────────────────────

type ServerZone = {
  zone: string;
  status: 'clean' | 'dirty' | 'pending';
  inspector_name?: string | null;
  note?: string | null;
  created_at?: string | null;
  check_date?: string | null;
};

type LocalZone = {
  status: 'pending' | 'clean' | 'dirty';
  note: string;
  file: File | null;
  preview: string | null;
};

type ZoneView = {
  zone: string;
  status: 'pending' | 'clean' | 'dirty';
  note: string;
  file: File | null;
  preview: string | null;
  saved: boolean;
  savedBy: string | null;
  savedAt: string | null;
};

// ── Helpers ───────────────────────────────────────────────────────

function initLocal(): Record<string, LocalZone> {
  return Object.fromEntries(
    ZONES.map(z => [z, { status: 'pending', note: '', file: null, preview: null }])
  );
}

// ──────────────��──────────────────────────────────────────────────

export default function ZoneCheckPage() {
  const { isMember, user, loading: authLoading } = useAuth();

  // ★ rtTick double-trigger — เหมือน admin pages ทุกตัว
  const [zonesTick, setZonesTick] = useState(0);

  // ★ Realtime: รับ push เมื่อมีคนบันทึกผลเขตใหม่
  useRealtime({
    table: 'council_zone_checks',
    onData: useCallback(() => {
      invalidate(ZONES_URL);
      setZonesTick(n => n + 1);
    }, []),
    debounceMs: 500,
  });

  const { data: serverZones, loading: serverLoading, error: fetchError } =
    useData<ServerZone[]>(ZONES_URL, {
      enabled: !authLoading,
      realtimeTick: zonesTick,
      pollIntervalMs: 30_000,
    });

  useEffect(() => {
    if (fetchError) {
      void remoteLog('error', '[zone-check] server state fetch failed', {
        error: fetchError,
        url: ZONES_URL,
      });
    }
  }, [fetchError]);

  const [local, setLocal]           = useState<Record<string, LocalZone>>(initLocal);
  const [expanded, setExpanded]     = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitProgress, setSubmitProgress] = useState<{
    zone: string; done: number; total: number;
  } | null>(null);
  const [done, setDone]   = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Derived: merge server (locked) + local (editable)
  const zones: ZoneView[] = useMemo(() => {
    return ZONES.map(z => {
      // serverZones may be rows from DB: inspector_name + created_at
      const server = serverZones?.find(s => s.zone === z);
      const isLocked = !!(server && server.status && server.status !== 'pending');

      if (isLocked) {
        return {
          zone: z,
          status: server!.status,
          note: server!.note ?? '',
          file: null,
          preview: null,
          saved: true,
          savedBy: server!.inspector_name ?? null,
          savedAt: server!.created_at ?? null,
        };
      }

      return {
        zone: z,
        status: local[z].status,
        note: local[z].note,
        file: local[z].file,
        preview: local[z].preview,
        saved: false,
        savedBy: null,
        savedAt: null,
      };
    });
  }, [serverZones, local]);

  // ── Actions ────────────────────────────────────────────────────

  const updateLocal = useCallback((zone: string, patch: Partial<LocalZone>) => {
    setLocal(p => ({ ...p, [zone]: { ...p[zone], ...patch } }));
  }, []);

  function handlePhoto(zone: string, file: File | null) {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { alert('ไฟล์ใหญ่เกิน 8MB'); return; }
    updateLocal(zone, { file, preview: URL.createObjectURL(file) });
  }

  function removePhoto(zone: string) {
    updateLocal(zone, { file: null, preview: null });
  }

  async function submitZone(zone: string) {
    setSubmitting(true);
    setError(null);
    try {
      const z = local[zone];
      if (!z) throw new Error('ไม่มีข้อมูล');

      const form = new FormData();
      form.append('zone', zone);
      form.append('status', z.status);
      form.append('note', z.note || '');
      if (z.file) form.append('photo', z.file);

      // IMPORTANT: pass noContentType: true so fetchWithAuth DOES NOT set Content-Type header
      const res = await fetchWithAuth('/api/council/zone-check', {
        method: 'POST',
        body: form,
        noContentType: true,
      } as any);

      // fetchWithAuth returns a Response object — check status
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error ?? `HTTP ${res.status}`);
      }

      // Double-trigger invalidation like other pages
      invalidate(ZONES_URL);
      setZonesTick(n => n + 1);
      // clear local for this zone
      updateLocal(zone, { status: 'pending', note: '', file: null, preview: null });
    } catch (e: any) {
      setError(String(e?.message ?? e));
      void remoteLog('error', '[zone-check] submit failed', { error: String(e?.message ?? e), zone });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell pageTitle="ตรวจเขตสะอาด">
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div>
            <div className="page-title">🧹 ตรวจเขตสะอาด</div>
            <div className="page-subtitle">บันทึกสถานะเขตประจำวัน</div>
          </div>
        </div>
      </div>

      { (error || fetchError) && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error ? error : 'โหลดข้อมูลล้มเหลว'}</div> }

      <div className="grid-3" style={{ gap: 12 }}>
        {zones.map(z => (
          <div key={z.zone} className="card" style={{ padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 700 }}>{z.zone}</div>
              {z.saved ? <span className="badge badge-green">บันทึกโดย {z.savedBy ?? '—'}</span> : null}
            </div>

            <div style={{ marginTop: 8 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <button disabled={z.saved} onClick={() => updateLocal(z.zone, { status: 'clean' })} className={`btn ${z.status === 'clean' ? 'btn-primary' : 'btn-ghost'}`}>Clean</button>
                <button disabled={z.saved} onClick={() => updateLocal(z.zone, { status: 'dirty' })} className={`btn ${z.status === 'dirty' ? 'btn-danger' : 'btn-ghost'}`}>Dirty</button>
              </div>
              {!z.saved && (
                <>
                  <div style={{ marginTop: 8 }}>
                    <textarea value={z.note} onChange={e => updateLocal(z.zone, { note: e.target.value })} placeholder="หมายเหตุ (ถ้ามี)" />
                  </div>
                  <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                    <input type="file" accept="image/*" onChange={e => handlePhoto(z.zone, e.target.files?.[0] ?? null)} />
                    {z.preview && <button onClick={() => removePhoto(z.zone)} className="btn btn-ghost">ลบรูป</button>}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <button disabled={submitting} onClick={() => submitZone(z.zone)} className="btn btn-success">
                      {submitting ? 'กำลังบันทึก...' : 'บันทึก'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}