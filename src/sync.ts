import { getSheetsClient } from "./gsheets";
import { getVaultDayTotals, VaultDayTotal } from "./db";
import { SHEET_A_ID, VAULTS, FIRST_DATA_ROW, LAST_COL, VaultConfig } from "./config";
import { todayKey, round2 } from "./utils";

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

async function getSheetIdByTitle(sheets: any, spreadsheetId: string, title: string): Promise<number> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const sheet = meta.data.sheets.find((s: any) => s.properties.title === title);
  if (!sheet) throw new Error(`Tab "${title}" not found`);
  return sheet.properties.sheetId;
}

async function appendFormattedRow(sheets: any, sheetId: number, destRow: number, srcRow: number) {
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

interface VaultState {
  vault: VaultConfig;
  lastRow: number;
  lastDateKey: string;
  sheetATabId: number;
}

export async function runSyncAll(dryRun: boolean) {
  const sheets = getSheetsClient();

  const states: VaultState[] = [];
  for (const vault of VAULTS) {
    const [{ lastRow, lastDateKey }, sheetATabId] = await Promise.all([
      getSheetAState(sheets, vault.sheetATab),
      getSheetIdByTitle(sheets, SHEET_A_ID, vault.sheetATab),
    ]);
    if (lastRow === null || lastDateKey === null) {
      console.log(`[${vault.name}] No existing rows found in Sheet A — skipping (needs a manually seeded first row).`);
      continue;
    }
    states.push({ vault, lastRow, lastDateKey, sheetATabId });
  }
  if (states.length === 0) return;

  const today = todayKey();
  const from = states.map((s) => s.lastDateKey).sort()[0]; // earliest lastDateKey across vaults
  const rows = await getVaultDayTotals(
    states.map((s) => s.vault.address),
    from,
    today
  );

  const byVault = new Map<string, VaultDayTotal[]>();
  for (const row of rows) {
    const list = byVault.get(row.vault_address) ?? [];
    list.push(row);
    byVault.set(row.vault_address, list);
  }

  for (const state of states) {
    const { vault, sheetATabId } = state;
    let { lastRow, lastDateKey } = state;
    const vaultRows = byVault.get(vault.address) ?? [];
    const totals = new Map(vaultRows.map((r) => [r.date, { in: Number(r.usdc_in), out: Number(r.usdc_out) }]));

    const alreadyHandledToday = lastDateKey === today;
    if (alreadyHandledToday) {
      const t = totals.get(today);
      if (t && (t.in !== 0 || t.out !== 0)) {
        console.log(
          `${dryRun ? "[DRY-RUN] " : ""}[${vault.name}] Update today's row (row ${lastRow}, ${today}) -> in=${round2(t.in)} out=${round2(t.out)}`
        );
        if (!dryRun) await writeCapital(sheets, vault.sheetATab, lastRow, round2(t.in), round2(t.out));
      }
    }

    const datesToAppend = [...totals.keys()]
      .filter((k) => k > lastDateKey)
      .filter((k) => !(alreadyHandledToday && k === today))
      .sort();

    let cursorRow = lastRow;
    for (const key of datesToAppend) {
      const t = totals.get(key)!;
      if (t.in === 0 && t.out === 0) continue; // skip zero-movement days

      const destRow = cursorRow + 1;
      console.log(
        `${dryRun ? "[DRY-RUN] " : ""}[${vault.name}] Append row ${destRow} for ${key} -> in=${round2(t.in)} out=${round2(t.out)}`
      );
      if (!dryRun) {
        await appendFormattedRow(sheets, sheetATabId, destRow, cursorRow);
        await writeDateAndCapital(sheets, vault.sheetATab, destRow, key, round2(t.in), round2(t.out));
      }
      cursorRow = destRow;
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
