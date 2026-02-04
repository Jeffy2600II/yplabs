import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";

/**
 * Return a Google auth client:
 * - If GOOGLE_OAUTH_CLIENT_ID / SECRET / REFRESH_TOKEN exist -> OAuth2 client using refresh token (preferred for personal Gmail)
 * - Otherwise -> JWT service account using GOOGLE_CLIENT_EMAIL & GOOGLE_PRIVATE_KEY (fallback)
 *
 * Scopes used by other modules: Drive & Sheets.
 */
export function getAuthClient(): OAuth2Client {
  const oauthClientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const oauthClientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const oauthRefreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  
  if (oauthClientId && oauthClientSecret && oauthRefreshToken) {
    const oAuth2Client = new google.auth.OAuth2(oauthClientId, oauthClientSecret);
    oAuth2Client.setCredentials({ refresh_token: oauthRefreshToken });
    return oAuth2Client;
  }
  
  // Fallback to service account
  const email = process.env.GOOGLE_CLIENT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;
  
  if (!email || !rawKey) {
    throw new Error(
      "ไม่มีวิธีการ authenticate: ตั้งค่าทั้ง (GOOGLE_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN) หรือ (GOOGLE_CLIENT_EMAIL & GOOGLE_PRIVATE_KEY)"
    );
  }
  
  const key = rawKey.replace(/\\n/g, "\n");
  
  return new google.auth.JWT({
    email,
    key,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive",
    ],
  });
}