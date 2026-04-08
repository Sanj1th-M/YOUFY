import { useState, useEffect } from 'react';
import { getLyrics } from '../services/api';

export function useLyrics(song) {
  const [lyrics,  setLyrics]  = useState({ synced: [], plain: '' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!song) return;
    setLoading(true);
    getLyrics(song.title, song.artist)
      .then(setLyrics)
      .catch(() => setLyrics({ synced: [], plain: '' }))
      .finally(() => setLoading(false));
  }, [song?.videoId]);

  return { lyrics, loading };
}
