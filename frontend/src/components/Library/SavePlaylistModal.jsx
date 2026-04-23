import { useMemo, useState } from 'react';

export default function SavePlaylistModal({
  sourcePlaylist,
  playlists = [],
  onClose,
  onSaveToPlaylist,
  onCreateAndSave,
  saving = false,
}) {
  const [newPlaylistName, setNewPlaylistName] = useState('');

  const destinationPlaylists = useMemo(() => playlists.filter((playlist) => (
    playlist?.id && playlist.id !== sourcePlaylist?.id
  )), [playlists, sourcePlaylist]);

  if (!sourcePlaylist) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close save playlist modal"
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
      />

      <div className="relative z-10 w-full max-w-2xl overflow-hidden rounded-[28px] border border-white/10 bg-[#181818] shadow-[0_28px_100px_rgba(0,0,0,0.62)]">
        <div className="border-b border-white/10 px-6 py-5 sm:px-8">
          <p className="text-[11px] uppercase tracking-[0.28em] text-white/45">Save To Playlist</p>
          <h2 className="mt-3 text-3xl font-bold text-white">{sourcePlaylist.name}</h2>
          <p className="mt-2 text-sm text-white/55">
            Save every track from this playlist into another playlist in your library.
          </p>
        </div>

        <div className="grid gap-6 px-6 py-6 sm:px-8">
          <div className="rounded-[24px] border border-white/10 bg-[#121212] p-5">
            <p className="text-sm font-semibold text-white">Create a new destination</p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <input
                value={newPlaylistName}
                onChange={(event) => setNewPlaylistName(event.target.value)}
                placeholder="New playlist name"
                className="flex-1 rounded-full border border-white/10 bg-black/20 px-5 py-3 text-white outline-none transition-colors focus:border-white/30"
                maxLength={100}
              />
              <button
                type="button"
                disabled={saving || !newPlaylistName.trim()}
                onClick={() => onCreateAndSave(newPlaylistName.trim())}
                className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {saving ? 'Saving...' : 'Create + Save'}
              </button>
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-white">Or add to an existing playlist</p>

            <div className="mt-4 max-h-[320px] space-y-2 overflow-y-auto pr-1">
              {destinationPlaylists.length > 0 ? (
                destinationPlaylists.map((playlist) => (
                  <button
                    key={playlist.id}
                    type="button"
                    disabled={saving}
                    onClick={() => onSaveToPlaylist(playlist.id)}
                    className="flex w-full items-center justify-between rounded-[20px] border border-white/10 bg-white/[0.03] px-5 py-4 text-left transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-white">{playlist.name}</p>
                      <p className="mt-1 text-sm text-white/50">
                        {(playlist.songs || []).length} song{(playlist.songs || []).length !== 1 ? 's' : ''}
                      </p>
                    </div>

                    <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white/55">
                      Save
                    </span>
                  </button>
                ))
              ) : (
                <div className="rounded-[20px] border border-dashed border-white/10 px-5 py-7 text-center text-sm text-white/45">
                  No other playlists yet. Create one above and we will save these tracks into it.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end border-t border-white/10 px-6 py-5 sm:px-8">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-5 py-3 text-sm font-medium text-white/75 transition-colors hover:text-white"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
