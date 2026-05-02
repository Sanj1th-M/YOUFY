/**
 * RecommendedForYou — Spotify-style horizontal recommendation row
 *
 * - Only renders when recommendations.length > 0 (handles cold start)
 * - Skeleton loader during loading
 * - ErrorBoundary wrapping for crash safety
 * - Matches existing TrendingSection card design
 */

import { Component, useState } from 'react';
import useRecommendations from '../../hooks/useRecommendations';
import usePlayerStore from '../../store/usePlayerStore';

// ─── Error Boundary ──────────────────────────────────────────
class RecommendationErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('[RecommendedForYou] ErrorBoundary caught:', error, info?.componentStack);
  }

  render() {
    if (this.state.hasError) {
      // Render nothing on error — never show broken UI
      return null;
    }
    return this.props.children;
  }
}

// ─── Skeleton Loader ─────────────────────────────────────────
function RecommendedSkeleton() {
  return (
    <section className="space-y-4">
      <div className="h-7 w-52 bg-elevated rounded-lg animate-pulse" />
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex-shrink-0 w-[160px] animate-pulse">
            <div className="w-full aspect-square bg-elevated rounded-lg mb-3" />
            <div className="h-3.5 bg-elevated rounded w-3/4 mb-2" />
            <div className="h-3 bg-elevated rounded w-1/2" />
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Song Card ───────────────────────────────────────────────
function RecommendedCard({ song, onPlay }) {
  const [imgError, setImgError] = useState(false);
  const currentSong = usePlayerStore((s) => s.currentSong);
  const isPlaying   = usePlayerStore((s) => s.isPlaying);
  const isActive    = currentSong?.videoId === song.videoId;

  return (
    <button
      type="button"
      onClick={onPlay}
      className="liquid-glass-card flex-shrink-0 w-[160px] rounded-lg p-3
                 transition-all duration-300 group cursor-pointer text-left"
      aria-label={`Play ${song.title} by ${song.artist}`}
    >
      {/* Album Art */}
      <div className="relative mb-3">
        <img
          src={imgError ? '/logo-dark.png' : (song.thumbnail || '/logo-dark.png')}
          alt={song.title}
          className="w-full aspect-square object-cover rounded-md shadow-lg shadow-black/40"
          loading="lazy"
          onError={() => setImgError(true)}
        />
        {/* Bluish-white play button — hover reveal */}
        <div
          className="absolute bottom-2 right-2 w-10 h-10 bg-[#dbeafe] rounded-full
                      flex items-center justify-center shadow-xl shadow-black/50
                      opacity-0 translate-y-2
                      group-hover:opacity-100 group-hover:translate-y-0
                      transition-all duration-300 ease-out"
        >
          <svg className="w-5 h-5 text-black ml-0.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>

        {/* Playing indicator */}
        {isActive && isPlaying && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-md">
            <div className="flex gap-0.5 items-end h-5">
              {[0, 1, 2].map((j) => (
                <div
                  key={j}
                  className="w-1 bg-[#dbeafe] rounded-full animate-bounce"
                  style={{
                    height: `${(j + 1) * 4 + 4}px`,
                    animationDelay: `${j * 0.15}s`,
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Title */}
      <p
        className={`text-sm font-semibold truncate ${
          isActive && isPlaying ? 'playing-title-shimmer' : isActive ? 'text-[#dbeafe]' : 'text-white'
        }`}
        data-text={song.title}
      >
        {song.title}
      </p>
      {/* Artist */}
      <p className="text-muted text-xs truncate mt-1">{song.artist}</p>
    </button>
  );
}

// ─── Main Section ────────────────────────────────────────────
function RecommendedForYouInner({ userId }) {
  const { recommendations, loading, error } = useRecommendations(userId);
  const playSong = usePlayerStore((s) => s.playSong);

  // Loading state — show skeleton
  if (loading && recommendations.length === 0) {
    return <RecommendedSkeleton />;
  }

  // No recommendations or error — render nothing (cold start / error)
  if (!recommendations || recommendations.length === 0) {
    return null;
  }

  return (
    <section
      className="animate-in"
      style={{
        animation: 'recommendedFadeIn 0.5s ease-out forwards',
      }}
    >
      <style>{`
        @keyframes recommendedFadeIn {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>

      <div className="flex items-center justify-between mb-5">
        <h2 className="text-white font-bold text-xl">Recommended For You</h2>
      </div>

      {/* Horizontal scrollable row */}
      <div
        className="flex gap-4 overflow-x-auto pb-2 no-scrollbar"
        role="list"
        aria-label="Recommended songs"
      >
        {recommendations.map((song, i) => (
          <RecommendedCard
            key={song.videoId || i}
            song={song}
            onPlay={() => playSong(song, recommendations.slice(i + 1))}
          />
        ))}
      </div>
    </section>
  );
}

// ─── Exported Component (wrapped in ErrorBoundary) ───────────
export default function RecommendedForYou({ userId }) {
  return (
    <RecommendationErrorBoundary>
      <RecommendedForYouInner userId={userId} />
    </RecommendationErrorBoundary>
  );
}
