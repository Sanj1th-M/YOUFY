import { useState } from 'react';
import usePlaylistStore from '../../store/usePlaylistStore';
import usePlayerStore   from '../../store/usePlayerStore';
import SongTile         from '../SongTile';
import AddSongsModal    from './AddSongsModal';

export default function PlaylistCard({ playlist }) {
  const [open, setOpen]   = useState(false);
  const deletePlaylist     = usePlaylistStore(s => s.deletePlaylist);
  const removeSong         = usePlaylistStore(s => s.removeSong);
  const playSong           = usePlayerStore(s => s.playSong);
  const [confirm, setConfirm] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  const songs = playlist.songs || [];
  const isSystem = Boolean(playlist.systemKey);
  const isLikedSongs = playlist.systemKey === 'liked'
    || String(playlist.name || '').toLowerCase() === 'liked songs';

  const playAll = () => {
    if (songs.length > 0) playSong(songs[0], songs.slice(1));
  };

  return (
    <div className="bg-elevated rounded-xl overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-4 p-4 cursor-pointer hover:bg-subtle transition-colors"
        onClick={() => setOpen(!open)}
      >
        {/* Cover — mosaic of first 4 thumbnails */}
        <div className="relative w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 bg-subtle">
          {isLikedSongs ? (
            <div className="w-full h-full">
              <img
                src="/liked-heart.png"
                alt=""
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
          ) : (
            <div className="w-full h-full grid grid-cols-2">
              {songs.slice(0, 4).map((s, i) => (
                <img
                  key={i}
                  src={s.thumbnail || '/logo-dark.png'}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  crossOrigin="anonymous"
                  onError={e => { e.target.src = '/logo-dark.png'; }}
                  alt=""
                />
              ))}
              {songs.length === 0 && (
                <div className="col-span-2 row-span-2 flex items-center justify-center text-gray-600">
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 3v10.55A4 4 0 1014 17V7h4V3h-6z"/>
                  </svg>
                </div>
              )}
            </div>
          )}

          {!isLikedSongs && songs.length > 0 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); playAll(); }}
              aria-label="Play playlist"
              className="absolute inset-0 flex items-center justify-center bg-black/25 hover:bg-black/35 transition-colors"
            >
              <span className="w-8 h-8 rounded-full bg-black/40 flex items-center justify-center">
                <svg className="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              </span>
            </button>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <p className="text-white font-semibold truncate">{playlist.name}</p>
            {isSystem && !isLikedSongs ? (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-gray-300 flex-shrink-0">
                Default
              </span>
            ) : null}
          </div>
          <p className="text-gray-400 text-sm">{songs.length} songs</p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
          {songs.length > 0 && (
            <button onClick={playAll}
              className="w-9 h-9 bg-primary rounded-full flex items-center justify-center
                         hover:scale-105 transition-transform">
              <svg className="w-4 h-4 text-black ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="text-gray-400 hover:text-white transition-colors px-2 py-1 text-sm font-semibold"
          >
            Add songs
          </button>
          {confirm ? (
            <div className="flex gap-1">
              {!isSystem && (
                <button onClick={() => deletePlaylist(playlist.id)}
                  className="text-xs bg-red-500 text-white px-2 py-1 rounded-lg">Delete</button>
              )}
              <button onClick={() => setConfirm(false)}
                className="text-xs bg-subtle text-gray-300 px-2 py-1 rounded-lg">Cancel</button>
            </div>
          ) : (
            !isSystem && (
              <button onClick={() => setConfirm(true)}
                className="text-gray-500 hover:text-red-400 transition-colors p-1">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                </svg>
              </button>
            )
          )}
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
            fill="currentColor" viewBox="0 0 24 24">
            <path d="M7 10l5 5 5-5z"/>
          </svg>
        </div>
      </div>

      {/* Songs list */}
      {open && (
        <div className="px-4 pb-4 space-y-1">
          {songs.length === 0
            ? <p className="text-gray-500 text-sm py-4 text-center">No songs yet</p>
            : songs.map((song, i) => (
                <div key={i} className="flex items-center group">
                  <div className="flex-1 min-w-0">
                    <SongTile song={song} queue={songs.slice(i + 1)} compact />
                  </div>
                  <button
                    onClick={() => removeSong(playlist.id, song.videoId)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-gray-500
                               hover:text-red-400 ml-1 flex-shrink-0"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                    </svg>
                  </button>
                </div>
              ))
          }
        </div>
      )}

      {showAdd && (
        <AddSongsModal
          playlist={playlist}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}
