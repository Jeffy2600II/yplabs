// src/app/api/auth/repair/route.ts
// ===================================================================
// AUTO-REPAIR + DIAGNOSTIC ENGINE สำหรับ Login System
// ===================================================================
// สิ่งที่ระบบนี้ทำ:
//   1. ตรวจวิเคราะห์ข้อมูลใน council_users + Supabase Auth
//   2. Auto-repair รูปแบบ email, auth_uid mismatch, password reset
//   3. ไม่แก้ไข: ชื่อ, รหัสนักเรียน, approved, disabled
//   4. ส่ง session กลับหาก repair สำเร็จ
// ===================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { synthesizeEmail } from '@/lib/auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ── Types ──────────────────────────────────────────────────────────

export type DiagCheck = {
  code: string;
  ok: boolean;
  message: string;
  detail?: string;
};

export type DiagRepair = {
  code: string;
  action: string;
  detail: string;
  success: boolean;
  error?: string;
};

export type RepairDiagnostic = {
  student_id: string;
  full_name: string;
  timestamp: string;
  checks: DiagCheck[];
  repairs: DiagRepair[];
  /**
   * รหัส fatal error ที่ระบบไม่สามารถแก้ไขอัตโนมัติได้
   * - NAME_MISMATCH          → ชื่อไม่ตรง (ต้องแก้ที่ผู้ใช้)
   * - NOT_APPROVED           → admin ยังไม่อนุมัติ
   * - ACCOUNT_DISABLED       → admin ปิดบัญชี
   * - COUNCIL_ROW_NOT_FOUND  → ไม่มีข้อมูลใน council_users เลย
   * - AUTH_IRRECOVERABLE     → สร้าง/แก้ auth ไม่ได้ (service error)
   */
  fatal: string | null;
  /** true = แก้ไขสำเร็จ + session พร้อมใช้ */
  repaired: boolean;
  /** Supabase session object (access_token + refresh_token) ถ้า repaired=true */
  session: { access_token: string; refresh_token: string } | null;
  /** ข้อมูล snapshot ของแถว council_users (เพื่อ debug) */
  council_snapshot: Record<string, any> | null;
};

// ── Helpers ────────────────────────────────────────────────────────

function norm(s: any): string {
  return String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function addCheck(diag: RepairDiagnostic, check: DiagCheck) {
  diag.checks.push(check);
}

function addRepair(diag: RepairDiagnostic, repair: DiagRepair) {
  diag.repairs.push(repair);
}

// ── Main Handler ───────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { full_name, student_id } = body ?? {};

  const diag: RepairDiagnostic = {
    student_id: String(student_id ?? ''),
    full_name: String(full_name ?? ''),
    timestamp: new Date().toISOString(),
    checks: [],
    repairs: [],
    fatal: null,
    repaired: false,
    session: null,
    council_snapshot: null,
  };

  // ── Validate input ──────────────────────────────────────────────
  if (!student_id || !/^\d{5}$/.test(String(student_id))) {
    diag.fatal = 'INVALID_STUDENT_ID_FORMAT';
    addCheck(diag, { code: 'INPUT_VALIDATION', ok: false, message: 'รหัสนักเรียนไม่ถูกต้อง', detail: `ต้องเป็นตัวเลข 5 หลัก ได้รับ: "${student_id}"` });
    return NextResponse.json(diag);
  }
  if (!full_name?.trim()) {
    diag.fatal = 'INVALID_NAME_INPUT';
    addCheck(diag, { code: 'INPUT_VALIDATION', ok: false, message: 'ชื่อ-นามสกุลไม่ถูกต้อง', detail: 'full_name ว่างเปล่า' });
    return NextResponse.json(diag);
  }

  const synEmail = synthesizeEmail(String(student_id));
  addCheck(diag, { code: 'INPUT_VALIDATION', ok: true, message: 'Input ถูกต้อง', detail: `student_id="${student_id}" synEmail="${synEmail}"` });

  // ── Step 1: Find council_users row by student_id ────────────────
  const { data: crow, error: crowErr } = await supabase
    .from('council_users')
    .select('*')
    .eq('student_id', String(student_id))
    .maybeSingle();

  if (crowErr || !crow) {
    addCheck(diag, {
      code: 'COUNCIL_ROW_LOOKUP',
      ok: false,
      message: 'ไม่พบข้อมูลใน council_users สำหรับรหัสนักเรียนนี้',
      detail: crowErr?.message ?? `SELECT * FROM council_users WHERE student_id='${student_id}' → 0 rows`,
    });
    diag.fatal = 'COUNCIL_ROW_NOT_FOUND';
    return NextResponse.json(diag);
  }

  diag.council_snapshot = {
    full_name: crow.full_name,
    student_id: crow.student_id,
    account_type: crow.account_type,
    approved: crow.approved,
    disabled: crow.disabled,
    auth_uid: crow.auth_uid,
    email: crow.email,
    year: crow.year,
    role: crow.role,
  };
  addCheck(diag, {
    code: 'COUNCIL_ROW_LOOKUP',
    ok: true,
    message: 'พบแถวใน council_users',
    detail: JSON.stringify(diag.council_snapshot),
  });

  // ── Step 2: Name check (CANNOT auto-repair) ─────────────────────
  if (norm(crow.full_name) !== norm(full_name)) {
    addCheck(diag, {
      code: 'NAME_MATCH',
      ok: false,
      message: 'ชื่อ-นามสกุลไม่ตรงกับข้อมูลในระบบ',
      detail: `DB: "${crow.full_name}" | Input: "${full_name}" (normalize: "${norm(crow.full_name)}" vs "${norm(full_name)}")`,
    });
    diag.fatal = 'NAME_MISMATCH';
    return NextResponse.json(diag);
  }
  addCheck(diag, { code: 'NAME_MATCH', ok: true, message: 'ชื่อตรงกัน', detail: `"${crow.full_name}"` });

  // ── Step 3: Approved / Disabled (CANNOT auto-repair) ───────────
  if (!crow.approved) {
    addCheck(diag, { code: 'APPROVED_CHECK', ok: false, message: 'บัญชียังไม่ได้รับการอนุมัติ', detail: `council_users.approved = ${crow.approved}` });
    diag.fatal = 'NOT_APPROVED';
    return NextResponse.json(diag);
  }
  addCheck(diag, { code: 'APPROVED_CHECK', ok: true, message: 'บัญชีได้รับการอนุมัติแล้ว' });

  if (crow.disabled) {
    addCheck(diag, { code: 'DISABLED_CHECK', ok: false, message: 'บัญชีถูกปิดใช้งานโดยผู้ดูแล', detail: `council_users.disabled = ${crow.disabled}` });
    diag.fatal = 'ACCOUNT_DISABLED';
    return NextResponse.json(diag);
  }
  addCheck(diag, { code: 'DISABLED_CHECK', ok: true, message: 'บัญชีเปิดใช้งานอยู่' });

  // ── Step 4: Repair email format in council_users ────────────────
  if (crow.email !== synEmail) {
    addCheck(diag, {
      code: 'COUNCIL_EMAIL_FORMAT',
      ok: false,
      message: 'Email ใน council_users ไม่ตรงรูปแบบที่ใช้ใน Auth',
      detail: `DB: "${crow.email}" | Expected: "${synEmail}"`,
    });
    const { error: emailUpdateErr } = await supabase
      .from('council_users')
      .update({ email: synEmail })
      .eq('student_id', String(student_id));
    addRepair(diag, {
      code: 'FIX_COUNCIL_EMAIL',
      action: `UPDATE council_users SET email='${synEmail}' WHERE student_id='${student_id}'`,
      detail: `"${crow.email}" → "${synEmail}"`,
      success: !emailUpdateErr,
      error: emailUpdateErr?.message,
    });
  } else {
    addCheck(diag, { code: 'COUNCIL_EMAIL_FORMAT', ok: true, message: 'Email ใน council_users ถูกต้อง', detail: crow.email });
  }

  // ── Step 5: Try normal auth login with synthesized email ────────
  const { data: authSignIn1, error: authErr1 } = await supabase.auth.signInWithPassword({
    email: synEmail,
    password: String(student_id),
  });

  if (!authErr1 && authSignIn1?.session) {
    addCheck(diag, {
      code: 'AUTH_LOGIN_SYNTH_EMAIL',
      ok: true,
      message: 'Auth login สำเร็จด้วย email สังเคราะห์',
      detail: `uid=${authSignIn1.user?.id}`,
    });

    // Sync auth_uid if mismatched
    if (crow.auth_uid !== authSignIn1.user?.id) {
      addCheck(diag, {
        code: 'AUTH_UID_SYNC',
        ok: false,
        message: 'auth_uid ใน council_users ไม่ตรงกับ Auth',
        detail: `DB: "${crow.auth_uid}" | Auth: "${authSignIn1.user?.id}"`,
      });
      const { error: uidErr } = await supabase
        .from('council_users')
        .update({ auth_uid: authSignIn1.user!.id })
        .eq('student_id', String(student_id));
      addRepair(diag, {
        code: 'FIX_AUTH_UID',
        action: `UPDATE council_users SET auth_uid='${authSignIn1.user!.id}' WHERE student_id='${student_id}'`,
        detail: `"${crow.auth_uid}" → "${authSignIn1.user!.id}"`,
        success: !uidErr,
        error: uidErr?.message,
      });
    } else {
      addCheck(diag, { code: 'AUTH_UID_SYNC', ok: true, message: 'auth_uid ตรงกัน', detail: crow.auth_uid });
    }

    diag.repaired = true;
    diag.session = { access_token: authSignIn1.session.access_token, refresh_token: authSignIn1.session.refresh_token };
    return NextResponse.json(diag);
  }

  addCheck(diag, {
    code: 'AUTH_LOGIN_SYNTH_EMAIL',
    ok: false,
    message: 'Auth login ล้มเหลวด้วย email สังเคราะห์',
    detail: authErr1?.message ?? 'Unknown error',
  });

  // ── Step 6: Look up auth user by stored auth_uid ────────────────
  let foundAuthUser: any = null;

  if (crow.auth_uid) {
    const { data: byUid } = await supabase.auth.admin.getUserById(crow.auth_uid);
    if (byUid?.user) {
      foundAuthUser = byUid.user;
      addCheck(diag, {
        code: 'AUTH_USER_BY_UID',
        ok: true,
        message: 'พบ Auth User โดย auth_uid ที่เก็บในระบบ',
        detail: `uid="${foundAuthUser.id}" email="${foundAuthUser.email}" created_at="${foundAuthUser.created_at}"`,
      });
    } else {
      addCheck(diag, {
        code: 'AUTH_USER_BY_UID',
        ok: false,
        message: 'ไม่พบ Auth User จาก auth_uid ใน council_users',
        detail: `uid="${crow.auth_uid}" → supabase.auth.admin.getUserById() = null`,
      });
    }
  } else {
    addCheck(diag, {
      code: 'AUTH_USER_BY_UID',
      ok: false,
      message: 'council_users.auth_uid เป็น null / ว่างเปล่า',
      detail: 'ไม่มี auth_uid ให้ค้นหา',
    });
  }

  // ── Step 7: Try auth login with stored/alternative email ────────
  if (foundAuthUser && foundAuthUser.email !== synEmail) {
    const altEmail = foundAuthUser.email;
    const { data: authSignIn2, error: authErr2 } = await supabase.auth.signInWithPassword({
      email: altEmail,
      password: String(student_id),
    });

    if (!authErr2 && authSignIn2?.session) {
      addCheck(diag, {
        code: 'AUTH_LOGIN_ALT_EMAIL',
        ok: true,
        message: `Auth login สำเร็จด้วย email สำรอง "${altEmail}"`,
        detail: `uid=${authSignIn2.user?.id}`,
      });

      // Repair: migrate auth user email to synthesized format
      const { error: upEmailErr } = await supabase.auth.admin.updateUserById(authSignIn2.user!.id, {
        email: synEmail,
      });
      addRepair(diag, {
        code: 'FIX_AUTH_USER_EMAIL',
        action: `supabase.auth.admin.updateUserById("${authSignIn2.user!.id}", { email: "${synEmail}" })`,
        detail: `"${altEmail}" → "${synEmail}"`,
        success: !upEmailErr,
        error: upEmailErr?.message,
      });

      // Sync auth_uid
      if (crow.auth_uid !== authSignIn2.user?.id) {
        const { error: uidErr2 } = await supabase
          .from('council_users')
          .update({ auth_uid: authSignIn2.user!.id })
          .eq('student_id', String(student_id));
        addRepair(diag, {
          code: 'FIX_AUTH_UID',
          action: `UPDATE council_users SET auth_uid='${authSignIn2.user!.id}' WHERE student_id='${student_id}'`,
          detail: `"${crow.auth_uid}" → "${authSignIn2.user!.id}"`,
          success: !uidErr2,
          error: uidErr2?.message,
        });
      }

      diag.repaired = true;
      diag.session = { access_token: authSignIn2.session.access_token, refresh_token: authSignIn2.session.refresh_token };
      return NextResponse.json(diag);
    }

    addCheck(diag, {
      code: 'AUTH_LOGIN_ALT_EMAIL',
      ok: false,
      message: `Auth login ล้มเหลวด้วย email สำรอง "${altEmail}"`,
      detail: authErr2?.message,
    });
  }

  // ── Step 8: Auth user exists but password is wrong — reset it ───
  if (foundAuthUser) {
    addCheck(diag, {
      code: 'PASSWORD_RESET_ATTEMPT',
      ok: false,
      message: 'รหัสผ่านของ Auth User ไม่ตรงกับรหัสนักเรียน — กำลังรีเซ็ต',
      detail: `uid="${foundAuthUser.id}" email="${foundAuthUser.email}"`,
    });

    const { error: pwResetErr } = await supabase.auth.admin.updateUserById(foundAuthUser.id, {
      password: String(student_id),
      email: synEmail,
    });
    addRepair(diag, {
      code: 'FIX_PASSWORD_AND_EMAIL',
      action: `supabase.auth.admin.updateUserById("${foundAuthUser.id}", { password: student_id, email: "${synEmail}" })`,
      detail: `รีเซ็ตรหัสผ่านเป็นรหัสนักเรียน + แก้ email`,
      success: !pwResetErr,
      error: pwResetErr?.message,
    });

    if (!pwResetErr) {
      // Try login one more time
      const { data: authFinal, error: authFinalErr } = await supabase.auth.signInWithPassword({
        email: synEmail,
        password: String(student_id),
      });

      if (!authFinalErr && authFinal?.session) {
        addCheck(diag, { code: 'AUTH_LOGIN_AFTER_RESET', ok: true, message: 'Auth login สำเร็จหลังรีเซ็ตรหัสผ่าน' });

        // Final sync auth_uid
        if (crow.auth_uid !== authFinal.user?.id) {
          await supabase.from('council_users').update({ auth_uid: authFinal.user!.id }).eq('student_id', String(student_id));
          addRepair(diag, {
            code: 'FIX_AUTH_UID_FINAL',
            action: `UPDATE council_users SET auth_uid='${authFinal.user!.id}'`,
            detail: `Final sync auth_uid`,
            success: true,
          });
        }

        diag.repaired = true;
        diag.session = { access_token: authFinal.session.access_token, refresh_token: authFinal.session.refresh_token };
        return NextResponse.json(diag);
      }

      addCheck(diag, {
        code: 'AUTH_LOGIN_AFTER_RESET',
        ok: false,
        message: 'Login ยังล้มเหลวหลังรีเซ็ต — service error',
        detail: authFinalErr?.message,
      });
    }

    diag.fatal = 'AUTH_IRRECOVERABLE';
    return NextResponse.json(diag);
  }

  // ── Step 9: Auth user doesn't exist at all ──────────────────────
  addCheck(diag, {
    code: 'AUTH_USER_EXISTENCE',
    ok: false,
    message: 'ไม่พบ Auth User ใดๆ ที่ตรงกับบัญชีนี้',
    detail: 'council_users row พบแล้วแต่ไม่มี Supabase Auth user ตรงกัน ต้องสร้างใหม่โดย admin',
  });
  diag.fatal = 'AUTH_USER_NOT_EXIST';

  return NextResponse.json(diag);
}