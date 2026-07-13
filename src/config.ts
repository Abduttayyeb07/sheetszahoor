import "./env";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const SHEET_A_ID = requireEnv("SHEET_A_ID");
export const SHEET_B_ID = requireEnv("SHEET_B_ID");

export interface VaultConfig {
  name: string;
  sheetBTab: string;
  sheetATab: string;
}

export const VAULTS: VaultConfig[] = [
  {
    name: "Stablecoin Yield Vault",
    sheetBTab: "Stablecoin Yield Vault",
    sheetATab: "Stablecoin_Yield_Vault",
  },
  {
    name: "USDC Opportunistic Credit Vault",
    sheetBTab: "USDC Opportunistic Credit Vault",
    sheetATab: "Opportunistic_Credit_Vault",
  },
  {
    name: "USDC Core Income Vault",
    sheetBTab: "USDC CORE income vault",
    sheetATab: "Core_Income_Vault",
  },
];

// Row in Sheet A where the "Date | Day# | ... | Capital In | Capital Out | ..." header lives.
export const HEADER_ROW = 10;
// First data row.
export const FIRST_DATA_ROW = 11;

// Column indices (1-based) in Sheet A data rows.
export const COL_DATE = 1; // A
export const COL_CAPITAL_IN = 4; // D
export const COL_CAPITAL_OUT = 5; // E
export const LAST_COL = 12; // L

// Poll interval for the ongoing sync, in milliseconds.
export const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 60 * 60 * 1000);
