// Path:    src/app/api/opslert/qr/route.ts
// Purpose: Generates a styled dot-style QR code SVG card, inspired by PromptPay
//          and Google's YouTube QR style.
//
//          Design:
//            • Dark brand-color header strip with "OPSLERT" wordmark
//            • Module label below header
//            • QR code with circle dots (data) + rounded-rect finder patterns
//            • Full report URL displayed below QR (so printed cards are scannable
//              AND manually-typeable)
//            • School branding in footer
//
//          Returns SVG (image/svg+xml) — fully scalable, ideal for both screen
//          and high-resolution print.  Download saves as .svg.
//
//          Domain fix: prefers x-forwarded-host header (set by Vercel) over the
//          raw host header, and falls back to NEXT_PUBLIC_SITE_URL env var.
//          This ensures the URL embedded in the card is always the production
//          domain (*.vercel.app) rather than an internal hostname.

import { NextRequest, NextResponse } from 'next/server';

// ── Config ────────────────────────────────────────────────────────

const REPORT_PATHS: Record<string, string> = {
  paper: '/opslert/report?type=paper',
  // soap: '/opslert/report?type=soap',  ← add new types here
};

const MODULE_META: Record<string, { label: string }> = {
  paper: { label: 'กระดาษห่อผ้าอนามัย' },
};

// ── URL helpers ───────────────────────────────────────────────────

/**
 * Resolves the canonical public URL of the deployment.
 * Priority:
 *   1. NEXT_PUBLIC_SITE_URL env var (explicit override)
 *   2. x-forwarded-host (set by Vercel edge; the actual public hostname)
 *   3. host header (fallback for local dev)
 */
function getBaseUrl(req: NextRequest): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, '');

  const proto = req.headers.get('x-forwarded-proto') ?? 'https';
  const host  = req.headers.get('x-forwarded-host')
    ?? req.headers.get('host')
    ?? 'localhost:3000';

  return `${proto}://${host}`;
}

function buildReportUrl(type: string, baseUrl: string): string {
  const path = REPORT_PATHS[type] ?? REPORT_PATHS.paper;
  return `${baseUrl}${path}`;
}

// ── XML escaping ──────────────────────────────────────────────────

function escXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Dot-style QR SVG builder ──────────────────────────────────────
//
// Uses qrcode.create() (the low-level API) to read the raw bit-matrix,
// then renders it manually as an SVG with:
//   • Data cells → filled circles
//   • Finder pattern zones → nested rounded rectangles (PromptPay style)

async function buildDotQRSvg(
  reportUrl: string,
  label: string,
): Promise<string> {
  const QRCode = (await import('qrcode')).default;

  // ── Get QR matrix ────────────────────────────────────────────────
  let N = 0;
  let isDark: (row: number, col: number) => boolean;

  try {
    const qr = (QRCode as any).create(reportUrl, { errorCorrectionLevel: 'Q' });
    N = qr.modules.size as number;
    const raw: Uint8ClampedArray = qr.modules.data;
    isDark = (r: number, c: number) => raw[r * N + c] !== 0;
  } catch (e) {
    throw new Error(`QR matrix creation failed: ${String(e)}`);
  }

  // ── Layout ────────────────────────────────────────────────────────
  const CELL      = 11;          // px per cell
  const DOT_R     = CELL * 0.38; // circle radius (data dots)
  const PAD       = 28;          // padding around QR region
  const QR_PX     = N * CELL;    // QR square size in px
  const HDR_H     = 64;          // header band height
  const LBL_H     = 28;          // label row height
  const FTR_H     = 72;          // footer height
  const W         = QR_PX + PAD * 2;
  const H         = HDR_H + LBL_H + PAD + QR_PX + PAD + FTR_H;
  const QR_Y      = HDR_H + LBL_H + PAD;  // y-offset where QR starts

  // ── Finder-pattern zone ───────────────────────────────────────────
  // Each finder is 7×7 cells; the "zone" includes the 1-cell separator
  // (row/col 7 adjacent to the top-left finder, etc.) so we skip 8 rows/cols.
  function isFinderZone(r: number, c: number): boolean {
    if (r < 8 && c < 8) return true;       // top-left
    if (r < 8 && c >= N - 8) return true;  // top-right
    if (r >= N - 8 && c < 8) return true;  // bottom-left
    return false;
  }

  // ── Data dots ─────────────────────────────────────────────────────
  const dots: string[] = [];
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (!isDark(r, c) || isFinderZone(r, c)) continue;
      const cx = (PAD + c * CELL + CELL / 2).toFixed(1);
      const cy = (QR_Y + r * CELL + CELL / 2).toFixed(1);
      dots.push(`<circle cx="${cx}" cy="${cy}" r="${DOT_R.toFixed(1)}" fill="#0A0C1C"/>`);
    }
  }

  // ── Finder patterns (nested rounded rects) ────────────────────────
  // Outer (7×7) → white inner (5×5) → dark core (3×3)
  function finder(startR: number, startC: number): string {
    const x  = PAD + startC * CELL;
    const y  = QR_Y + startR * CELL;
    const f  = (n: number) => n.toFixed(1);
    const S  = 7 * CELL; const S1 = 5 * CELL; const S2 = 3 * CELL;
    const x1 = x + CELL;  const y1 = y + CELL;
    const x2 = x + 2 * CELL; const y2 = y + 2 * CELL;
    return (
      `<rect x="${f(x)}" y="${f(y)}" width="${f(S)}" height="${f(S)}" rx="8" fill="#0A0C1C"/>` +
      `<rect x="${f(x1)}" y="${f(y1)}" width="${f(S1)}" height="${f(S1)}" rx="5" fill="white"/>` +
      `<rect x="${f(x2)}" y="${f(y2)}" width="${f(S2)}" height="${f(S2)}" rx="4" fill="#0A0C1C"/>`
    );
  }

  const finders = [
    finder(0, 0),
    finder(0, N - 7),
    finder(N - 7, 0),
  ].join('\n    ');

  // ── Text content ──────────────────────────────────────────────────
  const BRAND   = '#5B5BD6';
  const WH      = W / 2;  // horizontal center

  // Show URL without protocol for legibility, but keep full path
  const displayUrl = escXml(reportUrl.replace(/^https?:\/\//, ''));
  const safeLabel  = escXml(label);

  const divY    = QR_Y + QR_PX + 20;  // divider y
  const urlY    = divY + 22;
  const brandY  = divY + 38;
  const bottomY = divY + 54;

  // ── Assemble SVG ──────────────────────────────────────────────────
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="${W}" height="${H}"
     viewBox="0 0 ${W} ${H}">

  <!-- ── Card background ── -->
  <rect width="${W}" height="${H}" rx="20" fill="white"/>

  <!-- ── Header band ── -->
  <!-- Rounded top, square bottom via clip trick -->
  <rect width="${W}" height="${HDR_H + 12}" rx="20" fill="${BRAND}"/>
  <rect y="${HDR_H}" width="${W}" height="12" fill="${BRAND}"/>

  <!-- Header wordmark -->
  <text x="${WH}" y="${HDR_H / 2 + 7}"
    text-anchor="middle"
    font-family="system-ui,-apple-system,'Segoe UI',sans-serif"
    font-size="20" font-weight="800" letter-spacing="5" fill="white">OPSLERT</text>

  <!-- ── Module label ── -->
  <text x="${WH}" y="${HDR_H + LBL_H / 2 + 5}"
    text-anchor="middle"
    font-family="system-ui,-apple-system,'Noto Sans Thai',sans-serif"
    font-size="11" font-weight="600" fill="#626899">${safeLabel}</text>

  <!-- ── QR data dots ── -->
  ${dots.join('\n  ')}

  <!-- ── Finder patterns ── -->
  ${finders}

  <!-- ── Footer divider ── -->
  <rect x="${PAD}" y="${divY}" width="${W - PAD * 2}" height="1.5" rx="1" fill="#E8EBF6"/>

  <!-- ── Full URL (monospace, brand color) ── -->
  <text x="${WH}" y="${urlY}"
    text-anchor="middle"
    font-family="'Courier New',ui-monospace,monospace"
    font-size="9.5" font-weight="700" fill="${BRAND}">${displayUrl}</text>

  <!-- ── School branding ── -->
  <text x="${WH}" y="${brandY}"
    text-anchor="middle"
    font-family="system-ui,-apple-system,'Noto Sans Thai',sans-serif"
    font-size="9" fill="#9DA2C4">สภานักเรียน ร.ร. คำยางพิทยา</text>

  <!-- ── Scan hint ── -->
  <text x="${WH}" y="${bottomY}"
    text-anchor="middle"
    font-family="system-ui,-apple-system,sans-serif"
    font-size="8.5" fill="#C4C8E8">สแกน QR เพื่อแจ้งปัญหา</text>

</svg>`;
}

// ── Route: GET ────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = req.nextUrl;
  const type       = searchParams.get('type') ?? 'paper';
  const isDownload = searchParams.get('download') === '1';

  if (!REPORT_PATHS[type]) {
    return NextResponse.json({ error: 'Unknown report type' }, { status: 400 });
  }

  const baseUrl   = getBaseUrl(req);
  const reportUrl = buildReportUrl(type, baseUrl);
  const meta      = MODULE_META[type] ?? { label: type };

  try {
    const svg = await buildDotQRSvg(reportUrl, meta.label);

    const headers: Record<string, string> = {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      // Short cache — URL rarely changes, but we want updates to propagate quickly
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
    };

    if (isDownload) {
      headers['Content-Disposition'] =
        `attachment; filename="opslert-${type}-qr.svg"`;
    }

    return new NextResponse(svg, { status: 200, headers });

  } catch (err: unknown) {
    const isModuleError =
      err instanceof Error && err.message.includes('Cannot find module');

    if (isModuleError) {
      console.error('[opslert/qr] qrcode package missing. Run: npm install qrcode @types/qrcode');
      return NextResponse.json(
        { error: 'QR generation unavailable — install qrcode package' },
        { status: 503 }
      );
    }

    console.error('[opslert/qr]', err);
    return NextResponse.json({ error: 'QR generation failed' }, { status: 500 });
  }
}