import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { searchMusic } from '../services/api';

// Frontend search result cache — avoid re-hitting backend for same query
const searchResultCache = new Map(); // query → results

export function useSearch() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') || '';
  const [query,   setQueryInternal]   = useState(initialQuery);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const timer = useRef(null);
  const currentQuery = useRef('');

  useEffect(() => {
    const q = searchParams.get('q') || '';
    if (q !== query) {
      setQueryInternal(q);
    }
  }, [searchParams, query]);

  const setQuery = (val) => {
    setQueryInternal(val);
    if (val) {
      setSearchParams({ q: val }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  };

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) { setResults(null); setLoading(false); return; }

    // Check frontend cache first — instant display for repeated queries
    if (searchResultCache.has(trimmed.toLowerCase())) {
      setResults(searchResultCache.get(trimmed.toLowerCase()));
      setLoading(false);
      return;
    }

    // Debounce — 250ms feels snappy, reduces unnecessary calls
    setLoading(true);
    clearTimeout(timer.current);
    currentQuery.current = trimmed;

    timer.current = setTimeout(async () => {
      // Guard: if query changed while waiting, skip stale result
      if (currentQuery.current !== trimmed) return;

      setError(null);
      try {
        const data = await searchMusic(trimmed);
        // Only update if this is still the current query
        if (currentQuery.current === trimmed) {
          setResults(data);
          // Cache in frontend memory (no expiry — session only)
          searchResultCache.set(trimmed.toLowerCase(), data);
        }
      } catch {
        if (currentQuery.current === trimmed) {
          setError('Search failed. Check your connection.');
        }
      } finally {
        if (currentQuery.current === trimmed) {
          setLoading(false);
        }
      }
    }, 250); // 250ms — snappy but not spammy

    return () => clearTimeout(timer.current);
  }, [query]);

  return { query, setQuery, results, loading, error };
}
