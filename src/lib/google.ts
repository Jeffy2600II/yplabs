import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";

/**
 * Return a Google auth client (JWT service account).
 * Throws descriptive error if required env vars are missing.
 *
 * Note: For the Shared Drive approach (วิธี A) we expect to use a service
 * account and that service account must be added as a member of the Shared drive.
 */
export function getAuthClient(): OAuth2Client {
  const email = process.env.GOOGLE_CLIENT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;
  
  if (!email || !rawKey) {
    throw new Error(
      "Google service account credentials are missing. Set GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY in environment."
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