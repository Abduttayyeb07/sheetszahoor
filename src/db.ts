import "./env";
import { createClient, ClickHouseClient } from "@clickhouse/client";
import { VaultConfig } from "./config";

let client: ClickHouseClient | null = null;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

const TABLE = process.env.CH_TABLE ?? "core_transactions";

function getClient(): ClickHouseClient {
  if (client) return client;

  client = createClient({
    url: `http://${requireEnv("CH_HOST")}:${requireEnv("CH_PORT")}`,
    username: requireEnv("CH_USER"),
    password: requireEnv("CH_PASSWORD"),
    database: requireEnv("CH_DATABASE"),
  });
  return client;
}

export interface DayTotal {
  date: string; // YYYY-MM-DD
  usdc_in: number;
  usdc_out: number;
}

// Sums USDC capital movements per calendar day, for one vault, over [from, to]
// inclusive. Two event shapes carry the real data:
//   - Inflows (subscriptions): a "wasm-vault_deposit" event on the vault
//     CONTRACT address, carrying an "asset_amount" attribute.
//   - Outflows (redemptions): an "ibc_transfer" event sent FROM the vault's
//     separate TREASURY/funds-manager address out to the bridge, carrying
//     sender/receiver/denom/amount attributes in that fixed order.
// (The original query's "request_redeem"/"approve_request" methods don't
// exist in this dataset — verified against real transactions.)
export async function getVaultDayTotals(vault: VaultConfig, from: string, to: string): Promise<DayTotal[]> {
  const ch = getClient();

  const query = `
    WITH movements AS (
      SELECT
        toDate(time) AS date,
        toFloat64OrZero(extract(events, '"asset_amount","value":"([0-9]+)"')) / 1000000 AS usdc_in,
        CAST(0 AS Float64) AS usdc_out
      FROM ${TABLE}
      WHERE has(involved_addresses, {contractAddress:String})
        AND toDate(time) BETWEEN {from:Date} AND {to:Date}
        AND position(events, concat('"_contract_address","value":"', {contractAddress:String}, '"},{"index":true,"key":"method","value":"deposit"')) > 0

      UNION ALL

      SELECT
        toDate(time) AS date,
        CAST(0 AS Float64) AS usdc_in,
        toFloat64OrZero(
          extract(
            events,
            concat(
              '"sender","value":"', {treasuryAddress:String}, '"},{"index":true,"key":"receiver","value":"[^"]*"},{"index":true,"key":"denom","value":"[^"]*"},{"index":true,"key":"amount","value":"([0-9]+)"'
            )
          )
        ) / 1000000 AS usdc_out
      FROM ${TABLE}
      WHERE has(involved_addresses, {treasuryAddress:String})
        AND toDate(time) BETWEEN {from:Date} AND {to:Date}
        AND position(events, '"type":"ibc_transfer"') > 0
        AND position(events, concat('"sender","value":"', {treasuryAddress:String}, '"},{"index":true,"key":"receiver"')) > 0
    )
    SELECT
      date,
      sum(usdc_in) AS usdc_in,
      sum(usdc_out) AS usdc_out
    FROM movements
    GROUP BY date
    ORDER BY date
  `;

  const result = await ch.query({
    query,
    query_params: {
      contractAddress: vault.contractAddress,
      treasuryAddress: vault.treasuryAddress,
      from,
      to,
    },
    format: "JSONEachRow",
  });

  return result.json<DayTotal>();
}
