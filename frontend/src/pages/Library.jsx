import { useState } from 'react';
import { Link } from 'react-router-dom';
import usePlaylistStore from '../store/usePlaylistStore';
import useAuthStore     from '../store/useAuthStore';
import PlaylistCard     from '../components/Library/PlaylistCard';

export default function Library() {
  const playlists      = usePlaylistStore(s => s.playlists);
  const loading        = usePlaylistStore(s => s.loading);
  const createPlaylist = usePlaylistStore(s => s.createPlaylist);
  const isCloud        = usePlaylistStore(s => s.isCloud);
  const user           = useAuthStore(s => s.user);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [showInput, setShowInput] = useState(false);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await createPlaylist(newName.trim());
      setNewName('');
      setShowInput(false);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="px-4 md:px-6 lg:px-8 py-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-white text-2xl font-bold">Your Library</h1>
          {!isCloud && (
            <p className="text-gray-500 text-xs mt-1">
              Saved locally ·{' '}
              <Link to="/login" className="text-primary hover:underline">Log in</Link> to sync
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {user && (
            <Link
              to="/import-playlist"
              className="flex items-center gap-2 border border-subtle text-white text-sm font-semibold
                         px-4 py-2 rounded-full hover:border-white/20 transition-colors"
            >
              Import
            </Link>
          )}
          <button
            onClick={() => setShowInput(!showInput)}
            className="flex items-center gap-2 bg-primary text-black text-sm font-bold
                       px-4 py-2 rounded-full hover:scale-105 transition-transform"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19 13H13v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
            </svg>
            New Playlist
          </button>
        </div>
      </div>

      {/* Create playlist input */}
      {showInput && (
        <form onSubmit={handleCreate} className="flex gap-2 mb-6">
          <input
            type="text" autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Playlist name..."
            className="flex-1 bg-elevated text-white rounded-lg px-4 py-2.5 text-sm
                       border border-subtle focus:border-primary outline-none"
          />
          <button type="submit" disabled={creating || !newName.trim()}
            className="bg-primary text-black font-bold px-5 py-2.5 rounded-lg text-sm
                       disabled:opacity-50 hover:bg-green-400 transition-colors">
            {creating ? '...' : 'Create'}
          </button>
          <button type="button" onClick={() => setShowInput(false)}
            className="text-gray-400 hover:text-white px-3">✕</button>
        </form>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {[1,2,3].map(i => (
            <div key={i} className="bg-elevated rounded-xl p-4 animate-pulse flex gap-4">
              <div className="w-14 h-14 bg-subtle rounded-lg" />
              <div className="flex-1 space-y-2 py-1">
                <div className="h-4 bg-subtle rounded w-1/3" />
                <div className="h-3 bg-subtle rounded w-1/5" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && playlists.length === 0 && (
        <div className="flex flex-col items-center py-20 gap-4 text-gray-500">
          <svg className="w-16 h-16" fill="none" stroke="currentColor" strokeWidth="1.2" viewBox="0 0 24 24">
            <path strokeLinecap="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z"/>
          </svg>
          <p>No playlists yet</p>
          <button onClick={() => setShowInput(true)}
            className="text-primary hover:underline text-sm">Create your first playlist</button>
        </div>
      )}

      {/* Playlists */}
      {!loading && playlists.length > 0 && (
        <div className="space-y-3">
          {playlists.map(pl => <PlaylistCard key={pl.id} playlist={pl} />)}
        </div>
      )}
    </div>
  );
}
