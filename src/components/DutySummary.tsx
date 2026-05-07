import React from 'react';

type DutyEntry = {
  id: string;
  student_name: string;
  student_id: string;
  checked_in: boolean;
  checked_in_at ? : string | null;
  auth_uid ? : string | null;
};

type Props = {
  dutyList: DutyEntry[];
  currentUserUid ? : string | null;
};

export default function DutySummary({ dutyList, currentUserUid }: Props) {
  const checkedEntries = dutyList.filter(d => d.checked_in);
  return (
    <div className="card" style={{ marginBottom: 14, padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700 }}>🏫 เวรเช็คอิน</div>
        <div style={{ fontSize: 12, color: 'var(--t3)' }}>{checkedEntries.length}/{dutyList.length} คนเช็คอินแล้ว</div>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', overflow: 'hidden' }}>
        {checkedEntries.slice(0, 6).map(d => (
          <div key={d.id} style={{ background: 'var(--s2)', padding: '6px 8px', borderRadius: 8, fontSize: 13 }}>
            {d.student_name}
            {d.auth_uid === currentUserUid && <span className="badge badge-blue" style={{ marginLeft: 6, fontSize: 10 }}>คุณ</span>}
          </div>
        ))}
        {checkedEntries.length > 6 && <div style={{ fontSize: 13, color: 'var(--t3)' }}>+{checkedEntries.length - 6}</div>}
        <div>
          <a href="/duty" className="btn btn-ghost btn-sm">ดูทั้งหมด →</a>
        </div>
      </div>
    </div>
  );
}