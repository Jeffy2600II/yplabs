// Path:    src/app/api/opslert/qr/route.ts
// Purpose: Generates QR code PNG for Opslert report URLs.
//          Server-side generation — no client-side QR library needed.
// Used by: src/app/opslert/page.tsx (display + download)

import { NextRequest, NextResponse } from 'next/server';

// QR size in pixels — large enough to scan reliably when printed
const QR_SIZE = 400;

// Maps report type → report path
const REPORT_PATHS: Record<string, string> = {
  paper: '/opslert/report?type=paper',
};

// ── Helpers ───────────────────────────────────────────────────────

function buildReportUrl(type: string, baseUrl: string): string {
  const path = REPORT_PATHS[type] ?? REPORT_PATHS.paper;
  return `${baseUrl}${path}`;
}

function getBaseUrl(req: NextRequest): string {
  // Use explicit env var for production; fall back to request origin
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  const host = req.headers.get('host') ?? 'localhost:3000';
  const proto = req.headers.get('x-forwarded-proto') ?? 'http';
  return `${proto}://${host}`;
}

// ── Route handler ─────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = req.nextUrl;
  const type = searchParams.get('type') ?? 'paper';
  const isDownload = searchParams.get('download') === '1';

  // Reject unknown types — prevent open redirect via QR URL
  if (!REPORT_PATHS[type]) {
    return NextResponse.json({ error: 'Unknown report type' }, { status: 400 });
  }

  const reportUrl = buildReportUrl(type, getBaseUrl(req));

  try {
    // Dynamic import: qrcode is server-only; not needed in client bundle
    // Install: npm install qrcode @types/qrcode
    const QRCode = (await import('qrcode')).default;

    const buffer: Buffer = await QRCode.toBuffer(reportUrl, {
      errorCorrectionLevel: 'M', // Medium — good balance of data + damage resistance
      width: QR_SIZE,
      margin: 2,
      color: {
        dark: '#09090F',  // matches --sb-bg for brand consistency
        light: '#FFFFFF',
      },
    });

    const headers: HeadersInit = {
      'Content-Type': 'image/png',
      // Cache for 10 minutes — QR URL rarely changes
      'Cache-Control': 'public, max-age=600',
    };

    if (isDownload) {
      // Trigger browser download dialog
      headers['Content-Disposition'] = `attachment; filename="opslert-${type}-qr.png"`;
    }

    return new NextResponse(buffer, { status: 200, headers });

  } catch (err: unknown) {
    // qrcode package not installed — return helpful error
    const isModuleError = err instanceof Error && err.message.includes('Cannot find module');
    if (isModuleError) {
      console.error('[opslert/qr] qrcode package not installed. Run: npm install qrcode @types/qrcode');
      return NextResponse.json(
        { error: 'QR generation unavailable — install qrcode package' },
        { status: 503 }
      );
    }

    console.error('[opslert/qr] QR generation failed:', err);
    return NextResponse.json({ error: 'QR generation failed' }, { status: 500 });
  }
}