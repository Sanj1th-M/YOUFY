/**
 * useRecommendations — Custom hook for Recommended For You section
 *
 * Returns personalized recommendations with loading/error states.
 * Caches results for 5 minutes, auto-refreshes after 5 new song plays.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getRecommendations, invalidateCache } from '../utils/recommendationEngine';

// Module-level play counter per userId — survives re-renders but not page refresh
const playCounters = new Map();

/**
 * Increment play counter for a user and return current count.
 * Resets to 0 after hitting the refresh threshold.
 */
export function incrementPlayCounter(userId) {
  if (!userId) return 0;
  const current = playCounters.get(userId) || 0;
  playCounters.set(userId, current + 1);
  return current + 1;
}

export default function useRecommendations(userId) {
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading]                 = useState(false);
  const [error, setError]                     = useState(null);

  // Track when we last fetched to enforce 5-minute cooldown
  const lastFetchRef = useRef(0);
  const isMountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // Core fetch function
  const fetchRecommendations = useCallback(async (force = false) => {
    if (!userId) {
      setRecommendations([]);
      setLoading(false);
      setError(null);
      return;
    }

    // Enforce 5-minute cooldown unless forced
    const now = Date.now();
    const COOLDOWN_MS = 5 * 60 * 1000;
    if (!force && (now - lastFetchRef.current) < COOLDOWN_MS) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const recs = await getRecommendations(userId);

      if (isMountedRef.current) {
        setRecommendations(Array.isArray(recs) ? recs : []);
        lastFetchRef.current = Date.now();
      }
    } catch (err) {
      console.error('[useRecommendations] fetch error:', err.message || err);
      if (isMountedRef.current) {
        setError(err.message || 'Failed to load recommendations');
        // Always return safe fallback — never let UI crash
        setRecommendations([]);
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [userId]);

  // Initial fetch when userId changes
  useEffect(() => {
    fetchRecommendations(true);
  }, [fetchRecommendations]);

  // Auto-refresh when play counter hits threshold
  useEffect(() => {
    if (!userId) return;

    const REFRESH_THRESHOLD = 5;
    const intervalId = setInterval(() => {
      const count = playCounters.get(userId) || 0;
      if (count >= REFRESH_THRESHOLD) {
        playCounters.set(userId, 0);
        invalidateCache(userId);
        fetchRecommendations(true);
      }
    }, 10_000); // Check every 10 seconds

    return () => clearInterval(intervalId);
  }, [userId, fetchRecommendations]);

  // Manual refresh function
  const refresh = useCallback(() => {
    invalidateCache(userId);
    fetchRecommendations(true);
  }, [userId, fetchRecommendations]);

  return { recommendations, loading, error, refresh };
}
