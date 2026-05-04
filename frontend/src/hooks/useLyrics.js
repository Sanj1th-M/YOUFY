import { useState, useEffect } from 'react';
import { getLyrics } from '../services/api';

const lyricsCache = new Map();

export function useLyrics(song) {
  const [lyrics,  setLyrics]  = useState({ synced: [], plain: '' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!song?.videoId) return;

    if (lyricsCache.has(song.videoId)) {
      setLyrics(lyricsCache.get(song.videoId));
      setLoading(false);
      return;
    }

    setLoading(true);
    getLyrics(song.title, song.artist)
      .then(res => {
        lyricsCache.set(song.videoId, res);
        setLyrics(res);
      })
      .catch(() => setLyrics({ synced: [], plain: '' }))
      .finally(() => setLoading(false));
  }, [song?.videoId, song?.title, song?.artist]);

  return { lyrics, loading };
}
