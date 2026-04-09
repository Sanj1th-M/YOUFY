const NodeCache = require('node-cache');

// Stream URL cache — TTL 5hrs (URLs expire at ~6hrs, safe margin)
const streamCache = new NodeCache({ stdTTL: 5 * 60 * 60, checkperiod: 600 });

// Search cache — TTL 10 minutes (fresh enough, fast repeat searches)
const searchCache = new NodeCache({ stdTTL: 10 * 60, checkperiod: 120 });

// Trending cache — TTL 30 minutes
const trendingCache = new NodeCache({ stdTTL: 30 * 60, checkperiod: 300 });

const recommendationArtistCache = new NodeCache({ stdTTL: 15 * 60, checkperiod: 180 });
const recommendationPoolCache = new NodeCache({ stdTTL: 5 * 60, checkperiod: 120 });

module.exports = {
  streamCache,
  searchCache,
  trendingCache,
  recommendationArtistCache,
  recommendationPoolCache,
};
