const { searchCache } = require('../../services/cache');

let redis = null;
let redisUnavailable = false;

function getRedis() {
  if (!process.env.REDIS_URL || redisUnavailable) return null;
  if (!redis) {
    const IORedis = require('ioredis');
    redis = new IORedis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      lazyConnect: true,
    });
    redis.on('error', () => {
      redisUnavailable = true;
    });
  }
  return redis;
}

async function getJson(key) {
  const client = getRedis();
  if (client) {
    try {
      if (client.status === 'wait') await client.connect();
      const raw = await client.get(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      redisUnavailable = true;
    }
  }

  return searchCache.get(key) || null;
}

async function setJson(key, value, ttlSeconds = 600) {
  const client = getRedis();
  if (client) {
    try {
      if (client.status === 'wait') await client.connect();
      await client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
      return;
    } catch {
      redisUnavailable = true;
    }
  }

  searchCache.set(key, value, ttlSeconds);
}

function hasRedisCache() {
  return Boolean(process.env.REDIS_URL) && !redisUnavailable;
}

module.exports = {
  getJson,
  hasRedisCache,
  setJson,
};
