import 'dotenv/config';

export const PORT = process.env.PORT || 4000;
export const LEADERBOARD_SERVICE_URL = process.env.LEADERBOARD_SERVICE_URL || 'http://localhost:5000';
export const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
export const RATE_LIMIT_TOKENS = process.env.RATE_LIMIT_TOKENS || '20';
export const RATE_LIMIT_INTERVAL_MS = process.env.RATE_LIMIT_INTERVAL_MS || '60000';
