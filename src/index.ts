import { runSyncAll } from "./sync";
import { POLL_INTERVAL_MS } from "./config";

async function tick() {
  console.log(`\n[${new Date().toISOString()}] Running sync...`);
  try {
    await runSyncAll(false);
  } catch (e) {
    console.error("Sync run failed:", e);
  }
}

async function main() {
  await tick();
  setInterval(tick, POLL_INTERVAL_MS);
  console.log(`Scheduler started — polling every ${POLL_INTERVAL_MS / 60000} minutes.`);
}

main();
