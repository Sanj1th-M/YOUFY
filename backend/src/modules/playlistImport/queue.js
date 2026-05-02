const { isPlaylistImportEnabled } = require('./config');
const { processPreviewJob } = require('./PlaylistImportService');

let queue = null;
let worker = null;
let queueStarted = false;

function hasRedisQueue() {
  return Boolean(process.env.REDIS_URL);
}

function getQueueConnection() {
  const IORedis = require('ioredis');
  return new IORedis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}

function ensureQueue() {
  if (!hasRedisQueue()) return null;
  if (!queue) {
    const { Queue } = require('bullmq');
    queue = new Queue('playlist-import-preview', {
      connection: getQueueConnection(),
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    });
  }
  return queue;
}

async function enqueuePreviewJob(data) {
  const activeQueue = ensureQueue();
  if (!activeQueue) {
    setImmediate(() => {
      processPreviewJob(data).catch(error => {
        console.error('[playlist-import] preview job failed:', error.message);
      });
    });
    return { id: data.jobId };
  }

  return activeQueue.add('preview', data, {
    jobId: data.jobId,
  });
}

function startPlaylistImportWorker() {
  if (queueStarted || !isPlaylistImportEnabled() || !hasRedisQueue()) {
    return;
  }

  queueStarted = true;
  const { Worker } = require('bullmq');
  worker = new Worker(
    'playlist-import-preview',
    async job => {
      await processPreviewJob(job.data);
      return { ok: true };
    },
    {
      connection: getQueueConnection(),
      concurrency: 2,
    }
  );

  worker.on('error', error => {
    console.error('[playlist-import] worker error:', error.message);
  });
}

module.exports = {
  enqueuePreviewJob,
  startPlaylistImportWorker,
};
