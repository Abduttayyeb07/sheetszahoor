import "./env";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const SHEET_A_ID = requireEnv("SHEET_A_ID");

export interface VaultConfig {
  name: string;
  // The CosmWasm vault contract address — emits "wasm-vault_deposit" events
  // for inflows (subscriptions).
  contractAddress: string;
  // The vault's treasury/funds-manager address — sends "ibc_transfer" events
  // out to the bridge for outflows (redemptions). Confirmed via each
  // deposit's "funds_manager" attribute, not the same as contractAddress.
  treasuryAddress: string;
  sheetATab: string;
}

export const VAULTS: VaultConfig[] = [
  {
    name: "Stablecoin Yield Vault",
    contractAddress: "zig1h3au5n3lsyqm32ydz3usgy7r9z7wpx4gttcxmypfecz29adtu64svluenp",
    treasuryAddress: "zig1c7ltk2w9x6nqdkzuv2xp3pcxuqnwcya9ackdxj",
    sheetATab: "Stablecoin_Yield_Vault",
  },
  {
    name: "USDC Opportunistic Credit Vault",
    contractAddress: "zig1mayx7wkzensav40j3qc8c5lh6s884jlhsu0c0js058t4u9xcg0mql58gkq",
    treasuryAddress: "zig1jr7wj9rhrqwndt0h63zntffagzrl29dkcrwyl6",
    sheetATab: "Opportunistic_Credit_Vault",
  },
  {
    name: "USDC Core Income Vault",
    contractAddress: "zig1m526fltgrf70qdsufx9k9fdl4x07usjlydcn32jn83fs6za9c5cswd9grk",
    treasuryAddress: "zig1vl2ykaf64elut2zluqe6jxz3adhmw7rjuhsmvt",
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
