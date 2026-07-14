import "./env";
import { createClient, ClickHouseClient } from "@clickhouse/client";
import { getTunnelLocalPort } from "./sshTunnel";

let client: ClickHouseClient | null = null;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

const TABLE = process.env.CH_TABLE ?? "core_transactions";

async function getClient(): Promise<ClickHouseClient> {
  if (client) return client;

  const localPort = await getTunnelLocalPort();
  client = createClient({
    url: `http://127.0.0.1:${localPort}`,
    username: requireEnv("CH_USER"),
    password: requireEnv("CH_PASSWORD"),
    database: requireEnv("CH_DATABASE"),
  });
  return client;
}

export interface VaultDayTotal {
  vault_address: string;
  date: string; // YYYY-MM-DD
  usdc_in: number;
  usdc_out: number;
}

// Sums USDC deposit (capital in) and approved-redemption (capital out)
// amounts per vault per calendar day, for every day in [from, to] inclusive.
// Mirrors the deposit/asset_amount and approve_request/asset_amount branches
// of the original query; the share-token (vault_token) branches are dropped
// since Sheet A only tracks USDC capital movements.
export async function getVaultDayTotals(
  addresses: string[],
  from: string,
  to: string
): Promise<VaultDayTotal[]> {
  const ch = await getClient();

  const addressParams: Record<string, string> = {};
  addresses.forEach((addr, i) => {
    addressParams[`addr${i}`] = addr;
  });
  const addressMatchSql = addresses.map((_, i) => `has(involved_addresses, {addr${i}:String})`).join(" OR ");
  const vaultMultiIf =
    addresses.map((_, i) => `has(involved_addresses, {addr${i}:String}), {addr${i}:String}`).join(",\n      ") +
    ",\n      'Unknown'";

  const query = `
    WITH movements AS (
      SELECT
        multiIf(
          ${vaultMultiIf}
        ) AS vault_address,
        toDate(time) AS date,
        toFloat64OrZero(extract(events, '"asset_amount","value":"([0-9]+)"')) / 1000000 AS usdc_in,
        CAST(0 AS Float64) AS usdc_out
      FROM ${TABLE}
      WHERE (${addressMatchSql})
        AND toDate(time) BETWEEN {from:Date} AND {to:Date}
        AND position(events, '"method","value":"deposit"') > 0

      UNION ALL

      SELECT
        multiIf(
          ${vaultMultiIf}
        ) AS vault_address,
        toDate(time) AS date,
        CAST(0 AS Float64) AS usdc_in,
        toFloat64OrZero(extract(events, '"asset_amount","value":"([0-9]+)"')) / 1000000 AS usdc_out
      FROM ${TABLE}
      WHERE (${addressMatchSql})
        AND toDate(time) BETWEEN {from:Date} AND {to:Date}
        AND position(events, '"method","value":"approve_request"') > 0
    )
    SELECT
      vault_address,
      date,
      sum(usdc_in) AS usdc_in,
      sum(usdc_out) AS usdc_out
    FROM movements
    WHERE vault_address != 'Unknown'
    GROUP BY vault_address, date
    ORDER BY vault_address, date
  `;

  const result = await ch.query({
    query,
    query_params: { ...addressParams, from, to },
    format: "JSONEachRow",
  });

  return result.json<VaultDayTotal>();
}
