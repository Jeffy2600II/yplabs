import { NextResponse } from "next/server";
import { google } from "googleapis";

/**
 * GET /api/auth/google/callback?code=...
 * Exchanges code for tokens and returns a simple HTML page that shows the refresh_token.
 * After you copy the refresh_token to your Vercel env (GOOGLE_OAUTH_REFRESH_TOKEN), remove the token from this page.
 */

export const dynamic = "force-dynamic"; // required because we use request.url

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    const redirectUri =
      process.env.GOOGLE_OAUTH_REDIRECT_URI ||
      `${process.env.NEXT_PUBLIC_BASE_URL || ""}/api/auth/google/callback`;
    
    if (!code) {
      return NextResponse.json({ error: "Missing code in query" }, { status: 400 });
    }
    if (!clientId || !clientSecret) {
      return NextResponse.json({ error: "GOOGLE_OAUTH_CLIENT_ID or SECRET not set" }, { status: 500 });
    }
    
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    const { tokens } = await oauth2Client.getToken(code);
    
    const refreshToken = tokens.refresh_token;
    
    // Show a minimal HTML with the refresh token and instructions
    const html = `
      <html>
        <body style="font-family:system-ui,Segoe UI,Roboto,Arial;margin:36px;">
          <h2>Google OAuth token</h2>
          <p>Copy the <strong>refresh_token</strong> below into your environment (Vercel secret): <code>GOOGLE_OAUTH_REFRESH_TOKEN</code></p>
          <pre style="background:#111;color:#fff;padding:12px;border-radius:6px;overflow:auto;">${refreshToken ?? "NO_REFRESH_TOKEN_RETURNED"}</pre>
          <p><strong>注意:</strong> If you see "NO_REFRESH_TOKEN_RETURNED", retry the authorize step and ensure you choose <em>Allow</em> and use <em>access_type=offline</em> and <em>prompt=consent</em>.</p>
          <p>After saving the refresh token, remove this page or revoke tokens for security.</p>
        </body>
      </html>
    `;
    
    return new NextResponse(html, {
      headers: { "content-type": "text/html" },
    });
  } catch (err: any) {
    console.error("auth/callback error:", err?.response?.data ?? err);
    return NextResponse.json({ error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}