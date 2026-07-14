import "./env";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const SHEET_A_ID = requireEnv("SHEET_A_ID");

export interface VaultConfig {
  name: string;
  address: string;
  sheetATab: string;
}

export const VAULTS: VaultConfig[] = [
  {
    name: "Stablecoin Yield Vault",
    address: "zig1h3au5n3lsyqm32ydz3usgy7r9z7wpx4gttcxmypfecz29adtu64svluenp",
    sheetATab: "Stablecoin_Yield_Vault",
  },
  {
    name: "USDC Opportunistic Credit Vault",
    address: "zig1mayx7wkzensav40j3qc8c5lh6s884jlhsu0c0js058t4u9xcg0mql58gkq",
    sheetATab: "Opportunistic_Credit_Vault",
  },
  {
    name: "USDC Core Income Vault",
    address: "zig1m526fltgrf70qdsufx9k9fdl4x07usjlydcn32jn83fs6za9c5cswd9grk",
    sheetATab: "Core_Income_Vault",
  },
];

// First data row in each Sheet A vault tab (row 10 is the header).
export const FIRST_DATA_ROW = 11;
// Columns A..L are the full row width (Date .. Yield Check); used when
// copying formulas + formatting down to a newly appended row.
export const LAST_COL = 12;

// Poll interval for the ongoing sync, in milliseconds.
export const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 60 * 60 * 1000);
