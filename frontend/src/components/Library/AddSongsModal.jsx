import { useEffect, useMemo, useState } from 'react';
import usePlaylistStore from '../../store/usePlaylistStore';
import { searchMusic } from '../../services/api';
import usePlayerStore from '../../store/usePlayerStore';
import { getPlaylistArtworkSources } from './PlaylistArtwork';

function getBestThumbnail(thumbnails, fallback = '') {
  if (!thumbnails || !thumbnails.length) return fallback;
  const url = thumbnails[thumbnails.length - 1]?.url || fallback;
  if (!url) return fallback;
  const normalized = String(url).replace(/^http:\/\//, 'https://');

  // IMPORTANT: preserve extra params like "-l90-rj" which some hosts require.
  return normalized
    .replace(/=w\d+-h\d+/, '=w512-h512')
    .replace(/=s\d+/, '=s512');
}

function normalizeSong(s) {
  return {
    videoId: s.videoId,
    title: s.name || s.title || 'Unknown',
    artist: s.artist?.name || s.artists?.[0]?.name || 'Unknown',
    thumbnail: getBestThumbnail(s.thumbnails) || s.thumbnail || '',
    durationSeconds: s.duration || 0,
    album: s.album?.name || '',
  };
}

export default function AddSongsModal({ playlist, onClose }) {
  const ANIMATION_MS = 220;
  const addSong = usePlaylistStore(s => s.addSong);
  const playSong = usePlayerStore(s => s.playSong);
  const togglePlay = usePlayerStore(s => s.togglePlay);
  const currentSong = usePlayerStore(s => s.currentSong);
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState([]);
  const [isOpen, setIsOpen] = useState(false);

  const existingIds = useMemo(() => new Set((playlist?.songs || []).map(s => s.videoId)), [playlist]);
  const playlistSongs = playlist?.songs || [];
  const coverThumb = getPlaylistArtworkSources(playlist, playlistSongs)[0] || '/logo.svg';

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setIsOpen(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const closeModal = () => {
    setIsOpen(false);
    window.setTimeout(() => {
      onClose?.();
    }, ANIMATION_MS);
  };

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        closeModal();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    const timer = setTimeout(async () => {
      try {
        const data = await searchMusic(trimmed);
        const songs = Array.isArray(data?.songs) ? data.songs.map(normalizeSong) : [];
        if (active) setResults(songs.filter(s => s.videoId));
      } catch {
        if (active) setError('Search failed. Is your backend running?');
      } finally {
        if (active) setLoading(false);
      }
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);

  if (!playlist) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close"
        onClick={closeModal}
        className={`absolute inset-0 transition-opacity duration-200 ${isOpen ? 'bg-black/70 opacity-100' : 'bg-black/0 opacity-0'
          }`}
      />

      <div className={`absolute left-1/2 top-1/2 w-[94vw] max-w-xl -translate-x-1/2 -translate-y-1/2
                      bg-elevated border border-white/10 rounded-2xl overflow-hidden shadow-2xl
                      transition-all duration-200 ease-out ${isOpen
          ? 'opacity-100 scale-100 translate-y-[-50%]'
          : 'opacity-0 scale-95 translate-y-[calc(-50%+10px)]'
        }`}>
        <div className="p-4 border-b border-white/5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-subtle">
              <img
                src={coverThumb}
                alt=""
                className="w-full h-full object-cover"
                loading="lazy"
                referrerPolicy="no-referrer"
                crossOrigin="anonymous"
                onError={e => { e.target.src = '/logo.svg'; }}
              />
            </div>

            <div className="min-w-0">
              <p className="text-white font-bold truncate">Add songs</p>
              <p className="text-gray-400 text-xs truncate">{playlist.name}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeModal}
            className="text-gray-400 hover:text-white transition-colors p-2"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>

        <div className="p-4">
          <div className="group relative overflow-hidden rounded-full border border-white/20 bg-white/[0.06] transition-all duration-200 hover:border-white/35 hover:bg-white/[0.1] focus-within:border-white focus-within:bg-white/[0.12] focus-within:shadow-[0_0_0_1px_rgba(255,255,255,0.95)]">
            <svg className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/65 transition-colors duration-200 group-hover:text-white/90 group-focus-within:text-white"
              fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search songs to add..."
              className="w-full bg-transparent text-white placeholder:text-white/55 rounded-full pl-12 pr-4 py-3.5 text-sm outline-none"
              autoFocus
            />
          </div>

          <div className="mt-4 max-h-[55vh] overflow-y-auto no-scrollbar">
            {!query.trim() && (
              <div className="py-10 text-center text-gray-500 text-sm">
                Search for a song, then tap add
              </div>
            )}

            {loading && (
              <div className="space-y-3 py-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 animate-pulse">
                    <div className="w-11 h-11 bg-subtle rounded" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 bg-subtle rounded w-2/3" />
                      <div className="h-3 bg-subtle rounded w-1/3" />
                    </div>
                    <div className="w-14 h-8 bg-subtle rounded-lg" />
                  </div>
                ))}
              </div>
            )}

            {error && (
              <div className="py-6 text-center text-red-400 text-sm">{error}</div>
            )}

            {!loading && !error && results.length > 0 && (
              <div className="space-y-1">
                {results.map((song, index) => {
                  const already = existingIds.has(song.videoId);
                  const queue = results.slice(index + 1);
                  const isActive = currentSong?.videoId === song.videoId;
                  const rowIsPlaying = isActive && isPlaying;
                  return (
                    <div
                      key={song.videoId}
                      className={`flex items-center gap-3 p-2 rounded-lg hover:bg-subtle transition-colors
                        ${isActive ? 'bg-white/5' : ''}`}
                    >
                      <div className="relative w-11 h-11 rounded overflow-hidden flex-shrink-0 bg-subtle">
                        <img
                          src={song.thumbnail || '/logo.svg'}
                          alt={song.title}
                          className="w-full h-full object-cover"
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          crossOrigin="anonymous"
                          onError={e => { e.target.src = '/logo.svg'; }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (isActive) {
                              togglePlay();
                              return;
                            }
                            playSong(song, queue);
                          }}
                          aria-label={rowIsPlaying ? 'Pause' : 'Play'}
                          className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/35 transition-colors"
                        >
                          <span className="w-7 h-7 rounded-full bg-black/45 flex items-center justify-center">
                            {rowIsPlaying ? (
                              <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                              </svg>
                            ) : (
                              <svg className="w-3.5 h-3.5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z" />
                              </svg>
                            )}
                          </span>
                        </button>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium truncate">{song.title}</p>
                        <p className="text-gray-400 text-xs truncate">{song.artist}</p>
                      </div>
                      <button
                        type="button"
                        disabled={already}
                        onClick={() => addSong(playlist.id, song)}
                        className="liquid-glass-button min-w-[54px] px-3 py-1.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <span className="liquid-glass-content">{already ? 'Added' : 'Add'}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {!loading && !error && query.trim() && results.length === 0 && (
              <div className="py-10 text-center text-gray-500 text-sm">No songs found.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
