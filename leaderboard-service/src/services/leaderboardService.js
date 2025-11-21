import redis from '../redisClient.js';
import { enqueue } from '../queue/producer.js';

function zkey(region) {
  return `leaderboard:${region || 'GLOBAL'}`;
}

async function updateScore({ user_id, name, region, score }) {
  // Update both region and GLOBAL
  const now = new Date().toISOString();
  const regionKey = zkey(region);
  const globalKey = zkey('GLOBAL');
  await redis.zAdd(regionKey, [{ score: Number(score), value: String(user_id) }]);
  await redis.zAdd(globalKey, [{ score: Number(score), value: String(user_id) }]);
  await redis.hSet(`user:${user_id}`, { name: name || '', region: region || 'GLOBAL', score: String(score), updated_at: now });
  await enqueue({ user_id, name, region, score, timestamp: now });
  if (region !== 'GLOBAL') {
    await enqueue({ user_id, name, region: 'GLOBAL', score, timestamp: now });
  }
  console.log("Updated score for:", user_id);
}


async function createUser({ user_id, name, region, initialScore }) {
  // Always add user to both their region and GLOBAL
  const now = new Date().toISOString();
  let created = false;
  let card = null;

  // Add to specific region
  const regionKey = zkey(region);
  const addedRegion = await redis.zAdd(regionKey, [{ score: Number(initialScore), value: String(user_id) }], { NX: true });
  if (addedRegion === 1 || addedRegion === '1') {
    created = true;
    card = { user_id: String(user_id), name: name || '', region: region || 'GLOBAL', score: initialScore };
  }
  // Add to GLOBAL region
  const globalKey = zkey('GLOBAL');
  await redis.zAdd(globalKey, [{ score: Number(initialScore), value: String(user_id) }], { NX: true });

  // Always update user hash (region is user's primary region)
  await redis.hSet(`user:${user_id}`, { name: name || '', region: region || 'GLOBAL', score: String(initialScore), updated_at: now });

  // Enqueue for both regions
  await enqueue({ user_id, name, region, score: initialScore, timestamp: now });
  if (region !== 'GLOBAL') {
    await enqueue({ user_id, name, region: 'GLOBAL', score: initialScore, timestamp: now });
  }

  if (!created) {
    // If not added, return the existing card (do not overwrite)
    const existingScoreStr = await redis.zScore(regionKey, String(user_id));
    const existingScore = existingScoreStr == null ? 0 : parseInt(existingScoreStr, 10);
    const existingName = await redis.hGet(`user:${user_id}`, 'name');
    const existingRegion = await redis.hGet(`user:${user_id}`, 'region');
    card = {
      user_id: String(user_id),
      name: existingName || name || '',
      region: existingRegion || region || 'GLOBAL',
      score: existingScore,
    };
  }
  return { created, card };
}

async function getTop(region, limit = 100) {
  const key = zkey(region);
  const items = await redis.zRangeWithScores(key, 0, limit - 1, { REV: true });
  const rows = items.map(i => ({ user_id: i.value, score: Number(i.score) }));
  // resolve names from hashes
  for (const r of rows) {
    const name = await redis.hGet(`user:${r.user_id}`, 'name');
    r.name = name || null;
  }
  return rows;
}

async function getRank(region, userId) {
  const key = zkey(region);
  const score = await redis.zScore(key, String(userId));
  if (score == null) return { found: false };
  const rank = await redis.zRevRank(key, String(userId));
  const name = await redis.hGet(`user:${userId}`, 'name');
  return { found: true, rank: rank + 1, score: Number(score), name };
}

async function getAround(region, userId, range = 10) {
  const key = zkey(region);
  const rank = await redis.zRevRank(key, String(userId));
  if (rank == null) return { found: false };
  const start = Math.max(0, rank - range);
  const end = rank + range;
  const arr = await redis.zRangeWithScores(key, start, end, { REV: true });
  const rows = arr.map(i => ({ user_id: i.value, score: Number(i.score) }));
  for (const r of rows) r.name = await redis.hGet(`user:${r.user_id}`, 'name');
  return { found: true, around: rows, centerIndex: rank - start };
}

async function addScore({ user_id, name, region, delta }) {
  // Increment in both region and GLOBAL
  const now = new Date().toISOString();
  const regionKey = zkey(region);
  const globalKey = zkey('GLOBAL');
  const newScore = await redis.zIncrBy(regionKey, Number(delta), String(user_id));
  await redis.zAdd(globalKey, [{ score: Number(newScore), value: String(user_id) }]);
  await redis.hSet(`user:${user_id}`, { name: name || '', region: region || 'GLOBAL', score: String(newScore), updated_at: now });
  await enqueue({ user_id, name, region, score: Number(newScore), timestamp: now });
  if (region !== 'GLOBAL') {
    await enqueue({ user_id, name, region: 'GLOBAL', score: Number(newScore), timestamp: now });
  }
  return Number(newScore);
}

export { updateScore, createUser, addScore, getTop, getRank, getAround };
