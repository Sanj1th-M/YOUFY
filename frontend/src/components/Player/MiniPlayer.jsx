import { useNavigate } from 'react-router-dom';
import usePlayerStore from '../../store/usePlayerStore';
import AnimatedLikeButton from './AnimatedLikeButton';

export default function MiniPlayer() {
  const navigate         = useNavigate();
  const currentSong      = usePlayerStore(s => s.currentSong);
  const isPlaying        = usePlayerStore(s => s.isPlaying);
  const isLoading        = usePlayerStore(s => s.isLoading);
  const togglePlay       = usePlayerStore(s => s.togglePlay);
  const setShowFullPlayer = usePlayerStore(s => s.setShowFullPlayer);
  const currentTime      = usePlayerStore(s => s.currentTime);
  const duration         = usePlayerStore(s => s.duration);

  if (!currentSong) return null;

  const pct = duration ? (currentTime / duration) * 100 : 0;

  return (
    <div
      id="mini-player"
      className="md:hidden fixed bottom-14 left-2 right-2 z-40
                 bg-black rounded-lg overflow-hidden shadow-2xl shadow-black/60
                 border border-white/5"
    >
      {/* Thin progress line at top of mini player */}
      <div className="w-full h-[2px] bg-white/10">
        <div
          className="h-full bg-white transition-all duration-300 ease-linear"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex items-center gap-3 px-3 py-2">
        {/* Album art — tap to open full player */}
        <button
          onClick={() => setShowFullPlayer(true)}
          className="flex-shrink-0"
          aria-label="Open full player"
        >
          <img
            src={currentSong.thumbnail}
            alt={currentSong.title}
            className="w-10 h-10 rounded object-cover"
            onError={e => { e.target.src = '/logo.svg'; }}
          />
        </button>

        {/* Song info — tap to open full player or artist to search */}
        <div className="flex-1 min-w-0 text-left flex flex-col justify-center">
          <button
            type="button"
            className="text-white text-sm font-medium truncate text-left outline-none"
            onClick={() => setShowFullPlayer(true)}
          >
            {currentSong.title}
          </button>
          <button
            type="button"
            className="text-muted text-xs truncate text-left hover:underline w-fit outline-none"
            onClick={(e) => {
              e.stopPropagation();
              setShowFullPlayer(false);
              navigate(`/search?q=${encodeURIComponent(currentSong.artist)}`);
            }}
          >
            {currentSong.artist}
          </button>
        </div>

        {/* Play / Pause */}
        <button
          onClick={togglePlay}
          className="w-8 h-8 flex items-center justify-center text-white flex-shrink-0"
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isLoading ? (
            <div className="youfy-eq scale-[0.4]" aria-hidden="true">
              <span className="youfy-eq-bar bg-white" />
              <span className="youfy-eq-bar bg-white" />
              <span className="youfy-eq-bar bg-white" />
              <span className="youfy-eq-bar bg-white" />
            </div>
          ) : isPlaying ? (
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
            </svg>
          ) : (
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z"/>
            </svg>
          )}
        </button>

        {/* Like */}
        <AnimatedLikeButton
          song={currentSong}
          className="w-8 h-8 flex items-center justify-center flex-shrink-0"
          iconClassName="w-5 h-5"
        />
      </div>
    </div>
  );
}
