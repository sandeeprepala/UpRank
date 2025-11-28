import { getClient, getZKey } from '../redisClient.js';
import { enqueue } from '../queue/producer.js';
import { getShard } from '../shardRouter.js';

function normalizeRegion(r) {
  return String(r || 'GLOBAL').toUpperCase();
}

async function updateScore({ user_id, name, region, score }) {
  const now = new Date().toISOString();
  const r = normalizeRegion(region);
  const regionClient = await getClient(r);
  const globalClient = await getClient('GLOBAL');
  const regionKey = getZKey(r);
  const globalKey = getZKey('GLOBAL');

  await regionClient.zAdd(regionKey, [{ score: Number(score), value: String(user_id) }]);
  await globalClient.zAdd(globalKey, [{ score: Number(score), value: String(user_id) }]);
  await regionClient.hSet(`user:${user_id}`, { name: name || '', region: r, score: String(score), updated_at: now });

  await enqueue({ user_id, name, region: r, score, timestamp: now });
  if (r !== 'GLOBAL') {
    await enqueue({ user_id, name, region: 'GLOBAL', score, timestamp: now });
  }
  console.log('Updated score for:', user_id);
}

async function createUser({ user_id, name, region, initialScore }) {
  const now = new Date().toISOString();
  const r = normalizeRegion(region);
  const regionClient = await getClient(r);
  const globalClient = await getClient('GLOBAL');
  const regionKey = getZKey(r);
  const globalKey = getZKey('GLOBAL');

  let created = false;
  let card = null;

  const addedRegion = await regionClient.zAdd(regionKey, [{ score: Number(initialScore), value: String(user_id) }], { NX: true });
  if (addedRegion === 1 || addedRegion === '1') {
    created = true;
    card = { user_id: String(user_id), name: name || '', region: r, score: initialScore };
  }

  await globalClient.zAdd(globalKey, [{ score: Number(initialScore), value: String(user_id) }], { NX: true });
  await regionClient.hSet(`user:${user_id}`, { name: name || '', region: r, score: String(initialScore), updated_at: now });

  await enqueue({ user_id, name, region: r, score: initialScore, timestamp: now });
  if (r !== 'GLOBAL') {
    await enqueue({ user_id, name, region: 'GLOBAL', score: initialScore, timestamp: now });
  }

  if (!created) {
    const existingScoreStr = await regionClient.zScore(regionKey, String(user_id));
    const existingScore = existingScoreStr == null ? 0 : parseInt(existingScoreStr, 10);
    const existingName = await regionClient.hGet(`user:${user_id}`, 'name');
    const existingRegion = await regionClient.hGet(`user:${user_id}`, 'region');
    card = {
      user_id: String(user_id),
      name: existingName || name || '',
      region: existingRegion || r,
      score: existingScore,
    };
  }
  return { created, card };
}

async function getTop(region, limit = 100) {
  const r = normalizeRegion(region);
  const client = await getClient(r);
  const key = getZKey(r);
  const items = await client.zRangeWithScores(key, 0, limit - 1, { REV: true });
  const rows = items.map(i => ({ user_id: i.value, score: Number(i.score) }));
  for (const ritem of rows) {
    let name = await client.hGet(`user:${ritem.user_id}`, 'name');
    if (!name) {
      try {
        const db = getShard(region);
        const { rows: dbRows } = await db.query('SELECT name FROM leaderboard WHERE user_id = $1', [ritem.user_id]);
        if (dbRows.length > 0) {
          name = dbRows[0].name;
          await client.hSet(`user:${ritem.user_id}`, { name });
        }
      } catch (e) {
        console.error('DB fetch error in getTop:', e && e.message ? e.message : e);
      }
    }
    ritem.name = name || null;
  }
  return rows;
}

async function getRank(region, userId) {
  const r = normalizeRegion(region);
  const client = await getClient(r);
  const key = getZKey(r);
  let score = await client.zScore(key, String(userId));
  let name = await client.hGet(`user:${userId}`, 'name');
  if (score == null || !name) {
    try {
      const db = getShard(region);
      const { rows: dbRows } = await db.query('SELECT score, name FROM leaderboard WHERE user_id = $1', [userId]);
      if (dbRows.length > 0) {
        if (score == null) {
          score = dbRows[0].score;
          await client.zAdd(key, [{ score: Number(score), value: String(userId) }]);
        }
        if (!name) {
          name = dbRows[0].name;
          await client.hSet(`user:${userId}`, { name });
        }
      } else {
        return { found: false };
      }
    } catch (e) {
      console.error('DB fetch error in getRank:', e && e.message ? e.message : e);
    }
  }
  const rank = await client.zRevRank(key, String(userId));
  return { found: true, rank: rank + 1, score: Number(score), name };
}

async function getAround(region, userId, range = 10) {
  const r = normalizeRegion(region);
  const client = await getClient(r);
  const key = getZKey(r);
  let rank = await client.zRevRank(key, String(userId));
  let score = await client.zScore(key, String(userId));
  if (rank == null || score == null) {
    try {
      const db = getShard(region);
      const { rows: dbRows } = await db.query('SELECT score FROM leaderboard WHERE user_id = $1', [userId]);
      if (dbRows.length > 0) {
        score = dbRows[0].score;
        await client.zAdd(key, [{ score: Number(score), value: String(userId) }]);
        rank = await client.zRevRank(key, String(userId));
      } else {
        return { found: false };
      }
    } catch (e) {
      console.error('DB fetch error in getAround:', e && e.message ? e.message : e);
    }
  }
  const start = Math.max(0, rank - range);
  const end = rank + range;
  const arr = await client.zRangeWithScores(key, start, end, { REV: true });
  const rows = arr.map(i => ({ user_id: i.value, score: Number(i.score) }));
  for (const ritem of rows) {
    let name = await client.hGet(`user:${ritem.user_id}`, 'name');
    if (!name) {
      try {
        const db = getShard(region);
        const { rows: dbRows } = await db.query('SELECT name FROM leaderboard WHERE user_id = $1', [ritem.user_id]);
        if (dbRows.length > 0) {
          name = dbRows[0].name;
          await client.hSet(`user:${ritem.user_id}`, { name });
        }
      } catch (e) {
        console.error('DB fetch error in getAround name lookup:', e && e.message ? e.message : e);
      }
    }
    ritem.name = name || null;
  }
  return { found: true, around: rows, centerIndex: rank - start };
}

async function addScore({ user_id, name, region, delta }) {
  const now = new Date().toISOString();
  const r = normalizeRegion(region);
  const regionClient = await getClient(r);
  const globalClient = await getClient('GLOBAL');
  const regionKey = getZKey(r);
  const globalKey = getZKey('GLOBAL');
  const newScore = await regionClient.zIncrBy(regionKey, Number(delta), String(user_id));
  await globalClient.zAdd(globalKey, [{ score: Number(newScore), value: String(user_id) }]);
  await regionClient.hSet(`user:${user_id}`, { name: name || '', region: r, score: String(newScore), updated_at: now });
  await enqueue({ user_id, name, region: r, score: Number(newScore), timestamp: now });
  if (r !== 'GLOBAL') {
    await enqueue({ user_id, name, region: 'GLOBAL', score: Number(newScore), timestamp: now });
  }
  return Number(newScore);
}

export { updateScore, createUser, addScore, getTop, getRank, getAround };
