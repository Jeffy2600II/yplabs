// Path:    src/lib/env.ts
// Purpose: Centralized environment variable configuration — single source of truth
//          for ALL env vars across the entire YPLABS application.
//          Validates at import time (server) so misconfiguration fails fast.
// Used by: src/lib/apiHelper.ts, src/lib/supabaseClient.ts, all API routes

/**
 * ════════════════════════════════════════════════════════════════
 * YPLABS — Environment Variable Reference
 * ════════════════════════════════════════════════════════════════
 *
 * Provided by Vercel × Supabase Integration (auto-injected):
 *
 * ── CLIENT-SIDE (exposed to browser via NEXT_PUBLIC_) ──────────
 *   NEXT_PUBLIC_SUPABASE_URL          — Supabase project URL (browser-safe)
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY     — Supabase anon/publishable key (browser-safe, legacy name)
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY — same as above (new Vercel integration name)
 *
 * ── SERVER-SIDE ONLY (never exposed to browser) ─────────────────
 *   SUPABASE_URL                      — Supabase project URL (server; mirrors NEXT_PUBLIC_ value)
 *   SUPABASE_SERVICE_ROLE_KEY         — Full admin access key — KEEP SECRET
 *   SUPABASE_ANON_KEY                 — Anon key (server alias; same value as publishable key)
 *   SUPABASE_PUBLISHABLE_KEY          — Publishable key (server alias)
 *   SUPABASE_JWT_SECRET               — JWT signing secret for token verification
 *   SUPABASE_SECRET_KEY               — Additional secret key from integration
 *
 * ── POSTGRES DIRECT CONNECTION ──────────────────────────────────
 *   POSTGRES_URL                      — Pooled connection (Supavisor) — use for normal queries
 *   POSTGRES_PRISMA_URL               — Pooled + pgBouncer hints — use with Prisma
 *   POSTGRES_URL_NON_POOLING          — Direct connection — REQUIRED for pg LISTEN/NOTIFY
 *   POSTGRES_HOST                     — DB hostname
 *   POSTGRES_USER                     — DB username
 *   POSTGRES_PASSWORD                 — DB password
 *   POSTGRES_DATABASE                 — DB name
 *
 * ── CUSTOM (set manually in Vercel dashboard) ───────────────────
 *   EMERGENCY_ACCESS_CODE             — Break-glass admin access code
 *   EMERGENCY_JWT_SECRET              — JWT secret for emergency tokens
 *   DRIVE_FOLDER_ID                   — Google Drive upload folder
 *   SHEET_ID                          — Google Sheets target
 *   GOOGLE_OAUTH_CLIENT_ID            — Google OAuth client ID
 *   GOOGLE_OAUTH_CLIENT_SECRET        — Google OAuth client secret
 *   GOOGLE_OAUTH_REFRESH_TOKEN        — Google OAuth refresh token
 *   GOOGLE_CLIENT_EMAIL               — Service account email (fallback)
 *   GOOGLE_PRIVATE_KEY                — Service account private key (fallback)
 * ════════════════════════════════════════════════════════════════
 */

// ── Server-side Supabase config ───────────────────────────────────────────────
// Priority: SUPABASE_URL > NEXT_PUBLIC_SUPABASE_URL
// Reason: SUPABASE_URL is the canonical server-side var. NEXT_PUBLIC_ is browser-safe
// but also available on the server — used as fallback for older setups.

export const SERVER_SUPABASE_URL: string =
  process.env.SUPABASE_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  '';

export const SUPABASE_SERVICE_ROLE_KEY: string =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

// JWT secret used for emergency token signing (not Supabase auth JWT)
export const SUPABASE_JWT_SECRET: string =
  process.env.SUPABASE_JWT_SECRET ?? '';

// ── Client-side Supabase config (browser-safe) ───────────────────────────────
// These values are embedded into the JS bundle — must never be secrets.
// NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is the new Vercel integration name.
// NEXT_PUBLIC_SUPABASE_ANON_KEY is the legacy name — both hold the same value.

export const CLIENT_SUPABASE_URL: string =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';

export const CLIENT_SUPABASE_ANON_KEY: string =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  '';

// ── Postgres direct connection ────────────────────────────────────────────────
// POSTGRES_URL_NON_POOLING MUST be used for pg LISTEN/NOTIFY.
// Connection poolers (Supavisor) do not support long-lived connections.

export const POSTGRES_URL_NON_POOLING: string =
  process.env.POSTGRES_URL_NON_POOLING ?? '';

export const POSTGRES_URL: string =
  process.env.POSTGRES_URL ?? '';

// ── Validation helpers ────────────────────────────────────────────────────────

/** Returns true if the server-side Supabase config is complete */
export function isServerSupabaseConfigured(): boolean {
  return !!SERVER_SUPABASE_URL && !!SUPABASE_SERVICE_ROLE_KEY;
}

/** Returns true if the client-side Supabase config is complete */
export function isClientSupabaseConfigured(): boolean {
  return !!CLIENT_SUPABASE_URL && !!CLIENT_SUPABASE_ANON_KEY;
}

/** Returns true if the Postgres non-pooling URL is set (required for realtime) */
export function isPostgresNonPoolingConfigured(): boolean {
  try {
    if (!POSTGRES_URL_NON_POOLING) return false;
    new URL(POSTGRES_URL_NON_POOLING);
    return true;
  } catch {
    return false;
  }
}

/**
 * Asserts that server-side Supabase config is present.
 * Call at the top of server-only modules to fail fast on misconfiguration.
 */
export function assertServerConfig(context: string): void {
  if (!SERVER_SUPABASE_URL) {
    throw new Error(
      `[${context}] Missing SUPABASE_URL env var. ` +
      'Ensure Supabase × Vercel integration is connected and project is redeployed.'
    );
  }
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      `[${context}] Missing SUPABASE_SERVICE_ROLE_KEY env var. ` +
      'This key is required for server-side admin operations.'
    );
  }
}