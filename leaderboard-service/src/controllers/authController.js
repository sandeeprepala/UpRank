import express from 'express';
const router = express.Router();
import { signToken } from '../utils/jwt.js';
import * as LeaderboardService from '../services/leaderboardService.js';
import redis from '../redisClient.js';
import { getShard, shards } from '../shardRouter.js';

// POST /auth/register
// Body: { user_id, name, region?, initialScore? }
router.post('/register', async (req, res) => {
  try {
    const { user_id, name, region, initialScore = 0 } = req.body;
    if (!user_id || !name || !region) return res.status(400).json({ error: 'invalid_payload', message: 'user_id, name and region are required' });

    // Check DB (region-specific) for existing user
    try {
      const db = getShard(region);
      console.log('Checking DB for user_id:', user_id,db);
      const { rows } = await db.query('SELECT user_id FROM leaderboard WHERE user_id = $1', [user_id]);
      if (rows.length > 0) {
        return res.status(409).json({ error: 'user_exists', message: 'User already exists in DB' });
      }
    } catch (e) {
      console.error('DB check error during register:', e && e.message ? e.message : e);
      return res.status(500).json({ error: 'internal' });
    }

    const result = await LeaderboardService.createUser({ user_id, name, region, initialScore });
    const token = signToken({ user_id: String(user_id), name: String(name), region: String(region) });
    return res.json({ ok: true, token, result });
  } catch (err) {
    console.error('register error', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'internal' });
  }
});

// POST /auth/login
// Body: { user_id, name }
router.post('/login', async (req, res) => {
  try {
    const { user_id, name, region } = req.body;
    if (!user_id || !name || !region) return res.status(400).json({ error: 'invalid_payload', message: 'user_id, name and region are required' });

    // Check Redis first in the given region
    function zkey(r) { return `leaderboard:${r || 'GLOBAL'}`; }
    try {
      const storedName = await redis.hGet(`user:${user_id}`, 'name');
      const memberScore = await redis.zScore(zkey(region), String(user_id));
      if (memberScore != null && storedName && String(storedName) === String(name)) {
        // Redis has the user in this region and name matches
        const token = signToken({ user_id: String(user_id), name: String(name), region: String(region) });
        return res.json({ token });
      }
    } catch (e) {
      console.error('Redis check error during login:', e && e.message ? e.message : e);
      // proceed to DB lookup
    }

    // Redis failed to validate; check region DB directly
    try {
      const db = getShard(region);
      const { rows } = await db.query('SELECT name, score FROM leaderboard WHERE user_id = $1', [user_id]);
      if (rows.length === 0) {
        return res.status(404).json({ error: 'user_not_found', message: 'Please register' });
      }
      const dbRow = rows[0];
      if (String(dbRow.name) !== String(name)) return res.status(401).json({ error: 'invalid_credentials' });

      // Backfill Redis so future logins are fast
      try {
        await redis.hSet(`user:${user_id}`, { name: dbRow.name, region: region, score: String(dbRow.score), updated_at: new Date().toISOString() });
        await redis.zAdd(zkey(region), [{ score: Number(dbRow.score), value: String(user_id) }]);
        // also ensure GLOBAL bookmark exists
        await redis.zAdd(zkey('GLOBAL'), [{ score: Number(dbRow.score), value: String(user_id) }]);
      } catch (e) {
        console.error('Redis backfill error during login:', e && e.message ? e.message : e);
      }

      const token = signToken({ user_id: String(user_id), name: String(name), region: String(region) });
      return res.json({ token });
    } catch (e) {
      console.error('DB lookup error during login:', e && e.message ? e.message : e);
      return res.status(500).json({ error: 'internal' });
    }
  } catch (err) {
    console.error('login error', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'internal' });
  }
});

export default router;
