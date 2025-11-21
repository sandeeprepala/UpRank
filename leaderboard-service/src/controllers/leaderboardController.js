import express from 'express';
const router = express.Router();
import * as LeaderboardService from '../services/leaderboardService.js';
import auth from '../middlewares/auth.js';


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


