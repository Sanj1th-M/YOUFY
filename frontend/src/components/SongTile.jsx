import usePlayerStore    from '../store/usePlayerStore';
import usePlaylistStore  from '../store/usePlaylistStore';
import { useState }      from 'react';

function fmt(s) {
  if (!s) return '';
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function SongTile({ song, queue = [], compact = false }) {
  const playSong      = usePlayerStore(s => s.playSong);
  const addToQueue    = usePlayerStore(s => s.addToQueue);
  const currentSong   = usePlayerStore(s => s.currentSong);
  const isPlaying     = usePlayerStore(s => s.isPlaying);
  const playlists     = usePlaylistStore(s => s.playlists);
  const addSong       = usePlaylistStore(s => s.addSong);
  const [menu, setMenu] = useState(false);

  const isActive = currentSong?.videoId === song.videoId;

  return (
    <div
      className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer group transition-colors
        hover:bg-subtle ${isActive ? 'bg-subtle' : ''}`}
    >
      {/* Thumbnail */}
      <div className="relative flex-shrink-0" onClick={() => playSong(song, queue)}>
        <img
          src={song.thumbnail}
          alt={song.title}
          className={`${compact ? 'w-10 h-10' : 'w-12 h-12'} rounded object-cover`}
          onError={e => { e.target.src = '/logo-dark.png'; }}
        />
        {isActive && isPlaying && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded">
            <div className="flex gap-0.5 items-end h-4">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-1 bg-primary rounded-full animate-bounce"
                  style={{ height: `${(i + 1) * 4 + 4}px`, animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0" onClick={() => playSong(song, queue)}>
        <p className={`truncate text-sm font-medium ${isActive ? 'text-primary' : 'text-white'}`}>
          {song.title}
        </p>
        <p className="truncate text-xs text-gray-400">{song.artist}</p>
      </div>

      {/* Duration */}
      {!compact && song.durationSeconds && (
        <span className="text-xs text-gray-500 hidden sm:block flex-shrink-0">
          {fmt(song.durationSeconds)}
        </span>
      )}

      {/* Add to playlist menu */}
      <div className="relative flex-shrink-0">
        <button
          onClick={() => setMenu(!menu)}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-gray-400 hover:text-white"
          aria-label="Song actions"
          type="button"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
          </svg>
        </button>
        {menu && (
          <div className="absolute right-0 bottom-8 bg-elevated border border-subtle rounded-lg
                          shadow-xl z-20 min-w-44 py-1 overflow-hidden">
            <button
              type="button"
              onClick={() => { addToQueue(song); setMenu(false); }}
              className="w-full text-left px-3 py-2 text-sm text-white hover:bg-subtle transition-colors truncate"
            >
              Add to queue
            </button>

            {playlists.length > 0 && (
              <>
                <div className="h-px bg-white/5 my-1" />
                <p className="text-xs text-gray-500 px-3 py-1">Add to playlist</p>
                {playlists.map(pl => (
                  <button
                    key={pl.id}
                    onClick={() => { addSong(pl.id, song); setMenu(false); }}
                    className="w-full text-left px-3 py-2 text-sm text-white hover:bg-subtle transition-colors truncate"
                    type="button"
                  >
                    {pl.name}
                  </button>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
