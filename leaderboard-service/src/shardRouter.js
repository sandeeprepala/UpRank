// Simple region -> shard mapping (stub)
const shards = {
  ASIA: { id: 'shard_1' },
  EU: { id: 'shard_2' },
  NA: { id: 'shard_3' },
  GLOBAL: { id: 'shard_global' }
};

function getShard(region) {
  return shards[region] || shards.GLOBAL;
}

export { getShard };
