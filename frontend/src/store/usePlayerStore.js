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

const usePlayerStore = create((set, get) => ({
  currentSong:    null,
  isPlaying:      false,
  isLoading:      false,
  currentTime:    0,
  duration:       0,
  volume:         parseFloat(localStorage.getItem('volume') ?? '1'),
  queue:          [],
  history:        [],
  showFullPlayer: false,
  error:          null,

  playSong: async (song, queueList = []) => {
    if (!song?.videoId) return;

    // ── Increment request ID to invalidate any in-flight requests ──
    const thisRequestId = ++playRequestId;

    // ── Detect REPLAY before overwriting currentSong ──
    const prevSong = get().currentSong;
    const isReplay = prevSong && song && prevSong.videoId === song.videoId;

    // Show loading state immediately with the new song info
    set({ isLoading: true, error: null, currentSong: song, queue: queueList });

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
      warmQueueSongs(queueList);

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

  setQueue: (q) => set({ queue: q }),

  addToQueue: (song) => {
    if (!song?.videoId) return;
    set((s) => {
      const without = s.queue.filter((x) => x?.videoId !== song.videoId);
      const nextQueue = [...without, song];
      warmQueueSongs(nextQueue);
      return { queue: nextQueue };
    });
  },

  removeFromQueue: (videoId) => {
    if (!videoId) return;
    set((s) => {
      const nextQueue = s.queue.filter((x) => x?.videoId !== videoId);
      warmQueueSongs(nextQueue);
      return { queue: nextQueue };
    });
  },

  clearQueue: () => set({ queue: [] }),

  moveQueueItem: (fromIndex, toIndex) => {
    set((s) => {
      const q = Array.isArray(s.queue) ? [...s.queue] : [];
      if (fromIndex < 0 || fromIndex >= q.length) return {};
      if (toIndex < 0 || toIndex >= q.length) return {};
      const [item] = q.splice(fromIndex, 1);
      q.splice(toIndex, 0, item);
      warmQueueSongs(q);
      return { queue: q };
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
    const { queue, playSong } = get();
    if (!Array.isArray(queue) || index < 0 || index >= queue.length) return;
    const next = queue[index];
    const rest = [...queue.slice(0, index), ...queue.slice(index + 1)];
    set({ queue: rest });
    playSong(next, rest);
  },

  playNext: () => {
    const { queue, currentSong, history, playSong, currentTime } = get();

    // ── Track SKIPPED (skipped before 30 seconds) ──
    if (currentSong && currentTime < 30) {
      const userId = getCurrentUserId();
      if (userId) {
        updateSongScore(userId, currentSong.videoId, toSongMeta(currentSong), 'SKIPPED');
      }
    }

    if (currentSong) set(s => ({ history: [currentSong, ...s.history].slice(0, 50) }));
    if (queue.length > 0) {
      const [next, ...rest] = queue;
      set({ queue: rest });
      playSong(next, rest);
    }
  },

  playPrev: () => {
    const { history, playSong } = get();
    if (history.length > 0) {
      const [prev, ...rest] = history;
      set({ history: rest });
      playSong(prev);
    }
  },

  setShowFullPlayer: (v) => set({ showFullPlayer: v }),
  clearError:        ()  => set({ error: null }),
}));

export default usePlayerStore;
