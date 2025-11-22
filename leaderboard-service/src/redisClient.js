import { createClient } from 'redis';
import 'dotenv/config';

// Create Redis client with reconnect strategy and richer logging to handle ECONNRESET
const client = createClient({
  url: process.env.REDIS_URL,
  socket: {
    reconnectStrategy: (retries) => Math.min(retries * 50, 2000),
  },
});

client.on('error', (err) => console.error('Redis Error:', err));
client.on('connect', () => console.log('Redis connecting...'));
client.on('ready', () => console.log('Redis ready'));
client.on('end', () => console.log('Redis connection closed'));
client.on('reconnecting', () => console.log('Redis reconnecting'));

try {
	await client.connect();
} catch (e) {
	console.error('Redis connect error', e && e.message ? e.message : e);
	// don't throw; allow app to continue and handle redis errors at runtime
}

export default client;
