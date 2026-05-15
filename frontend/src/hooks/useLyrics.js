import { useState, useEffect, useCallback, useRef } from 'react';
import { getLyrics } from '../services/api';
import {
  getCachedLyrics,
  getLyricsCacheKey,
  removeCachedLyrics,
  setCachedLyrics,
} from '../services/lyricsCache';

const EMPTY_LYRICS = { synced: [], plain: '', status: 'idle' };

export const lyricsCache = {
  delete(videoIdOrKey) {
    const value = String(videoIdOrKey || '');
    removeCachedLyrics(value.startsWith('video:') ? value : `video:${value}`);
  },
};

export function useLyrics(song) {
  const [lyrics, setLyrics] = useState(EMPTY_LYRICS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef(0);
  const title = song?.title || '';
  const artist = song?.artist || '';
  const album = song?.album || '';
  const durationSeconds = song?.durationSeconds || 0;
  const videoId = song?.videoId || '';

  const fetchLyrics = useCallback((force = false) => {
    const cacheKey = getLyricsCacheKey({ title, artist, album, durationSeconds, videoId });
    const hasRequiredMetadata = Boolean(title && artist);
    const nextRequestId = requestId.current + 1;
    requestId.current = nextRequestId;

    if (!cacheKey || !hasRequiredMetadata) {
      setLyrics(EMPTY_LYRICS);
      setLoading(false);
      setError('');
      return;
    }

    if (force) {
      removeCachedLyrics(cacheKey);
    } else {
      const cached = getCachedLyrics(cacheKey);
      if (cached) {
        setLyrics(cached);
        setLoading(false);
        setError('');
        return;
      }
    }

    setLoading(true);
    setError('');

    getLyrics({
      title,
      artist,
      album,
      durationSeconds,
      videoId,
    })
      .then((res) => {
        if (requestId.current !== nextRequestId) return;
        const nextLyrics = normalizeLyricsResponse(res);
        setCachedLyrics(cacheKey, nextLyrics);
        setLyrics(nextLyrics);
      })
      .catch((err) => {
        if (requestId.current !== nextRequestId) return;
        setLyrics(EMPTY_LYRICS);
        setError(err?.response?.data?.error || 'Could not load lyrics. Try again.');
      })
      .finally(() => {
        if (requestId.current === nextRequestId) {
          setLoading(false);
        }
      });
  }, [album, artist, durationSeconds, title, videoId]);

  useEffect(() => {
    fetchLyrics();
  }, [fetchLyrics]);

  const refetch = useCallback(() => {
    fetchLyrics(true);
  }, [fetchLyrics]);

  return { lyrics, loading, error, refetch };
}

function normalizeLyricsResponse(response) {
  return {
    synced: Array.isArray(response?.synced) ? response.synced : [],
    plain: typeof response?.plain === 'string' ? response.plain : '',
    source: typeof response?.source === 'string' ? response.source : null,
    status: typeof response?.status === 'string' ? response.status : 'unknown',
  };
}
