import { getSheetsClient } from "./gsheets";
import {
  SHEET_A_ID,
  SHEET_B_ID,
  VAULTS,
  FIRST_DATA_ROW,
  LAST_COL,
  VaultConfig,
} from "./config";
import { parseUsdcAmount, timestampToDateKey, todayKey } from "./utils";

interface DayTotals {
  in: number;
  out: number;
}

async function getSheetAState(sheets: any, tab: string) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_A_ID,
    range: `'${tab}'!A${FIRST_DATA_ROW}:A1000`,
    valueRenderOption: "FORMATTED_VALUE",
  });
  const values: string[][] = res.data.values ?? [];
  if (values.length === 0) return { lastRow: null as number | null, lastDateKey: null as string | null };
  const lastRow = FIRST_DATA_ROW + values.length - 1;
  const lastDateKey = new Date(values[values.length - 1][0]).toISOString().slice(0, 10);
  return { lastRow, lastDateKey };
}

async function getSheetBAggregates(sheets: any, tab: string) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_B_ID,
    range: `'${tab}'!A2:G1000`,
  });
  const rows: string[][] = res.data.values ?? [];
  const totals = new Map<string, DayTotals>();

  for (const row of rows) {
    const [timestamp, , , direction, , , amountRaw] = row;
    if (!timestamp || !direction || !amountRaw) continue;
    const amount = parseUsdcAmount(amountRaw);
    if (amount === null) continue; // skip non-USDC transactions

    const key = timestampToDateKey(timestamp);
    const entry = totals.get(key) ?? { in: 0, out: 0 };
    const dir = direction.trim().toUpperCase();
    if (dir === "INFLOW") entry.in += amount;
    else if (dir === "OUTFLOW") entry.out += amount;
    else continue;
    totals.set(key, entry);
  }
  return totals;
}

async function getSheetIdByTitle(sheets: any, spreadsheetId: string, title: string): Promise<number> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const sheet = meta.data.sheets.find((s: any) => s.properties.title === title);
  if (!sheet) throw new Error(`Tab "${title}" not found`);
  return sheet.properties.sheetId;
}

async function appendFormulaRow(sheets: any, sheetId: number, destRow: number, srcRow: number) {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_A_ID,
    requestBody: {
      requests: [
        {
          copyPaste: {
            source: {
              sheetId,
              startRowIndex: srcRow - 1,
              endRowIndex: srcRow,
              startColumnIndex: 0,
              endColumnIndex: LAST_COL,
            },
            destination: {
              sheetId,
              startRowIndex: destRow - 1,
              endRowIndex: destRow,
              startColumnIndex: 0,
              endColumnIndex: LAST_COL,
            },
            pasteType: "PASTE_NORMAL",
          },
        },
      ],
    },
  });
}

async function writeCapital(sheets: any, tab: string, row: number, capIn: number, capOut: number) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_A_ID,
    range: `'${tab}'!D${row}:E${row}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[capIn, capOut]] },
  });
}

async function writeDateAndCapital(
  sheets: any,
  tab: string,
  row: number,
  dateKey: string,
  capIn: number,
  capOut: number
) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_A_ID,
    range: `'${tab}'!A${row}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[dateKey]] },
  });
  await writeCapital(sheets, tab, row, capIn, capOut);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function syncVault(vault: VaultConfig, dryRun: boolean) {
  const sheets = getSheetsClient();

  const [{ lastRow, lastDateKey }, totals, sheetATabId] = await Promise.all([
    getSheetAState(sheets, vault.sheetATab),
    getSheetBAggregates(sheets, vault.sheetBTab),
    getSheetIdByTitle(sheets, SHEET_A_ID, vault.sheetATab),
  ]);

  if (lastRow === null || lastDateKey === null) {
    console.log(`[${vault.name}] No existing rows found in Sheet A — skipping (needs a manually seeded first row).`);
    return;
  }

  const today = todayKey();
  let cursorRow = lastRow;
  const alreadyHandledToday = lastDateKey === today;

  // If the last row already IS today's row, recompute and overwrite it in place.
  if (alreadyHandledToday) {
    const t = totals.get(today);
    if (t && (t.in !== 0 || t.out !== 0)) {
      console.log(`${dryRun ? "[DRY-RUN] " : ""}[${vault.name}] Update today's row (row ${cursorRow}, ${today}) -> in=${round2(t.in)} out=${round2(t.out)}`);
      if (!dryRun) await writeCapital(sheets, vault.sheetATab, cursorRow, round2(t.in), round2(t.out));
    }
  }

  // Every other date strictly after the last frozen row gets appended, in order.
  const datesToAppend = [...totals.keys()]
    .filter((k) => k > lastDateKey)
    .filter((k) => !(alreadyHandledToday && k === today))
    .sort();

  for (const key of datesToAppend) {
    const t = totals.get(key)!;
    if (t.in === 0 && t.out === 0) continue; // skip zero-movement days

    const destRow = cursorRow + 1;
    console.log(`${dryRun ? "[DRY-RUN] " : ""}[${vault.name}] Append row ${destRow} for ${key} -> in=${round2(t.in)} out=${round2(t.out)}`);
    if (!dryRun) {
      await appendFormulaRow(sheets, sheetATabId, destRow, cursorRow);
      await writeDateAndCapital(sheets, vault.sheetATab, destRow, key, round2(t.in), round2(t.out));
    }

    cursorRow = destRow;
  }
}

export async function runSyncAll(dryRun: boolean) {
  for (const vault of VAULTS) {
    try {
      await syncVault(vault, dryRun);
    } catch (e: any) {
      console.error(`[${vault.name}] ERROR:`, e.message);
    }
  }
}

if (require.main === module) {
  const dryRun = process.argv.includes("--dry-run");
  runSyncAll(dryRun)
    .then(() => console.log(dryRun ? "Dry run complete (no changes written)." : "Sync complete."))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
