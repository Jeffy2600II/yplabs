/**
 * lib/google.ts — Google Auth client factory
 * ─────────────────────────────────────────────────────────────────
 * Token strategy (ยึดแบบ commit 45fdf9d):
 *
 * Priority 1 — OAuth2 refresh token (แนะนำ):
 *   GOOGLE_OAUTH_CLIENT_ID
 *   GOOGLE_OAUTH_CLIENT_SECRET
 *   GOOGLE_OAUTH_REFRESH_TOKEN
 *
 * Priority 2 — Service account JWT (fallback):
 *   GOOGLE_CLIENT_EMAIL
 *   GOOGLE_PRIVATE_KEY
 *
 * ทุก route ที่ใช้ Google Drive/Sheets ต้องเรียกผ่านฟังก์ชันนี้เท่านั้น
 * ห้ามสร้าง auth client inline ใน route files
 */

import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';

export function getAuthClient(): OAuth2Client {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  
  // Priority 1: OAuth2 refresh token
  if (clientId && clientSecret && refreshToken) {
    const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
    oauth2.setCredentials({ refresh_token: refreshToken });
    return oauth2 as unknown as OAuth2Client;
  }
  
  // Priority 2: Service account JWT
  const email = process.env.GOOGLE_CLIENT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;
  
  if (!email || !rawKey) {
    throw new Error(
      'Google auth ไม่ได้ตั้งค่า: กรุณาตั้ง GOOGLE_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN ' +
      'หรือ GOOGLE_CLIENT_EMAIL/GOOGLE_PRIVATE_KEY'
    );
  }
  
  return new google.auth.JWT({
    email,
    key: rawKey.replace(/\\n/g, '\n'),
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive',
    ],
  }) as unknown as OAuth2Client;
}