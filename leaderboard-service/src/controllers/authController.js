import express from 'express';
const router = express.Router();
import { signToken } from '../utils/jwt.js';
import * as LeaderboardService from '../services/leaderboardService.js';
import redis from '../redisClient.js';

// POST /auth/register
// Body: { user_id, name, region?, initialScore? }
router.post('/register', async (req, res) => {
  try {
    const { user_id, name, region, initialScore = 0 } = req.body;
      if (!user_id || !name || !region) return res.status(400).json({ error: 'invalid_payload', message: 'user_id, name and region are required' });
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
    if (!user_id || !name) return res.status(400).json({ error: 'invalid_payload' });
    // prefer region from body; fallback to Redis stored user metadata if available
    let resolvedRegion = region;
    if (!resolvedRegion) {
      try {
        const r = await redis.hGet(`user:${user_id}`, 'region');
        if (r) resolvedRegion = r;
      } catch (e) {
        // ignore redis errors here
      }
    }
    const token = signToken({ user_id: String(user_id), name: String(name), region: String(resolvedRegion || 'GLOBAL') });
    return res.json({ token });
  } catch (err) {
    console.error('login error', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'internal' });
  }
});

export default router;
