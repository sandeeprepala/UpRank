import client from '../redisClient.js';

const QUEUE_KEY = 'queue:scores';

export async function enqueue(event) {
  // push as JSON to a reliable list (LPUSH) - worker will BRPOP
  await client.lPush(QUEUE_KEY, JSON.stringify(event));
  console.log("Enqueued event:", event);
}
