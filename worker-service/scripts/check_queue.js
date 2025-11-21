import { createClient } from 'redis';
import 'dotenv/config';
import { QUEUE_KEY } from '../src/config.js';

const REDIS_URL = process.env.REDIS_URL;
if (!REDIS_URL) {
  console.error('REDIS_URL not set. Set it in .env or the environment.');
  process.exit(2);
}

const client = createClient({ url: REDIS_URL });
client.on('error', (err) => console.error('Redis Client Error', err));

(async function main() {
  try {
    await client.connect();
    console.log('Connected to Redis at', REDIS_URL);
    const key = QUEUE_KEY || 'queue:scores';
    const len = await client.lLen(key);
    console.log(`Queue '${key}' length:`, len);
    if (len > 0) {
      // show up to first 20 items (most recent at head if LPUSH used)
      const max = Math.min(len - 1, 19);
      const items = await client.lRange(key, 0, max);
      console.log(`Showing up to ${items.length} items from '${key}':`);
      items.forEach((it, idx) => {
        let parsed = it;
        try { parsed = JSON.parse(it); } catch (e) { /* keep raw */ }
        console.log(`#${idx + 1}:`, parsed);
      });
    } else {
      console.log('Queue is empty.');
    }
  } catch (err) {
    console.error('Error checking queue:', err && err.message ? err.message : err);
    process.exitCode = 1;
  } finally {
    try { await client.quit(); } catch (e) {}
  }
})();
