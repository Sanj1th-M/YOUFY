import { create } from 'zustand';
import { audioPlayer } from '../services/audioPlayer';
import { getStreamUrl, syncRecentlyPlayed } from '../services/api';
import { getCachedUrl, setCachedUrl } from '../services/streamCache';

// Fetch stream URL — checks memory cache first, then backend
async function fetchStreamUrl(videoId) {
  const cached = getCachedUrl(videoId);
  if (cached) {
    console.log(`[cache] stream hit: ${videoId}`);
    return cached;
  }
  const url = await getStreamUrl(videoId);
  setCachedUrl(videoId, url);
  return url;
}

// Pre-fetch next song's URL in background so it plays instantly
function prefetchNext(queue) {
  if (!queue || queue.length === 0) return;
  const next = queue[0];
  if (!next?.videoId || getCachedUrl(next.videoId)) return;
  // Fire and forget — no await, runs in background
  getStreamUrl(next.videoId)
    .then(url => {
      setCachedUrl(next.videoId, url);
      console.log(`[prefetch] cached next: ${next.title}`);
    })
    .catch(() => {}); // silent fail — not critical
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
    set({ isLoading: true, error: null, currentSong: song });
    try {
      // Get URL from cache or backend
      const url = await fetchStreamUrl(song.videoId);
      await audioPlayer.play(url, song);

      // Save to recent songs (metadata only — never the stream URL)
      const recent = JSON.parse(localStorage.getItem('recentSongs') || '[]');
      const filtered = recent.filter(s => s.videoId !== song.videoId);
      localStorage.setItem(
        'recentSongs',
        JSON.stringify([song, ...filtered].slice(0, 20))
      );
      syncRecentlyPlayed(song);

      set({ isPlaying: true, isLoading: false, queue: queueList });

      // Pre-fetch next song URL in background — zero wait when song ends
      prefetchNext(queueList);

      audioPlayer.onTimeUpdate(() =>
        set({ currentTime: audioPlayer.currentTime, duration: audioPlayer.duration })
      );
      audioPlayer.onEnded(() => {
        set({ isPlaying: false });
        get().playNext();
      });
      audioPlayer.onError(() => {
        set({ isPlaying: false, isLoading: false, error: 'Playback error. Try again.' });
      });
      audioPlayer.onWaiting(() => set({ isLoading: true }));
      audioPlayer.onCanPlay(() => set({ isLoading: false }));

      window.__youfyNext = get().playNext;
      window.__youfyPrev = get().playPrev;

    } catch (err) {
      set({ isPlaying: false, isLoading: false, error: 'Could not load song. Try again.' });
      console.error('[player] error:', err.message);
    }
  },

  togglePlay: () => {
    const { isPlaying } = get();
    if (isPlaying) { audioPlayer.pause(); set({ isPlaying: false }); }
    else           { audioPlayer.resume(); set({ isPlaying: true }); }
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
      prefetchNext(nextQueue);
      return { queue: nextQueue };
    });
  },

  removeFromQueue: (videoId) => {
    if (!videoId) return;
    set((s) => {
      const nextQueue = s.queue.filter((x) => x?.videoId !== videoId);
      prefetchNext(nextQueue);
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
      prefetchNext(q);
      return { queue: q };
    });
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
    const { queue, currentSong, history, playSong } = get();
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
