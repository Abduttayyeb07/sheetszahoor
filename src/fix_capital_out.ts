import { getSheetsClient } from "./gsheets";
import { getVaultDayTotals } from "./db";
import { SHEET_A_ID, VAULTS } from "./config";

// One-off correction: rows below were written for real using the old,
// wrong outflow logic (any outbound treasury ibc_transfer). They must be
// recomputed with the fixed wasm-vault_redemption_requested-based query and
// have ONLY their Capital Out cell overwritten. Run once, then delete.
const ROWS_TO_FIX: { sheetATab: string; row: number; date: string }[] = [
  { sheetATab: "Stablecoin_Yield_Vault", row: 45, date: "2026-07-12" },
  { sheetATab: "Stablecoin_Yield_Vault", row: 46, date: "2026-07-13" },
  { sheetATab: "Opportunistic_Credit_Vault", row: 45, date: "2026-07-11" },
  { sheetATab: "Opportunistic_Credit_Vault", row: 46, date: "2026-07-13" },
  { sheetATab: "Opportunistic_Credit_Vault", row: 47, date: "2026-07-15" },
];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function main() {
  const sheets = getSheetsClient();

  for (const fix of ROWS_TO_FIX) {
    const vault = VAULTS.find((v) => v.sheetATab === fix.sheetATab);
    if (!vault) throw new Error(`Unknown vault tab: ${fix.sheetATab}`);

    const totals = await getVaultDayTotals(vault, fix.date, fix.date);
    const dayTotal = totals.find((t) => t.date === fix.date);
    const correctOut = dayTotal ? round2(Number(dayTotal.usdc_out)) : 0;

    console.log(`[${fix.sheetATab}] row ${fix.row} (${fix.date}): setting Capital Out -> ${correctOut}`);

    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_A_ID,
      range: `'${fix.sheetATab}'!E${fix.row}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[correctOut]] },
    });
  }

  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
