import { getClient, getQueueKey } from '../redisClient.js';

export async function enqueue(event) {
  const region = event.region || 'GLOBAL';
  const key = getQueueKey(region);
  const client = await getClient(region);
  // push as JSON to a reliable list (LPUSH) - worker will BRPOP on this region's queue
  await client.lPush(key, JSON.stringify(event));
  console.log("Enqueued event:", event, '->', key);
}
