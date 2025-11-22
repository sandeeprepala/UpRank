import express from 'express';
const router = express.Router();
import * as LeaderboardService from '../services/leaderboardService.js';
import redis from '../redisClient.js';

// Rate limit configuration (can be overridden with env vars)
const USER_RATE_LIMIT_COUNT = parseInt(process.env.USER_RATE_LIMIT_COUNT || '5', 10); // per window
const USER_RATE_LIMIT_WINDOW = parseInt(process.env.USER_RATE_LIMIT_WINDOW || '60', 10); // seconds
const REGION_RATE_LIMIT_PER_SEC = parseInt(process.env.REGION_RATE_LIMIT_PER_SEC || '20000', 10);
const QUEUE_REJECT_LENGTH = parseInt(process.env.QUEUE_REJECT_LENGTH || '100000', 10);
const QUEUE_KEY = 'queue:scores';

async function checkUserRate(userId) {
  // token-bucket per-user: capacity = USER_RATE_LIMIT_COUNT, refill = capacity / window (tokens/sec)
  const key = `tb:user:${userId}`;
  const capacity = USER_RATE_LIMIT_COUNT;
  const refillPerSec = USER_RATE_LIMIT_COUNT / Math.max(1, USER_RATE_LIMIT_WINDOW);
  const { allowed, remaining, retryAfter } = await runTokenBucket(key, capacity, refillPerSec, 1);
  return { allowed, remaining, retryAfter };
}

async function checkRegionRate(region) {
  // token-bucket per-region: region limit is defined as tokens per second
  const r = String(region || 'GLOBAL').toUpperCase();
  const key = `tb:region:${r}`;
  const capacity = REGION_RATE_LIMIT_PER_SEC; // allow bursting up to this many
  const refillPerSec = REGION_RATE_LIMIT_PER_SEC; // refill rate (tokens/sec)
  const { allowed, remaining, retryAfter } = await runTokenBucket(key, capacity, refillPerSec, 1);
  return { allowed, remaining, retryAfter };
}

async function checkQueueLength() {
  try {
    return await redis.lLen(QUEUE_KEY);
  } catch (e) {
    return 0;
  }
}
import auth from '../middlewares/auth.js';

// Lua token-bucket script: KEYS[1], ARGV = [capacity, refillPerSec, requested, now_ms]
const TOKEN_BUCKET_LUA = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill = tonumber(ARGV[2])
local requested = tonumber(ARGV[3])
local now = tonumber(ARGV[4])
local vals = redis.call('HMGET', key, 'tokens', 'last')
local tokens = tonumber(vals[1])
local last = tonumber(vals[2])
if tokens == nil then tokens = capacity end
if last == nil then last = now end
local delta_ms = math.max(0, now - last)
local new_tokens = tokens + (delta_ms/1000.0) * refill
if new_tokens > capacity then new_tokens = capacity end
local allowed = 0
if new_tokens >= requested then
  new_tokens = new_tokens - requested
  allowed = 1
end
redis.call('HMSET', key, 'tokens', tostring(new_tokens), 'last', tostring(now))
local ttl_ms = math.ceil(1000 * math.max(1, capacity / math.max(0.000001, refill)))
redis.call('PEXPIRE', key, ttl_ms)
local remaining = new_tokens
local retry_after = 0
if allowed == 0 then
  -- time until at least 1 token is available
  retry_after = math.ceil((requested - new_tokens) / refill)
  if retry_after < 0 then retry_after = 0 end
end
return { allowed, tostring(remaining), retry_after }
`;

async function runTokenBucket(key, capacity, refillPerSec, tokensRequested = 1) {
  const now = Date.now();
  try {
    const res = await redis.eval(TOKEN_BUCKET_LUA, { keys: [key], arguments: [String(capacity), String(refillPerSec), String(tokensRequested), String(now)] });
    // res is [allowed, remaining, retry_after]
    const allowed = parseInt(res[0], 10) === 1;
    const remaining = parseFloat(res[1]) || 0;
    const retryAfter = parseInt(res[2], 10) || 0;
    return { allowed, remaining, retryAfter };
  } catch (e) {
    // On Redis/Lua errors, fail-open (allow) and log
    console.error('runTokenBucket error', e && e.message ? e.message : e);
    return { allowed: true, remaining: capacity, retryAfter: 0 };
  }
}


// POST /score/update
// POST /score/add  -> increments existing score by `delta`

// POST /score/create -> create new user with initial score if not exists
router.post('/create', auth, async (req, res) => {
  try {
    const { region, initialScore } = req.body;
    const { user_id, name } = req.user;
    if (!user_id || !region) return res.status(400).json({ error: 'invalid payload' });
    const result = await LeaderboardService.createUser({ user_id, name, region, initialScore});
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error(err && err.message ? err.message : err);
    res.status(500).json({ error: 'internal' });
  }
});

// POST /score/update
router.post('/update', auth, async (req, res) => {
  try {
    const {score } = req.body;
    const { user_id, name ,region} = req.user;
    if (!user_id || !region || typeof score !== 'number') return res.status(400).json({ error: 'invalid payload' });
    // Rate limiting checks (token-bucket)
    const userToken = await checkUserRate(user_id);
    if (!userToken.allowed) {
      return res.status(429).json({ error: 'rate_limited', retry_after: userToken.retryAfter || USER_RATE_LIMIT_WINDOW });
    }
    const regionToken = await checkRegionRate(region);
    if (!regionToken.allowed) {
      return res.status(429).json({ error: 'region_rate_limited', retry_after: regionToken.retryAfter || 1 });
    }
    const qlen = await checkQueueLength();
    if (qlen > QUEUE_REJECT_LENGTH) {
      return res.status(429).json({ error: 'queue_full', queue_length: qlen });
    }
    await LeaderboardService.updateScore({ user_id, name, region, score });
    res.json({ ok: true });
  } catch (err) {
    console.error(err && err.message ? err.message : err);
    res.status(500).json({ error: 'internal' });
  }
});

// POST /score/add -> increment by delta
router.post('/add', auth, async (req, res) => {
  try {
    const { delta } = req.body;
    const { user_id, name, region } = req.user;
    if (!user_id || !region || typeof delta !== 'number') return res.status(400).json({ error: 'invalid payload' });
    // Rate limiting checks (token-bucket)
    const userToken = await checkUserRate(user_id);
    if (!userToken.allowed) {
      return res.status(429).json({ error: 'rate_limited', retry_after: userToken.retryAfter || USER_RATE_LIMIT_WINDOW });
    }
    const regionToken = await checkRegionRate(region);
    if (!regionToken.allowed) {
      return res.status(429).json({ error: 'region_rate_limited', retry_after: regionToken.retryAfter || 1 });
    }
    const qlen = await checkQueueLength();
    if (qlen > QUEUE_REJECT_LENGTH) {
      return res.status(429).json({ error: 'queue_full', queue_length: qlen });
    }
    await LeaderboardService.addScore({ user_id, name, region, delta });
    res.json({ ok: true });
  } catch (err) {
    console.error(err && err.message ? err.message : err);
    res.status(500).json({ error: 'internal' });
  }
});

// GET /top?region=ASIA&limit=100
router.get('/', async (req, res) => {
  try {
    const region = req.query.region || 'GLOBAL';
    const limit = parseInt(req.query.limit || '100', 10);
    const rows = await LeaderboardService.getTop(region, limit);
    res.json({ region, rows });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'internal' });
  }
});

// GET /rank/:userId?region=ASIA
router.get('/rank/:userId', async (req, res) => {
  try {
    const region = req.query.region || 'GLOBAL';
    const userId = req.params.userId;
    const result = await LeaderboardService.getRank(region, userId);
    res.json(result);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'internal' });
  }
});

// GET /around/:userId?region=ASIA&range=10
router.get('/around/:userId', async (req, res) => {
  try {
    const region = req.query.region || 'GLOBAL';
    const range = parseInt(req.query.range || '10', 10);
    const result = await LeaderboardService.getAround(region, req.params.userId, range);
    res.json(result);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'internal' });
  }
});

export default router;


