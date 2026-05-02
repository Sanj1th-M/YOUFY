import { useEffect, useRef, useState } from 'react';
import usePlayerStore from '../../store/usePlayerStore';
import usePlaylistStore from '../../store/usePlaylistStore';
import { isSystemLikedPlaylist } from '../../utils/playlists';

function fmt(s) {
  if (!s || isNaN(s)) return '';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function useOutsideClick(ref, handler, when = true) {
  useEffect(() => {
    if (!when) return;
    const onMouseDown = (e) => {
      if (!ref.current) return;
      if (ref.current.contains(e.target)) return;
      handler?.();
    };
    window.addEventListener('mousedown', onMouseDown);
    return () => window.removeEventListener('mousedown', onMouseDown);
  }, [ref, handler, when]);
}

function QueueItemMenu({ song, index, queueLength, onClose }) {
  const menuRef = useRef(null);

  const playlists = usePlaylistStore(s => s.playlists);
  const addSongToPlaylist = usePlaylistStore(s => s.addSong);
  const toggleLike = usePlaylistStore(s => s.toggleLike);

  const addToQueue = usePlayerStore(s => s.addToQueue);
  const removeFromQueue = usePlayerStore(s => s.removeFromQueue);

  const liked = usePlaylistStore((s) => {
    if (!song?.videoId) return false;
    const likedPlaylist = s.playlists.find(isSystemLikedPlaylist);
    return Boolean(likedPlaylist?.songs?.some((playlistSong) => playlistSong?.videoId === song.videoId));
  });

  useOutsideClick(menuRef, onClose, true);

  const handleShare = async () => {
    const text = `${song?.title || 'Song'} — ${song?.artist || ''}`.trim();
    try {
      if (navigator.share) {
        await navigator.share({ title: song?.title || 'Song', text });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      }
    } finally {
      onClose?.();
    }
  };

  return (
    <div
      ref={menuRef}
      className="absolute right-0 top-10 w-72 bg-[#2a2a2a] border border-white/10 rounded-xl
                 shadow-2xl shadow-black/60 overflow-hidden z-[70]"
    >
      <button
        type="button"
        className="w-full flex items-center gap-3 px-4 py-3 text-left text-white hover:bg-white/5 transition-colors"
        onClick={() => { onClose?.(); }}
      >
        <span className="text-white/80">＋</span>
        <span className="font-medium">Add to playlist</span>
        <span className="ml-auto text-white/60">›</span>
      </button>

      <div className="max-h-56 overflow-y-auto border-b border-white/5">
        <div className="px-4 py-2 text-xs text-white/60">Find a playlist</div>
        {playlists?.length ? (
          <div className="pb-2">
            {playlists
              .filter(p => !p?.systemKey) // keep it simple (don’t list system playlists here)
              .slice(0, 12)
              .map((pl) => (
                <button
                  key={pl.id}
                  type="button"
                  className="w-full px-4 py-2 text-left text-sm text-white hover:bg-white/5 transition-colors truncate"
                  onClick={() => { addSongToPlaylist(pl.id, song); onClose?.(); }}
                >
                  {pl.name}
                </button>
              ))}
          </div>
        ) : (
          <div className="px-4 pb-3 text-sm text-white/60">No playlists yet</div>
        )}
      </div>

      <button
        type="button"
        className="w-full flex items-center gap-3 px-4 py-3 text-left text-white hover:bg-white/5 transition-colors"
        onClick={() => { toggleLike(song); onClose?.(); }}
      >
        <span className="text-white/80">♡</span>
        <span className="font-medium">{liked ? 'Remove from your Liked Songs' : 'Save to your Liked Songs'}</span>
      </button>

      <button
        type="button"
        className="w-full flex items-center gap-3 px-4 py-3 text-left text-white hover:bg-white/5 transition-colors"
        onClick={() => { addToQueue(song); onClose?.(); }}
      >
        <span className="text-white/80">≡</span>
        <span className="font-medium">Add to queue</span>
      </button>

      <button
        type="button"
        className="w-full flex items-center gap-3 px-4 py-3 text-left text-white hover:bg-white/5 transition-colors"
        onClick={() => { removeFromQueue(song?.videoId); onClose?.(); }}
      >
        <span className="text-white/80">🗑</span>
        <span className="font-medium">Remove from queue</span>
      </button>

      <div className="h-px bg-white/10 my-1" />

      <button
        type="button"
        className="w-full flex items-center gap-3 px-4 py-3 text-left text-white hover:bg-white/5 transition-colors"
        onClick={handleShare}
      >
        <span className="text-white/80">⤴</span>
        <span className="font-medium">Share</span>
        <span className="ml-auto text-xs text-white/50">{navigator.share ? '' : 'Copy'}</span>
      </button>
    </div>
  );
}

export default function QueuePanel({ onClose }) {
  const queue = usePlayerStore(s => s.queue);
  const playFromQueueIndex = usePlayerStore(s => s.playFromQueueIndex);
  const moveQueueItem = usePlayerStore(s => s.moveQueueItem);
  const clearQueue = usePlayerStore(s => s.clearQueue);
  const [openMenuFor, setOpenMenuFor] = useState(null); // videoId
  const [dragFrom, setDragFrom] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  return (
    <div
      role="dialog"
      aria-label="Queue"
      className="fixed right-4 bottom-[100px] w-[420px] max-w-[calc(100vw-32px)] z-[60]
                 bg-black border border-white/10 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <div>
          <p className="text-white font-semibold">Queue</p>
          <p className="text-xs text-muted">{queue?.length ? `${queue.length} up next` : 'No songs in queue'}</p>
        </div>

        <div className="flex items-center gap-2">
          {queue?.length > 0 && (
            <button
              type="button"
              onClick={clearQueue}
              className="text-xs font-medium text-muted hover:text-white transition-colors px-2 py-1 rounded-md hover:bg-white/5"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full text-muted hover:text-white hover:bg-white/5 transition-colors"
            aria-label="Close queue"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div className="max-h-[60vh] overflow-y-auto">
        {queue?.length ? (
          <div className="p-2">
            {queue.map((song, idx) => (
              <div
                key={`${song?.videoId || idx}`}
                className={`flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-colors group relative
                  ${dragOver === idx ? 'ring-1 ring-primary/60 bg-white/5' : ''}`}
                onDragOver={(e) => {
                  if (dragFrom === null) return;
                  e.preventDefault();
                  setDragOver(idx);
                }}
                onDragLeave={() => {
                  if (dragOver === idx) setDragOver(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragFrom === null || dragFrom === idx) {
                    setDragFrom(null);
                    setDragOver(null);
                    return;
                  }
                  moveQueueItem(dragFrom, idx);
                  setDragFrom(null);
                  setDragOver(null);
                }}
              >
                <button
                  type="button"
                  className="flex items-center gap-3 flex-1 min-w-0 text-left"
                  onClick={() => playFromQueueIndex(idx)}
                  aria-label={`Play ${song?.title || 'song'}`}
                >
                  <img
                    src={song?.thumbnail || '/logo-dark.png'}
                    alt={song?.title || 'Song'}
                    className="w-10 h-10 rounded object-cover flex-shrink-0"
                    onError={(e) => { e.target.src = '/logo-dark.png'; }}
                  />
                  <div className="min-w-0">
                    <p className="text-sm text-white font-medium truncate">{song?.title || 'Unknown'}</p>
                    <p className="text-xs text-muted truncate">
                      {song?.artist || 'Unknown'}{song?.durationSeconds ? ` • ${fmt(song.durationSeconds)}` : ''}
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  className="p-2 rounded-md text-muted hover:text-white hover:bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
                  aria-label="More options"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenMenuFor((prev) => (prev === song?.videoId ? null : song?.videoId));
                  }}
                  draggable
                  onDragStart={(e) => {
                    e.stopPropagation();
                    setOpenMenuFor(null);
                    setDragFrom(idx);
                    setDragOver(idx);
                    e.dataTransfer.effectAllowed = 'move';
                    try {
                      e.dataTransfer.setData('text/plain', String(idx));
                    } catch {
                      // ignore
                    }
                  }}
                  onDragEnd={() => {
                    setDragFrom(null);
                    setDragOver(null);
                  }}
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                  </svg>
                </button>

                {openMenuFor && openMenuFor === song?.videoId && (
                  <QueueItemMenu
                    song={song}
                    index={idx}
                    queueLength={queue.length}
                    onClose={() => setOpenMenuFor(null)}
                  />
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="p-10 text-center text-muted">
            <div className="mx-auto w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-4">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24">
                <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h10" />
              </svg>
            </div>
            <p className="text-white font-semibold">Add to your queue</p>
            <p className="text-sm text-muted mt-1">Use “Add to queue” on any song.</p>
          </div>
        )}
      </div>
    </div>
  );
}

