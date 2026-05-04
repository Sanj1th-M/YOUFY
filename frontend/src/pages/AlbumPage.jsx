import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { getAlbumSongs } from '../services/api';
import SongTile from '../components/SongTile';
import usePlayerStore from '../store/usePlayerStore';

// Pick highest quality thumbnail
function getBestThumbnail(thumbnails, fallback = '') {
  if (!thumbnails || !thumbnails.length) return fallback;
  const url = thumbnails[thumbnails.length - 1]?.url || fallback;
  if (!url) return fallback;
  return url
    .replace(/=w\d+-h\d+(-[^&]+)?/, '=w1280-h1280')
    .replace(/=s\d+/, '=s1280');
}

// Normalize ytmusic-api song → app Song shape
function normalizeSong(s) {
  if (!s) return null;
  return {
    videoId:         s.videoId || '',
    title:           s.name || s.title || 'Unknown',
    artist:          s.artist?.name
                  || s.artists?.[0]?.name
                  || s.author?.name
                  || 'Unknown',
    thumbnail:       getBestThumbnail(s.thumbnails) || s.thumbnail || '',
    durationSeconds: s.duration || s.durationSeconds || 0,
    album:           s.album?.name || s.album || '',
  };
}

// Format seconds → "m:ss"
function fmt(s) {
  if (!s) return '';
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

// Format total duration → "X hr Y min" or "Y min"
function fmtTotal(songs) {
  const total = songs.reduce((acc, s) => acc + (s.durationSeconds || 0), 0);
  if (!total) return '';
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  return hrs > 0 ? `${hrs} hr ${mins} min` : `${mins} min`;
}

export default function AlbumPage() {
  const { browseId } = useParams();
  const navigate = useNavigate();
  const playSong = usePlayerStore(s => s.playSong);

  const [album, setAlbum]     = useState(null);
  const [songs, setSongs]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    if (!browseId) return;

    let cancelled = false;
    setLoading(true);
    setError('');

    getAlbumSongs(browseId)
      .then(data => {
        if (cancelled) return;
        if (!data) {
          setError('Album not found.');
          return;
        }

        setAlbum(data);

        // ytmusic-api getAlbum returns { songs: [...] }
        const rawSongs = Array.isArray(data.songs) ? data.songs : [];
        const normalized = rawSongs
          .map(normalizeSong)
          .filter(s => s && s.videoId);
        setSongs(normalized);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load album. Please try again.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [browseId]);

  // ── Loading state ──────────────────────────────────────────
  if (loading) {
    return (
      <div className="px-4 md:px-6 lg:px-8 py-6 max-w-5xl mx-auto animate-pulse">
        <div className="flex items-start gap-6 mb-8">
          <div className="w-40 h-40 md:w-56 md:h-56 bg-elevated rounded-lg flex-shrink-0" />
          <div className="flex-1 pt-4 space-y-3">
            <div className="h-6 bg-elevated rounded w-2/3" />
            <div className="h-4 bg-elevated rounded w-1/3" />
            <div className="h-4 bg-elevated rounded w-1/4" />
          </div>
        </div>
        {Array(8).fill(0).map((_, i) => (
          <div key={i} className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-elevated rounded" />
            <div className="flex-1 space-y-2">
              <div className="h-3 bg-elevated rounded w-2/3" />
              <div className="h-3 bg-elevated rounded w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────
  if (error) {
    return (
      <div className="px-4 md:px-6 lg:px-8 py-6 max-w-5xl mx-auto">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-gray-400 hover:text-white
                     transition-colors mb-6 text-sm"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor"
               strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" d="M19 12H5m7 7-7-7 7-7"/>
          </svg>
          Go back
        </button>
        <div className="text-center py-16 text-red-400 text-sm">{error}</div>
      </div>
    );
  }

  const albumName   = album?.name || 'Unknown Album';
  const artistName  = album?.artist?.name || 'Unknown Artist';
  const year        = album?.year || '';
  const thumbnail   = getBestThumbnail(album?.thumbnails) || '/logo.svg';
  const trackCount  = songs.length;
  const totalTime   = fmtTotal(songs);

  return (
    <div className="px-4 md:px-6 lg:px-8 py-6 max-w-5xl mx-auto pb-32">
      {/* Back button */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-gray-400 hover:text-white
                   transition-colors mb-6 text-sm"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor"
             strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" d="M19 12H5m7 7-7-7 7-7"/>
        </svg>
        Go back
      </button>

      {/* Album header */}
      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 mb-8">
        <img
          src={thumbnail}
          alt={albumName}
          className="w-40 h-40 md:w-56 md:h-56 rounded-lg object-cover shadow-2xl
                     shadow-black/60 flex-shrink-0"
          onError={e => { e.target.src = '/logo.svg'; }}
        />

        <div className="flex-1 min-w-0 text-center sm:text-left sm:pt-4">
          <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-1">
            Album
          </p>
          <h1 className="text-white text-2xl md:text-4xl font-extrabold mb-2 break-words">
            {albumName}
          </h1>
          <p className="text-gray-300 text-sm">
            {artistName}
            {year ? ` • ${year}` : ''}
            {trackCount ? ` • ${trackCount} song${trackCount !== 1 ? 's' : ''}` : ''}
            {totalTime ? `, ${totalTime}` : ''}
          </p>

          {/* Play All button */}
          {songs.length > 0 && (
            <button
              onClick={() => playSong(songs[0], songs.slice(1))}
              className="mt-4 inline-flex items-center gap-2 bg-primary text-black
                         font-bold text-sm px-6 py-2.5 rounded-full
                         hover:scale-105 active:scale-95 transition-transform shadow-lg"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
              Play All
            </button>
          )}
        </div>
      </div>

      {/* Track listing */}
      {songs.length > 0 ? (
        <section>
          <div className="space-y-0.5">
            {songs.map((song, i) => (
              <div key={song.videoId || i} className="flex items-center gap-2">
                {/* Track number */}
                <span className="text-gray-500 text-xs w-6 text-right flex-shrink-0">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <SongTile song={song} queue={songs.slice(i + 1)} />
                </div>
                {/* Duration */}
                <span className="text-gray-500 text-xs flex-shrink-0 hidden sm:block">
                  {fmt(song.durationSeconds)}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <div className="flex flex-col items-center py-16 gap-3 text-gray-500">
          <p className="text-sm">No tracks found for this album</p>
        </div>
      )}
    </div>
  );
}
