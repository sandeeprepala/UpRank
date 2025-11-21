import { createClient } from 'redis';
import 'dotenv/config';

const client = createClient({ url: process.env.REDIS_URL });

client.on('error', (err) => console.error('Redis Error:', err));

await client.connect();

export default client;
