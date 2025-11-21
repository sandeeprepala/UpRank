import redis from '../redisClient.js';
import { enqueue } from '../queue/producer.js';

function zkey(region) {
  return `leaderboard:${region || 'GLOBAL'}`;
}

async function updateScore({ user_id, name, region, score }) {
  const key = zkey(region);
  // Use node-redis zAdd to upsert member
  await redis.zAdd(key, [{ score: Number(score), value: String(user_id) }]);
  // Update user hash with latest metadata and score
  const now = new Date().toISOString();
  await redis.hSet(`user:${user_id}`, { name: name || '', region: region || 'GLOBAL', score: String(score), updated_at: now });
  // produce queue event for worker to persist
  await enqueue({ user_id, name, region, score, timestamp: now });
  console.log("Updated score for:", user_id);
}


async function createUser({ user_id, name, region, initialScore }) {
  const key = zkey(region);
  // Try to add user only if not exists (NX). ZADD returns number of elements added (1 if added, 0 if already present)
  const added = await redis.zAdd(key, [{ score: Number(initialScore), value: String(user_id) }], { NX: true });

  if (added === 1 || added === '1') {
    // Only set metadata when we actually created the card to avoid overwriting existing users
    const now = new Date().toISOString();
    await redis.hSet(`user:${user_id}`, { name: name || '', region: region || 'GLOBAL', score: String(initialScore), updated_at: now });
    await enqueue({ user_id, name, region, score: initialScore, timestamp: now });
    return { created: true, card: { user_id: String(user_id), name: name || '', region: region || 'GLOBAL', score: initialScore } };
  }

  // If not added, return the existing card (do not overwrite)
  const existingScoreStr = await redis.zScore(key, String(user_id));
  const existingScore = existingScoreStr == null ? 0 : parseInt(existingScoreStr, 10);
  const existingName = await redis.hGet(`user:${user_id}`, 'name');
  const existingRegion = await redis.hGet(`user:${user_id}`, 'region');
  const card = {
    user_id: String(user_id),
    name: existingName || name || '',
    region: existingRegion || region || 'GLOBAL',
    score: existingScore,
  };
  return { created: false, card };
}

async function getTop(region, limit = 100) {
  const key = zkey(region);
  const items = await redis.zRangeWithScores(key, 0, limit - 1);
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
  const key = zkey(region);
  // increment the member score
  const newScore = await redis.zIncrBy(key, Number(delta), String(user_id));
  const now = new Date().toISOString();
  // update hash with latest score
  await redis.hSet(`user:${user_id}`, { name: name || '', region: region || 'GLOBAL', score: String(newScore), updated_at: now });
  // enqueue event for worker persistence
  await enqueue({ user_id, name, region, score: Number(newScore), timestamp: now });
  return Number(newScore);
}

export { updateScore, createUser, addScore, getTop, getRank, getAround };
