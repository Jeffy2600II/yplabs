import { google } from "googleapis";

/**
 * Lazily build and validate Google JWT auth.
 * Throws a descriptive error if required envs are missing.
 */
function getGoogleEnvOrThrow() {
  const email = process.env.GOOGLE_CLIENT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY;
  if (!email || !key) {
    throw new Error(
      "Google credentials missing. Set GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY in env."
    );
  }
  return { email, key };
}

/**
 * Export a function that returns auth. Avoid constructing at import-time
 * if environment variables may be missing during build.
 */
export function getAuth() {
  const { email, key } = getGoogleEnvOrThrow();
  
  return new google.auth.JWT({
    email,
    key: key.replace(/\\n/g, "\n"),
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive",
    ],
  });
}