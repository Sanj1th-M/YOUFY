import usePlayerStore from '../../store/usePlayerStore';
import PlayerControls from './PlayerControls';
import ProgressBar    from './ProgressBar';

export default function MiniPlayer() {
  const currentSong      = usePlayerStore(s => s.currentSong);
  const setShowFullPlayer = usePlayerStore(s => s.setShowFullPlayer);

  if (!currentSong) return null;

  return (
    <div className="fixed bottom-16 md:bottom-0 left-0 right-0 z-30
                    bg-elevated border-t border-subtle px-4 py-2
                    md:px-6 md:py-3 md:left-56 lg:left-64">
      <ProgressBar compact />
      <div className="flex items-center gap-3 mt-2">
        {/* Thumbnail + info — click to open full player */}
        <button
          onClick={() => setShowFullPlayer(true)}
          className="flex items-center gap-3 flex-1 min-w-0 text-left"
        >
          <img
            src={currentSong.thumbnail}
            alt={currentSong.title}
            className="w-10 h-10 rounded object-cover flex-shrink-0"
            onError={e => { e.target.src = '/logo-dark.png'; }}
          />
          <div className="min-w-0">
            <p className="text-white text-sm font-medium truncate">{currentSong.title}</p>
            <p className="text-gray-400 text-xs truncate">{currentSong.artist}</p>
          </div>
        </button>

        {/* Controls */}
        <PlayerControls size="sm" />
      </div>
    </div>
  );
}
