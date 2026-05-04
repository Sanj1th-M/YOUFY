import { create } from 'zustand';
import { audioPlayer } from '../services/audioPlayer';
import { getStreamUrl, syncRecentlyPlayed } from '../services/api';
import { getCachedUrl, setCachedUrl, removeCachedUrl } from '../services/streamCache';
import { updateSongScore } from '../utils/recommendationEngine';
import { incrementPlayCounter } from '../hooks/useRecommendations';
import useAuthStore from './useAuthStore';

// ── Request generation counter — used to detect stale playSong calls ──
let playRequestId = 0;
const streamRequestCache = new Map();

// ── Helper: get current userId from auth store ──
function getCurrentUserId() {
  return useAuthStore.getState()?.user?.uid || null;
}

// ── Helper: build songMeta from a song object ──
function toSongMeta(song) {
  if (!song) return null;
  return {
    title:           song.title || 'Unknown',
    artist:          song.artist || 'Unknown',
    genre:           song.genre || 'unknown',
    thumbnail:       song.thumbnail || '',
    durationSeconds: song.durationSeconds || 0,
  };
}

// Fetch stream URL — checks memory cache first, then backend
async function fetchStreamUrl(videoId) {
  const cached = getCachedUrl(videoId);
  if (cached) {
    console.log(`[cache] stream hit: ${videoId}`);
    return cached;
  }

  if (streamRequestCache.has(videoId)) {
    console.log(`[cache] stream in-flight: ${videoId}`);
    return streamRequestCache.get(videoId);
  }

  const request = getStreamUrl(videoId)
    .then((url) => {
      setCachedUrl(videoId, url);
      return url;
    })
    .finally(() => {
      streamRequestCache.delete(videoId);
    });

  streamRequestCache.set(videoId, request);
  return request;
}

function warmStreamUrl(videoId) {
  if (!videoId || getCachedUrl(videoId) || streamRequestCache.has(videoId)) {
    return;
  }

  fetchStreamUrl(videoId).catch(() => {});
}

function warmQueueSongs(queue) {
  if (!queue || queue.length === 0) return;

  queue
    .filter((song) => song?.videoId)
    .slice(0, 1)
    .forEach((song) => {
      warmStreamUrl(song.videoId);
    });
}

// Pre-fetch upcoming songs' URLs in background so they play instantly
function prefetchNext(queue) {
  if (!queue || queue.length === 0) return;
  // Prefetch up to 3 upcoming songs for smoother playback
  const toFetch = queue.slice(0, 3).filter(s => s?.videoId && !getCachedUrl(s.videoId));
  toFetch.forEach(song => {
    getStreamUrl(song.videoId)
      .then(url => {
        setCachedUrl(song.videoId, url);
        console.log(`[prefetch] cached: ${song.title}`);
      })
      .catch(() => {}); // silent fail — not critical
  });
}

function normalizeQueueSongs(songs = []) {
  const seen = new Set();
  return songs.filter((song) => {
    const id = song?.videoId;
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function mergeQueues(manualQueue = [], autoQueue = []) {
  return normalizeQueueSongs([...(manualQueue || []), ...(autoQueue || [])]);
}

function removeSongFromQueue(queue = [], videoId) {
  if (!videoId) return Array.isArray(queue) ? queue : [];
  return (Array.isArray(queue) ? queue : []).filter((song) => song?.videoId !== videoId);
}

function pickRandomQueueEntry(queue = []) {
  if (!Array.isArray(queue) || queue.length === 0) {
    return { nextTrack: null, remainingQueue: [] };
  }

  const randomIndex = Math.floor(Math.random() * queue.length);
  const nextTrack = queue[randomIndex] || null;
  const remainingQueue = queue.filter((_, index) => index !== randomIndex);

  return { nextTrack, remainingQueue };
}

const usePlayerStore = create((set, get) => ({
  currentSong:    null,
  isPlaying:      false,
  isLoading:      false,
  currentTime:    0,
  duration:       0,
  volume:         parseFloat(localStorage.getItem('volume') ?? '1'),
  shuffleEnabled: false,
  repeatMode:     'off',
  manualQueue:    [],
  autoQueue:      [],
  queue:          [],
  history:        [],
  showFullPlayer: false,
  error:          null,

  playSong: async (song, queueList = [], options = {}) => {
    if (!song?.videoId) return;
    const { preserveQueues = false, queueSource = 'auto' } = options;

    // ── Increment request ID to invalidate any in-flight requests ──
    const thisRequestId = ++playRequestId;

    // ── Detect REPLAY before overwriting currentSong ──
    const prevSong = get().currentSong;
    const isReplay = prevSong && song && prevSong.videoId === song.videoId;

    // Show loading state immediately with the new song info
    if (preserveQueues) {
      set({ isLoading: true, error: null, currentSong: song });
    } else {
      const nextList = normalizeQueueSongs(queueList);
      const { manualQueue, autoQueue } = get();
      const nextManualQueue = queueSource === 'manual' ? nextList : manualQueue;
      const nextAutoQueue = queueSource === 'manual' ? autoQueue : nextList;
      const nextQueue = mergeQueues(nextManualQueue, nextAutoQueue);
      set({
        isLoading: true,
        error: null,
        currentSong: song,
        manualQueue: nextManualQueue,
        autoQueue: nextAutoQueue,
        queue: nextQueue,
      });
    }

    try {
      // Get URL from cache or backend
      const url = await fetchStreamUrl(song.videoId);

      // ── STALE CHECK: if user clicked another song while we were fetching, bail out ──
      if (thisRequestId !== playRequestId) {
        console.log(`[player] discarding stale request for: ${song.title}`);
        return;
      }

      // Play the audio — audioPlayer.play() will abort any previous load
      await audioPlayer.play(url, song);

      // ── STALE CHECK again after play() (which also awaits) ──
      if (thisRequestId !== playRequestId) {
        console.log(`[player] discarding stale request (post-play) for: ${song.title}`);
        return;
      }

      // Save to recent songs (metadata only — never the stream URL)
      const recent = JSON.parse(localStorage.getItem('recentSongs') || '[]');
      const filtered = recent.filter(s => s.videoId !== song.videoId);
      localStorage.setItem(
        'recentSongs',
        JSON.stringify([song, ...filtered].slice(0, 20))
      );
      syncRecentlyPlayed(song);

      set({ isPlaying: true, isLoading: false });

      // Pre-fetch next song URL in background — zero wait when song ends
      warmQueueSongs(get().queue);

      // ── Track REPLAY event ──
      if (isReplay) {
        const userId = getCurrentUserId();
        if (userId) {
          updateSongScore(userId, song.videoId, toSongMeta(song), 'REPLAY');
        }
      }

      // ── Increment play counter for auto-refresh ──
      const uid = getCurrentUserId();
      if (uid) incrementPlayCounter(uid);

      audioPlayer.onTimeUpdate(() =>
        set({ currentTime: audioPlayer.currentTime, duration: audioPlayer.duration })
      );
      audioPlayer.onEnded(() => {
        // ── Track FULL_LISTEN (listened > 80% of duration) ──
        const { currentTime, duration, currentSong: endedSong } = get();
        if (endedSong && duration > 0 && (currentTime / duration) > 0.8) {
          const recUserId = getCurrentUserId();
          if (recUserId) {
            updateSongScore(recUserId, endedSong.videoId, toSongMeta(endedSong), 'FULL_LISTEN');
          }
        }
        if (get().repeatMode === 'one' && endedSong) {
          audioPlayer.seek(0);
          set({ currentTime: 0 });
          audioPlayer.resume()
            .then(() => set({ isPlaying: true, isLoading: false, error: null }))
            .catch(() => {
              get().playSong(endedSong, get().queue, { preserveQueues: true });
            });
          return;
        }
        set({ isPlaying: false });
        get().playNext();
      });
      audioPlayer.onError(() => {
        if (song?.videoId) {
          removeCachedUrl(song.videoId);
        }
        set({ isPlaying: false, isLoading: false, error: 'Playback error. Try again.' });
      });
      audioPlayer.onWaiting(() => set({ isLoading: true }));
      audioPlayer.onCanPlay(() => set({ isLoading: false }));

      window.__youfyNext = get().playNext;
      window.__youfyPrev = get().playPrev;

    } catch (err) {
      // Ignore AbortErrors — they're expected when user clicks a new song
      if (err?.name === 'AbortError' || err?.message?.includes('Aborted')) {
        console.log(`[player] aborted load for: ${song.title} (user picked a new song)`);
        return;
      }
      // Only show error if this is still the active request
      if (thisRequestId === playRequestId) {
        removeCachedUrl(song.videoId);
        set({ isPlaying: false, isLoading: false, error: 'Could not load song. Try again.' });
        console.error('[player] error:', err.message);
      }
    }
  },

  togglePlay: async () => {
    const { isPlaying, currentSong } = get();
    if (!currentSong) return;

    if (isPlaying) {
      audioPlayer.pause();
      set({ isPlaying: false, error: null });
      return;
    }

    try {
      await audioPlayer.resume();
      set({ isPlaying: true, error: null });
    } catch (err) {
      set({ isPlaying: false, error: 'Could not resume playback. Try another song.' });
      console.error('[player] resume failed:', err?.message || err);
    }
  },

  seek: (s) => { audioPlayer.seek(s); set({ currentTime: s }); },

  setVolume: (v) => {
    audioPlayer.setVolume(v);
    localStorage.setItem('volume', String(v));
    set({ volume: v });
  },

  toggleShuffle: () => set((state) => ({ shuffleEnabled: !state.shuffleEnabled })),

  cycleRepeatMode: () => set((state) => ({
    repeatMode:
      state.repeatMode === 'off'
        ? 'all'
        : state.repeatMode === 'all'
          ? 'one'
          : 'off',
  })),

  setQueue: (q) => set(() => {
    const nextManualQueue = normalizeQueueSongs(q);
    const nextAutoQueue = [];
    const nextQueue = mergeQueues(nextManualQueue, nextAutoQueue);
    warmQueueSongs(nextQueue);
    return {
      manualQueue: nextManualQueue,
      autoQueue: nextAutoQueue,
      queue: nextQueue,
    };
  }),

  addToQueue: (song) => {
    if (!song?.videoId) return;
    set((s) => {
      const withoutManual = removeSongFromQueue(s.manualQueue, song.videoId);
      const withoutAuto = removeSongFromQueue(s.autoQueue, song.videoId);
      const nextManualQueue = [song, ...withoutManual];
      const nextAutoQueue = withoutAuto;
      const nextQueue = mergeQueues(nextManualQueue, nextAutoQueue);
      warmQueueSongs(nextQueue);
      return {
        manualQueue: nextManualQueue,
        autoQueue: nextAutoQueue,
        queue: nextQueue,
      };
    });
  },

  queueSongNext: (song) => {
    if (!song?.videoId) return;
    set((s) => {
      if (s.currentSong?.videoId === song.videoId) return {};

      const currentQueue = Array.isArray(s.queue) ? s.queue : [];
      const remainingQueue = removeSongFromQueue(currentQueue, song.videoId);
      const nextQueue = [song, ...remainingQueue];

      warmQueueSongs(nextQueue);
      return {
        manualQueue: nextQueue,
        autoQueue: [],
        queue: nextQueue,
      };
    });
  },

  removeFromQueue: (videoId) => {
    if (!videoId) return;
    set((s) => {
      const nextManualQueue = removeSongFromQueue(s.manualQueue, videoId);
      const nextAutoQueue = removeSongFromQueue(s.autoQueue, videoId);
      const nextQueue = mergeQueues(nextManualQueue, nextAutoQueue);
      warmQueueSongs(nextQueue);
      return {
        manualQueue: nextManualQueue,
        autoQueue: nextAutoQueue,
        queue: nextQueue,
      };
    });
  },

  clearQueue: () => set({ manualQueue: [], autoQueue: [], queue: [] }),

  moveQueueItem: (fromIndex, toIndex) => {
    set((s) => {
      const q = Array.isArray(s.queue) ? [...s.queue] : [];
      if (fromIndex < 0 || fromIndex >= q.length) return {};
      if (toIndex < 0 || toIndex >= q.length) return {};
      const [item] = q.splice(fromIndex, 1);
      q.splice(toIndex, 0, item);
      warmQueueSongs(q);
      return { manualQueue: q, autoQueue: [], queue: q };
    });
  },

  warmSong: (song) => {
    if (!song?.videoId) return;
    warmStreamUrl(song.videoId);
  },

  warmSongs: (songs = []) => {
    warmQueueSongs(songs);
  },

  playFromQueueIndex: (index) => {
    const { queue, manualQueue, autoQueue, playSong } = get();
    if (!Array.isArray(queue) || index < 0 || index >= queue.length) return;
    const next = queue[index];
    const nextManualQueue = removeSongFromQueue(manualQueue, next?.videoId);
    const nextAutoQueue = removeSongFromQueue(autoQueue, next?.videoId);
    const rest = mergeQueues(nextManualQueue, nextAutoQueue);
    set({ manualQueue: nextManualQueue, autoQueue: nextAutoQueue, queue: rest });
    playSong(next, rest, { preserveQueues: true });
  },

  playNext: () => {
    const { manualQueue, autoQueue, currentSong, playSong, currentTime, repeatMode, shuffleEnabled } = get();

    // ── Track SKIPPED (skipped before 30 seconds) ──
    if (currentSong && currentTime < 30) {
      const userId = getCurrentUserId();
      if (userId) {
        updateSongScore(userId, currentSong.videoId, toSongMeta(currentSong), 'SKIPPED');
      }
    }

    if (currentSong) set(s => ({ history: [currentSong, ...s.history].slice(0, 50) }));

    const hasManualQueue = Array.isArray(manualQueue) && manualQueue.length > 0;
    const hasAutoQueue = Array.isArray(autoQueue) && autoQueue.length > 0;
    if (!hasManualQueue && !hasAutoQueue) {
      if (repeatMode === 'all' && currentSong) {
        playSong(currentSong, [], { preserveQueues: true });
      }
      return;
    }

    let nextTrack = null;
    let nextManualQueue = manualQueue;
    let nextAutoQueue = autoQueue;

    if (hasManualQueue && shuffleEnabled) {
      const randomPick = pickRandomQueueEntry(manualQueue);
      nextTrack = randomPick.nextTrack;
      nextManualQueue = randomPick.remainingQueue;
    } else if (hasAutoQueue && shuffleEnabled) {
      const randomPick = pickRandomQueueEntry(autoQueue);
      nextTrack = randomPick.nextTrack;
      nextAutoQueue = randomPick.remainingQueue;
    } else if (hasManualQueue) {
      nextTrack = manualQueue[0];
      const expectedManualTop = manualQueue[0];
      if (nextTrack?.videoId !== expectedManualTop?.videoId) {
        console.error(
          '[queue] invariant violated: nextTrack must match manualQueue[0] when manual queue is non-empty',
          { nextTrackId: nextTrack?.videoId, expectedId: expectedManualTop?.videoId }
        );
      }
      nextManualQueue = manualQueue.slice(1);
    } else {
      nextTrack = autoQueue[0];
      nextAutoQueue = autoQueue.slice(1);
    }

    const rest = mergeQueues(nextManualQueue, nextAutoQueue);
    set({ manualQueue: nextManualQueue, autoQueue: nextAutoQueue, queue: rest });
    if (nextTrack) {
      playSong(nextTrack, rest, { preserveQueues: true });
    }
  },

  playPrev: () => {
    const { history, playSong, currentSong, currentTime } = get();
    if (currentSong && currentTime > 3) {
      audioPlayer.seek(0);
      set({ currentTime: 0 });
      return;
    }
    if (history.length > 0) {
      const [prev, ...rest] = history;
      set({ history: rest });
      playSong(prev, [], { preserveQueues: true });
    }
  },

  setShowFullPlayer: (v) => set({ showFullPlayer: v }),
  clearError:        ()  => set({ error: null }),
}));

export default usePlayerStore;
