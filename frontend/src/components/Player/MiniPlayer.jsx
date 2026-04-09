import usePlayerStore from '../../store/usePlayerStore';
import usePlaylistStore from '../../store/usePlaylistStore';

export default function MiniPlayer() {
  const currentSong      = usePlayerStore(s => s.currentSong);
  const isPlaying        = usePlayerStore(s => s.isPlaying);
  const isLoading        = usePlayerStore(s => s.isLoading);
  const togglePlay       = usePlayerStore(s => s.togglePlay);
  const setShowFullPlayer = usePlayerStore(s => s.setShowFullPlayer);
  const currentTime      = usePlayerStore(s => s.currentTime);
  const duration         = usePlayerStore(s => s.duration);
  const isSongLiked      = usePlaylistStore(s => s.isSongLiked);
  const toggleLike       = usePlaylistStore(s => s.toggleLike);

  if (!currentSong) return null;

  const pct = duration ? (currentTime / duration) * 100 : 0;
  const liked = isSongLiked(currentSong.videoId);

  return (
    <div
      id="mini-player"
      className="md:hidden fixed bottom-14 left-2 right-2 z-40
                 bg-elevated rounded-lg overflow-hidden shadow-2xl shadow-black/60
                 border border-white/5"
    >
      {/* Thin progress line at top of mini player */}
      <div className="w-full h-[2px] bg-white/10">
        <div
          className="h-full bg-primary transition-all duration-300 ease-linear"
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
            onError={e => { e.target.src = '/logo-dark.png'; }}
          />
        </button>

        {/* Song info — tap to open full player */}
        <button
          onClick={() => setShowFullPlayer(true)}
          className="flex-1 min-w-0 text-left"
        >
          <p className="text-white text-sm font-medium truncate">{currentSong.title}</p>
          <p className="text-muted text-xs truncate">{currentSong.artist}</p>
        </button>

        {/* Play / Pause */}
        <button
          onClick={togglePlay}
          className="w-8 h-8 flex items-center justify-center text-white flex-shrink-0"
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isLoading ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
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
        <button
          type="button"
          onClick={() => toggleLike(currentSong)}
          className={`w-8 h-8 flex items-center justify-center flex-shrink-0 transition-colors
            ${liked ? 'text-primary' : 'text-gray-400 hover:text-white'}`}
          aria-label={liked ? 'Unlike' : 'Like'}
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
