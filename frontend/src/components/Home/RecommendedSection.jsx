import { useEffect, useRef, useState } from 'react';
import usePlayerStore from '../../store/usePlayerStore';
import { getRecommendations } from '../../services/api';        
const CACHE_KEY = 'recommendedForYouCache';                     const CACHE_TTL_MS = 5 * 60 * 1000;
const SKELETON_DELAY_MS = 180;

function readRecentSongs() {
  try {
    const parsed = JSON.parse(localStorage.getItem('recentSongs') || '[]');                                                         return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function makeRecentFingerprint(recentSongs) {
  return recentSongs
    .slice(0, 10)
    .map((song) => `${song?.videoId || ''}:${song?.artist || ''}`)
    .join('|');
}

function readRecommendationCache(fingerprint) {
  try {
    const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
    if (!cached || cached.fingerprint !== fingerprint) return null;
    if (Date.now() - cached.savedAt > CACHE_TTL_MS) return null;
    return Array.isArray(cached.tracks) ? cached.tracks : null;
  } catch {
    return null;
  }
}

function writeRecommendationCache(fingerprint, tracks) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({
      fingerprint,
      savedAt: Date.now(),
      tracks,
    }));
  } catch {}
}

function RecommendationCard({ song, queue }) {
  const playSong = usePlayerStore(s => s.playSong);
  return (
    <button
      onClick={() => playSong(song, queue)}
      className="w-40 sm:w-44 md:w-48 flex-shrink-0 bg-card hover:bg-subtle rounded-lg p-3 md:p-4 text-left
                 transition-all duration-300 group cursor-pointer"
    >
      <div className="relative mb-3">
        <img
          src={song.thumbnail}
          alt={song.title}
          className="w-full aspect-square object-cover rounded-md shadow-lg shadow-black/40"
          onError={e => { e.target.src = '/logo-dark.png'; }}
        />
        <div className="absolute bottom-2 right-2 w-10 h-10 bg-primary rounded-full
                        flex items-center justify-center shadow-xl shadow-black/50
                        opacity-0 translate-y-2
                        group-hover:opacity-100 group-hover:translate-y-0
                        transition-all duration-300 ease-out">
          <svg className="w-5 h-5 text-black ml-0.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z"/>
          </svg>
        </div>
      </div>
      <p className="text-white text-sm font-semibold truncate">{song.title}</p>
      <p className="text-muted text-xs truncate mt-1">{song.artist}</p>
    </button>
  );
}

function RecommendationSkeleton() {
  return (
    <section>
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="space-y-2">
          <div className="h-7 w-48 bg-elevated rounded-lg animate-pulse" />
          <div className="h-3 w-40 bg-elevated rounded animate-pulse" />
        </div>
        <div className="h-4 w-12 bg-elevated rounded animate-pulse mt-1" />
      </div>
      <div className="flex gap-5 overflow-x-auto no-scrollbar pb-1">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="w-40 sm:w-44 md:w-48 flex-shrink-0 animate-pulse">
            <div className="w-full aspect-square bg-elevated rounded-lg mb-3" />
            <div className="h-3.5 bg-elevated rounded w-3/4 mb-2" />
            <div className="h-3 bg-elevated rounded w-1/2" />
          </div>
        ))}
      </div>
    </section>
  );
}

export default function RecommendedSection() {
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [hasHistory, setHasHistory] = useState(false);
  const fetchedRef = useRef(false);
  const railRef = useRef(null);

  const fetchRecommendations = (bypassCache = false) => {
    fetchedRef.current = true;
    let active = true;

    const recentSongs = readRecentSongs();
    setHasHistory(recentSongs.length > 0);
    const fingerprint = makeRecentFingerprint(recentSongs);

    if (!bypassCache) {
      const cachedTracks = readRecommendationCache(fingerprint);
      if (cachedTracks?.length) {
        setTracks(cachedTracks);
        setLoading(false);
        setError(false);
        return () => { active = false; };
      }
    }

    const skeletonTimer = window.setTimeout(() => {
      if (active) setLoading(true);
    }, SKELETON_DELAY_MS);

    getRecommendations(recentSongs)
      .then((data) => {
        if (!active) return;
        if (Array.isArray(data) && data.length > 0) {
          writeRecommendationCache(fingerprint, data);
          setTracks(data);
          setError(false);
        } else {
          setError(true);
        }
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) {
          window.clearTimeout(skeletonTimer);
          setLoading(false);
        }
      });

    return () => {
      active = false;
      window.clearTimeout(skeletonTimer);
    };
  };

  useEffect(() => {
    if (fetchedRef.current) return;
    const cleanup = fetchRecommendations(false);
    return cleanup;
  }, []);

  if (loading) return <RecommendationSkeleton />;

  if (error) {
    return (
      <section>
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h2 className="text-white font-bold text-xl">Recommended for you</h2>
            <p className="text-muted text-sm mt-1">
              {hasHistory ? 'Based on your recent listening' : 'Popular picks to get you started'}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-center py-10 gap-3 text-gray-500">
          <svg className="w-10 h-10" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z"/>
          </svg>
          <p className="text-sm">Could not load recommendations</p>
          <button
            onClick={() => {
              setError(false);
              setLoading(true);
              fetchedRef.current = false;
              fetchRecommendations(true);
            }}
            className="text-xs font-medium text-primary hover:underline mt-1"
          >
            Try again
          </button>
        </div>
      </section>
    );
  }

  if (tracks.length === 0) return null;

  return (
    <section>
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="text-white font-bold text-xl">Recommended for you</h2>
          <p className="text-muted text-sm mt-1">
            {hasHistory ? 'Based on your recent listening' : 'Popular picks to get you started'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => railRef.current?.scrollTo({ left: railRef.current.scrollWidth, behavior: 'smooth' })}
          className="text-xs font-medium text-muted hover:text-white transition-colors mt-1"
        >
          See all
        </button>
      </div>

      <div ref={railRef} className="flex gap-5 overflow-x-auto no-scrollbar pb-1">
        {tracks.map((song, index) => (
          <RecommendationCard
            key={song.videoId || index}
            song={song}
            queue={tracks.slice(index + 1)}
          />
        ))}
      </div>
    </section>
  );
}
