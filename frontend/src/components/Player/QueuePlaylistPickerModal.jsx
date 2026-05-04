import { useEffect, useMemo, useState } from 'react';

export default function QueuePlaylistPickerModal({
  song,
  playlists = [],
  busy = false,
  onClose,
  onAddToPlaylist,
  onCreatePlaylist,
}) {
  const [newPlaylistName, setNewPlaylistName] = useState('');

  useEffect(() => {
    setNewPlaylistName('');
  }, [song?.videoId]);

  const availablePlaylists = useMemo(
    () => playlists.filter((playlist) => playlist?.id),
    [playlists],
  );

  if (!song) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        aria-label="Close playlist picker"
        onClick={onClose}
        className="absolute inset-0 bg-black/78 backdrop-blur-md"
      />

      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-[28px] border border-white/10 bg-black/88 shadow-[0_32px_90px_rgba(0,0,0,0.62)] backdrop-blur-[28px]">
        <div className="px-5 py-5 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] uppercase tracking-[0.28em] text-white/45">Add To Playlist</p>
              <div className="mt-4 flex items-center gap-3">
                <img
                  src={song?.thumbnail || '/logo-dark.png'}
                  alt={song?.title || 'Song'}
                  className="h-12 w-12 rounded-2xl object-cover"
                  onError={(event) => { event.target.src = '/logo-dark.png'; }}
                />
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-white">{song?.title || 'Unknown title'}</p>
                  <p className="truncate text-sm text-white/55">{song?.artist || 'Unknown artist'}</p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/45 transition hover:bg-white/[0.06] hover:text-white"
              aria-label="Close playlist picker"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          <div className="mt-5 rounded-[22px] border border-white/10 bg-white/[0.04] p-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                value={newPlaylistName}
                onChange={(event) => setNewPlaylistName(event.target.value)}
                placeholder="New playlist"
                maxLength={100}
                className="h-11 flex-1 rounded-full border border-white/10 bg-black/20 px-4 text-sm text-white outline-none transition-colors placeholder:text-white/35 focus:border-white/20"
              />
              <button
                type="button"
                disabled={busy || !newPlaylistName.trim()}
                onClick={() => onCreatePlaylist(newPlaylistName.trim())}
                className="h-11 rounded-full bg-white/12 px-4 text-sm font-medium text-white transition-colors hover:bg-white/18 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? 'Saving...' : 'Create'}
              </button>
            </div>
          </div>

          <div className="mt-4 max-h-[320px] space-y-2 overflow-y-auto pr-1">
            {availablePlaylists.length > 0 ? (
              availablePlaylists.map((playlist) => (
                <button
                  key={playlist.id}
                  type="button"
                  disabled={busy}
                  onClick={() => onAddToPlaylist(playlist.id)}
                  className="flex w-full items-center justify-between rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-3 text-left transition-colors hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{playlist.name}</p>
                    <p className="mt-1 text-xs text-white/45">
                      {(playlist.songs || []).length} song{(playlist.songs || []).length === 1 ? '' : 's'}
                    </p>
                  </div>
                  <span className="rounded-full border border-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50">
                    Add
                  </span>
                </button>
              ))
            ) : (
              <div className="rounded-[20px] border border-dashed border-white/10 px-4 py-8 text-center text-sm text-white/45">
                No playlists yet. Create one to save this song.
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end border-t border-white/10 px-5 py-4 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-2 text-sm font-medium text-white/70 transition-colors hover:text-white"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
