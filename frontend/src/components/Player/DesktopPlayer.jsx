import { useEffect, useState } from 'react';
import usePlayerStore from '../../store/usePlayerStore';
import ProgressBar from './ProgressBar';
import usePlaylistStore from '../../store/usePlaylistStore';
import QueuePanel from './QueuePanel';

export default function DesktopPlayer() {
  const currentSong = usePlayerStore(s => s.currentSong);
  const isPlaying   = usePlayerStore(s => s.isPlaying);
  const isLoading   = usePlayerStore(s => s.isLoading);
  const togglePlay  = usePlayerStore(s => s.togglePlay);
  const playNext    = usePlayerStore(s => s.playNext);
  const playPrev    = usePlayerStore(s => s.playPrev);
  const volume      = usePlayerStore(s => s.volume);
  const setVolume   = usePlayerStore(s => s.setVolume);
  const queue       = usePlayerStore(s => s.queue);
  const isSongLiked = usePlaylistStore(s => s.isSongLiked);
  const toggleLike  = usePlaylistStore(s => s.toggleLike);
  const [showQueue, setShowQueue] = useState(false);

  const liked = currentSong ? isSongLiked(currentSong.videoId) : false;

  useEffect(() => {
    if (!showQueue) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setShowQueue(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showQueue]);

  if (!currentSong) return null;

  return (
    <>
      {showQueue && (
        <>
          <div
            className="hidden md:block fixed inset-0 z-[55]"
            onClick={() => setShowQueue(false)}
          />
          <QueuePanel onClose={() => setShowQueue(false)} />
        </>
      )}

      <div
        id="desktop-player"
        className="hidden md:flex fixed bottom-0 left-0 right-0 h-[90px] z-50
                   bg-elevated border-t border-white/5 px-4 items-center"
      >
      {/* ── Left: Track Info ── */}
      <div className="flex items-center gap-3 w-[30%] min-w-0">
        <img
          src={currentSong.thumbnail}
          alt={currentSong.title}
          className="w-14 h-14 rounded object-cover flex-shrink-0"
          onError={e => { e.target.src = '/logo-dark.png'; }}
        />
        <div className="min-w-0">
          <p className="text-white text-sm font-medium truncate">{currentSong.title}</p>
          <p className="text-muted text-xs truncate">{currentSong.artist}</p>
        </div>
        <button
          type="button"
          onClick={() => toggleLike(currentSong)}
          className={`ml-1 p-2 rounded-full transition-colors
            ${liked ? 'text-primary' : 'text-gray-400 hover:text-white'}`}
          aria-label={liked ? 'Unlike' : 'Like'}
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
          </svg>
        </button>
      </div>

      {/* ── Center: Controls + Progress ── */}
      <div className="flex flex-col items-center justify-center flex-1 max-w-[45%] gap-1.5">
        {/* Playback buttons */}
        <div className="flex items-center gap-5">
          {/* Previous */}
          <button
            onClick={playPrev}
            className="text-muted hover:text-white transition-colors"
            aria-label="Previous track"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/>
            </svg>
          </button>

          {/* Play / Pause */}
          <button
            onClick={togglePlay}
            className="w-9 h-9 bg-white rounded-full flex items-center justify-center
                       hover:scale-105 active:scale-95 transition-transform flex-shrink-0"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
            ) : isPlaying ? (
              <svg className="w-5 h-5" fill="black" viewBox="0 0 24 24">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
              </svg>
            ) : (
              <svg className="w-5 h-5 ml-0.5" fill="black" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
            )}
          </button>

          {/* Next */}
          <button
            onClick={playNext}
            className="text-muted hover:text-white transition-colors"
            aria-label="Next track"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
            </svg>
          </button>
        </div>

        {/* Progress bar */}
        <div className="w-full">
          <ProgressBar />
        </div>
      </div>

      {/* ── Right: Volume ── */}
      <div className="flex items-center justify-end gap-2 w-[30%] min-w-0">
        <button
          type="button"
          onClick={() => setShowQueue(v => !v)}
          className={`p-2 rounded-md transition-colors
            ${showQueue ? 'text-white bg-white/5' : 'text-muted hover:text-white hover:bg-white/5'}`}
          aria-label="Open queue"
          title="Queue"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h10" />
          </svg>
          {Array.isArray(queue) && queue.length > 0 && (
            <span className="sr-only">{queue.length} in queue</span>
          )}
        </button>

        <button
          onClick={() => setVolume(volume > 0 ? 0 : 1)}
          className="text-muted hover:text-white transition-colors"
          aria-label="Toggle mute"
        >
          {volume === 0 ? (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M16.5 12A4.5 4.5 0 0014 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.796 8.796 0 0021 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 003.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
            </svg>
          ) : volume < 0.5 ? (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M7 9v6h4l5 5V4L11 9H7z"/>
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
            </svg>
          )}
        </button>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={volume}
          onChange={e => setVolume(parseFloat(e.target.value))}
          className="w-24 accent-primary"
          style={{
            background: `linear-gradient(to right, #1DB954 ${volume * 100}%, #535353 ${volume * 100}%)`,
          }}
          aria-label="Volume"
        />
      </div>
      </div>
    </>
  );
}
