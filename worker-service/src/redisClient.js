
import { createClient } from 'redis';
import 'dotenv/config';

const REDIS_URL = process.env.REDIS_URL;

if (!REDIS_URL && !process.env.REDIS_URL) {
  throw new Error('REDIS_URL environment variable is not set');
}

// Create client with reconnect strategy and event hooks
const client = createClient({
  url: REDIS_URL || process.env.REDIS_URL,
  socket: {
    reconnectStrategy: (retries) => Math.min(retries * 50, 2000),
  },
});
client.on('error', (err) => console.log('Redis Client Error', err));
client.on('connect', () => console.log('Redis connecting...'));
client.on('ready', () => console.log('Redis ready'));
client.on('end', () => console.log('Redis connection closed'));
client.on('reconnecting', () => console.log('Redis reconnecting'));

// top-level await is allowed in ESM
try {
  await client.connect();
} catch (e) {
  console.error('Redis connect error', e && e.message ? e.message : e);
}

export default client;
// import {createClient} from "redis";
// import dotenv from "dotenv"
// dotenv.config()



// if (!process.env.REDIS_URL) {
//   throw new Error("REDIS_URL environment variable is not set");
// }

// const redisClient = createClient({
//   url: process.env.REDIS_URL, // change if using cloud
// });

// redisClient.on('error', (err) => console.log('Redis Client Error', err));

// await redisClient.connect(); 

// export default redisClient;


