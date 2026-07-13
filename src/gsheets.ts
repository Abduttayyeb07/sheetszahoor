import "./env";
import { google, sheets_v4 } from "googleapis";

let client: sheets_v4.Sheets | null = null;

function loadCredentials() {
  const inlineJson = process.env.GOOGLE_CREDENTIALS_JSON;
  if (inlineJson) return JSON.parse(inlineJson);

  const path = process.env.GOOGLE_CREDENTIALS_PATH;
  if (!path) {
    throw new Error(
      "Set either GOOGLE_CREDENTIALS_JSON (inline service account JSON) or GOOGLE_CREDENTIALS_PATH (path to the JSON key file)."
    );
  }
  return path;
}

export function getSheetsClient(): sheets_v4.Sheets {
  if (client) return client;

  const credentials = loadCredentials();
  const authOptions =
    typeof credentials === "string"
      ? { keyFile: credentials, scopes: ["https://www.googleapis.com/auth/spreadsheets"] }
      : { credentials, scopes: ["https://www.googleapis.com/auth/spreadsheets"] };

  const auth = new google.auth.GoogleAuth(authOptions);
  client = google.sheets({ version: "v4", auth });
  return client;
}
