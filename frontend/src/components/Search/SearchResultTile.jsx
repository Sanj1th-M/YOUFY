import SongTile from '../SongTile';
import usePlayerStore from '../../store/usePlayerStore';

export default function SearchResultTile({ results }) {
  const playSong = usePlayerStore(s => s.playSong);

  if (!results) return null;

  const { songs = [], albums = [], artists = [] } = results;

  if (!songs.length && !albums.length && !artists.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-500">
        <svg className="w-14 h-14" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <p>No results found</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Songs */}
      {songs.length > 0 && (
        <section>
          <h2 className="text-white font-bold text-lg mb-3">Songs</h2>
          <div className="space-y-1">
            {songs.map((song, i) => (
              <SongTile key={song.videoId || i} song={normalizeSong(song)} queue={songs.map(normalizeSong)} />
            ))}
          </div>
        </section>
      )}

      {/* Artists */}
      {artists.length > 0 && (
        <section>
          <h2 className="text-white font-bold text-lg mb-3">Artists</h2>
          <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
            {artists.slice(0, 8).map((a, i) => (
              <div key={i} className="flex flex-col items-center gap-2 flex-shrink-0 w-24">
                <img
                  src={getBestThumbnail(a.thumbnails) || '/logo-dark.png'}
                  alt={a.name}
                  className="w-20 h-20 rounded-full object-cover"
                  onError={e => { e.target.src = '/logo-dark.png'; }}
                />
                <p className="text-xs text-gray-300 text-center truncate w-full">{a.name}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Albums */}
      {albums.length > 0 && (
        <section>
          <h2 className="text-white font-bold text-lg mb-3">Albums</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {albums.slice(0, 10).map((album, i) => (
              <div key={i} className="bg-elevated hover:bg-subtle rounded-lg p-3 transition-colors cursor-pointer">
                <img
                  src={getBestThumbnail(album.thumbnails) || '/logo-dark.png'}
                  alt={album.name}
                  className="w-full aspect-square object-cover rounded mb-2"
                  onError={e => { e.target.src = '/logo-dark.png'; }}
                />
                <p className="text-white text-sm font-medium truncate">{album.name}</p>
                <p className="text-gray-400 text-xs truncate">{album.artist?.name}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}


// Pick highest quality thumbnail from YouTube Music API results
// thumbnails[] is sorted smallest→largest, last = best quality
// Also upgrade YouTube thumbnail URLs to maxresdefault
function getBestThumbnail(thumbnails, fallback = '') {
  if (!thumbnails || !thumbnails.length) return fallback;
  const url = thumbnails[thumbnails.length - 1]?.url || fallback;
  if (!url) return fallback;
  return url
    .replace(/=w\d+-h\d+(-[^&]+)?/, '=w1280-h1280')
    .replace(/=s\d+/, '=s1280');
}

// Normalize ytmusic-api song shape → our Song model
function normalizeSong(s) {
  return {
    videoId:         s.videoId,
    title:           s.name || s.title || 'Unknown',
    artist:          s.artist?.name || s.artists?.[0]?.name || 'Unknown',
    thumbnail:       getBestThumbnail(s.thumbnails) || s.thumbnail || '',
    durationSeconds: s.duration || 0,
    album:           s.album?.name || '',
  };
}
