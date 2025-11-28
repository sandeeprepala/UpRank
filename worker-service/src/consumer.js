import { getClient, getQueueKey } from './redisClient.js';
import { upsertScore } from './db.js';

let running = true;

// simple sleep
const delay = (ms) => new Promise(res => setTimeout(res, ms));

// Regions to consume. Can be overridden by env `REGIONS` (comma-separated)
const REGIONS = (process.env.REGIONS || 'ASIA,EU,NA,GLOBAL').split(',').map(r => String(r).trim().toUpperCase());

// backpressure thresholds (shared)
const HIGH = parseInt(process.env.WORKER_BACKPRESSURE_HIGH || '100000', 10);
const MEDIUM = parseInt(process.env.WORKER_BACKPRESSURE_MEDIUM || '50000', 10);

async function consumeRegion(region) {
  const client = await getClient(region);
  const queueKey = getQueueKey(region);
  console.log(`Starting consumer for region=${region} queue=${queueKey}`);

  while (running) {
    try {
      // Backpressure check per-region
      try {
        const qlen = await client.lLen(queueKey);
        if (qlen >= HIGH) {
          console.warn(`${region} queue very large (${qlen}), backing off`);
          await delay(5000);
          continue;
        } else if (qlen >= MEDIUM) {
          console.warn(`${region} queue large (${qlen}), slowing consumption`);
          await delay(2000);
        }
      } catch (e) {
        // ignore lLen errors and continue
      }

      // block for 5 seconds waiting for new item
      const res = await client.brPop(queueKey, 5);
      if (res) {
        const raw = Array.isArray(res) ? res[1] : res.element;
        const item = JSON.parse(raw);
        console.log(`Worker received [${region}]:`, item);

        // write to postgres: always write to item's region and also to GLOBAL
        try {
          await upsertScore(item);
        } catch (e) {
          console.error('Failed upsert to region DB:', e && e.message ? e.message : e, 'item=', item);
        }

        // duplicate to GLOBAL to keep a global copy (skip if already GLOBAL)
        if (!item.region || String(item.region).toUpperCase() !== 'GLOBAL') {
          const globalItem = { ...item, region: 'GLOBAL' };
          try {
            await upsertScore(globalItem);
            console.log(`Also upserted to GLOBAL for user ${item.user_id}`);
          } catch (e) {
            console.error('Failed upsert to GLOBAL DB:', e && e.message ? e.message : e, 'item=', globalItem);
          }
        }
      }

    } catch (err) {
      console.error(`Worker error [${region}]:`, err.message || err);
      await delay(1000); // wait and try again
    }
  }

  // on shutdown for this client
  try { await client.quit(); } catch (e) {}
}

async function consumeLoop() {
  // start consumers for every configured region
  const tasks = REGIONS.map(r => consumeRegion(r));
  await Promise.all(tasks);
}

function stop() {
  running = false;
}

process.on('SIGINT', () => {
  console.log("Worker shutting down...");
  stop();
});
process.on('SIGTERM', () => {
  console.log("Worker shutting down...");
  stop();
});

export { consumeLoop, stop };
