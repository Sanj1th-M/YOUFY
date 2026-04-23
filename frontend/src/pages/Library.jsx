import { useState } from 'react';
import { Link } from 'react-router-dom';
import PlaylistCard from '../components/Library/PlaylistCard';
import useAuthStore from '../store/useAuthStore';
import usePlaylistStore from '../store/usePlaylistStore';

export default function Library() {
  const playlists = usePlaylistStore((state) => state.playlists);
  const loading = usePlaylistStore((state) => state.loading);
  const createPlaylist = usePlaylistStore((state) => state.createPlaylist);
  const isCloud = usePlaylistStore((state) => state.isCloud);
  const cloudError = usePlaylistStore((state) => state.cloudError);
  const user = useAuthStore((state) => state.user);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [showInput, setShowInput] = useState(false);

  const handleCreate = async (event) => {
    event.preventDefault();
    if (!newName.trim()) return;

    setCreating(true);
    try {
      const created = await createPlaylist(newName.trim());
      if (created?.id) {
        setNewName('');
        setShowInput(false);
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-6 lg:px-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Your Library</h1>
          {user && cloudError ? (
            <p className="mt-1 text-xs text-amber-300/80">
              Cloud sync unavailable. Showing your last synced library.
            </p>
          ) : !user && !isCloud ? (
            <p className="mt-1 text-xs text-gray-500">
              Saved locally - <Link to="/login" className="text-primary hover:underline">Log in</Link> to sync
            </p>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          {user ? (
            <Link
              to="/import-playlist"
              className="liquid-glass-button inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-white"
            >
              <svg className="liquid-glass-content h-4 w-4 text-[#FCFFF9]" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              <span className="liquid-glass-content">Import</span>
            </Link>
          ) : null}

          <button
            type="button"
            onClick={() => setShowInput((current) => !current)}
            className="flex items-center gap-2 rounded-full bg-[#FCFFF9] px-4 py-2 text-sm font-bold text-black transition-transform hover:scale-105"
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19 13H13v6h-2v-6H5v-2h6V5h2v6h6v2z" />
            </svg>
            New Playlist
          </button>
        </div>
      </div>

      {user && cloudError ? (
        <div className="mb-6 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          {cloudError}
        </div>
      ) : null}

      {showInput ? (
        <form onSubmit={handleCreate} className="mb-6 flex gap-2">
          <input
            type="text"
            autoFocus
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="Playlist name..."
            className="flex-1 rounded-lg border border-subtle bg-elevated px-4 py-2.5 text-sm text-white outline-none focus:border-primary"
          />
          <button
            type="submit"
            disabled={creating || !newName.trim()}
            className="rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-black transition-colors hover:bg-green-400 disabled:opacity-50"
          >
            {creating ? '...' : 'Create'}
          </button>
          <button
            type="button"
            onClick={() => setShowInput(false)}
            className="px-3 text-gray-400 hover:text-white"
          >
            x
          </button>
        </form>
      ) : null}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((item) => (
            <div key={item} className="flex gap-4 rounded-xl bg-elevated p-4 animate-pulse">
              <div className="h-14 w-14 rounded-lg bg-subtle" />
              <div className="flex-1 space-y-2 py-1">
                <div className="h-4 w-1/3 rounded bg-subtle" />
                <div className="h-3 w-1/5 rounded bg-subtle" />
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {!loading && playlists.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-20 text-gray-500">
          <svg className="h-16 w-16" fill="none" stroke="currentColor" strokeWidth="1.2" viewBox="0 0 24 24">
            <path strokeLinecap="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
          </svg>
          <p>No playlists yet</p>
          <button type="button" onClick={() => setShowInput(true)} className="text-sm text-primary hover:underline">
            Create your first playlist
          </button>
        </div>
      ) : null}

      {!loading && playlists.length > 0 ? (
        <div className="space-y-3">
          {playlists.map((playlist) => <PlaylistCard key={playlist.id} playlist={playlist} />)}
        </div>
      ) : null}
    </div>
  );
}
