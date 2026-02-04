import { NextResponse } from "next/server";
import { google } from "googleapis";

/**
 * GET /api/auth/google/url
 * Returns an authorization URL that you open to grant access.
 * Use redirect_uri that you set in Google Cloud Console.
 */
export async function GET(req: Request) {
  try {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI || `${process.env.NEXT_PUBLIC_BASE_URL || ""}/api/auth/google/callback`;
    
    if (!clientId) {
      return NextResponse.json({ error: "GOOGLE_OAUTH_CLIENT_ID is not set in environment." }, { status: 400 });
    }
    
    const oauth2Client = new google.auth.OAuth2(clientId, process.env.GOOGLE_OAUTH_CLIENT_SECRET, redirectUri);
    
    const scopes = [
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/spreadsheets",
    ];
    
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline", // we need refresh_token
      prompt: "consent",
      scope: scopes,
    });
    
    return NextResponse.json({ url: authUrl });
  } catch (err: any) {
    console.error("auth/url error:", err);
    return NextResponse.json({ error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}