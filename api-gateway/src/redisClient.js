import { createClient } from 'redis';
import 'dotenv/config';
import { REDIS_URL } from './config.js';

if (!REDIS_URL && !process.env.REDIS_URL) {
  throw new Error('REDIS_URL environment variable is not set');
}

const client = createClient({ url: REDIS_URL || process.env.REDIS_URL });
client.on('error', (err) => console.log('Redis Client Error', err));
client.connect().catch((e) => console.error('Redis connect error', e && e.message ? e.message : e));

export default client;
