import redis from '../redisClient.js';
import { RATE_LIMIT_TOKENS, RATE_LIMIT_INTERVAL_MS } from '../config.js';

function rateLimiter() {
  const tokens = parseInt(RATE_LIMIT_TOKENS || '20', 10);
  const interval = parseInt(RATE_LIMIT_INTERVAL_MS || '60000', 10);

  return async function (req, res, next) {
    try {
      const key = `rate_limit:${req.ip}`;
      // Lua-like token bucket: use INCR and EXPIRE
      const cur = await redis.incr(key);
      if (cur === '1' || cur === 1) {
        await redis.pExpire(key, interval);
      }
      // cur might be string depending on client adapter
      const curNum = typeof cur === 'string' ? parseInt(cur, 10) : cur;
      if (curNum > tokens) {
        return res.status(429).json({ error: 'Rate limit exceeded' });
      }
      next();
    } catch (err) {
      console.error('RateLimiter error', err.message);
      // if Redis fails, allow request but log
      next();
    }
  };
}

export default rateLimiter;
