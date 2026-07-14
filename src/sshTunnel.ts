import "./env";
import { createTunnel } from "tunnel-ssh";
import type { Server } from "net";
import * as fs from "fs";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function getSshAuth() {
  const keyPath = process.env.SSH_KEY_PATH;
  if (keyPath) {
    return {
      privateKey: fs.readFileSync(keyPath),
      passphrase: process.env.SSH_PASSPHRASE || undefined,
    };
  }
  return { password: requireEnv("SSH_PASSWORD") };
}

let tunnelPromise: Promise<number> | null = null;

// Opens (once) an SSH tunnel to the ClickHouse host and returns the local
// port that forwards to CH_HOST:CH_PORT through it.
export function getTunnelLocalPort(): Promise<number> {
  if (tunnelPromise) return tunnelPromise;

  tunnelPromise = (async () => {
    const sshHost = process.env.SSH_HOST ?? requireEnv("CH_HOST");
    const sshPort = Number(process.env.SSH_PORT ?? 22);
    const sshUser = requireEnv("SSH_USER");
    const auth = getSshAuth();

    const chHost = requireEnv("CH_HOST");
    const chPort = Number(requireEnv("CH_PORT"));

    const [server] = await createTunnel(
      { autoClose: false, reconnectOnError: false },
      { port: 0 },
      { host: sshHost, port: sshPort, username: sshUser, ...auth },
      { dstAddr: chHost, dstPort: chPort }
    );

    const address = (server as Server).address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to determine local tunnel port");
    }
    return address.port;
  })();

  return tunnelPromise;
}
