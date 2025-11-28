import { createClient } from 'redis';
import 'dotenv/config';

// Support per-region REDIS_URLs: REDIS_URL_ASIA, REDIS_URL_EU, REDIS_URL_NA, REDIS_URL_GLOBAL
const REGION_ENV_MAP = {
  ASIA: process.env.REDIS_URL_ASIA,
  EU: process.env.REDIS_URL_EU,
  NA: process.env.REDIS_URL_NA,
  GLOBAL: process.env.REDIS_URL_GLOBAL || process.env.REDIS_URL,
};

const clients = {};

function makeClient(url) {
  const c = createClient({
    url,
    socket: { reconnectStrategy: (retries) => Math.min(retries * 50, 2000) },
  });
  c.on('error', (err) => console.error('Redis Error:', err));
  c.on('connect', () => console.log('Redis connecting...'));
  c.on('ready', () => console.log('Redis ready'));
  c.on('end', () => console.log('Redis connection closed'));
  c.on('reconnecting', () => console.log('Redis reconnecting'));
  return c;
}

async function connectClientIfNeeded(region) {
  const key = String(region || 'GLOBAL').toUpperCase();
  if (clients[key]) return clients[key];
  const url = REGION_ENV_MAP[key] || process.env.REDIS_URL;
  if (!url) {
    throw new Error(`No REDIS URL configured for region ${key} and no fallback REDIS_URL`);
  }
  const c = makeClient(url);
  clients[key] = c;
  try {
    await c.connect();
  } catch (e) {
    console.error('Redis connect error for', key, e && e.message ? e.message : e);
  }
  return c;
}

// default global client convenience
const defaultClientPromise = connectClientIfNeeded('GLOBAL');

function getQueueKey(region) {
  const r = String(region || 'GLOBAL').toUpperCase();
  return `queue:scores:${r.toLowerCase()}`;
}

function getZKey(region) {
  return `leaderboard:${String(region || 'GLOBAL')}`;
}

export { connectClientIfNeeded as getClient, getQueueKey, getZKey, defaultClientPromise };
