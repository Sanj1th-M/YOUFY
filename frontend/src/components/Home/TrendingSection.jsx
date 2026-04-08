import SongTile from '../SongTile';
import usePlayerStore from '../../store/usePlayerStore';


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

// Normalize ytmusic-api shape → Song model
function norm(s) {
  return {
    videoId:         s.videoId,
    title:           s.name || s.title || 'Unknown',
    artist:          s.artist?.name || s.artists?.[0]?.name || 'Unknown',
    thumbnail:       getBestThumbnail(s.thumbnails) || '',
    durationSeconds: s.duration || 0,
    album:           s.album?.name || '',
  };
}

export function TrendingSection({ sections }) {
  const playSong = usePlayerStore(s => s.playSong);
  if (!sections?.length) return null;

  // Find a section that has songs
  const songSection = sections.find(sec => sec.contents?.some(c => c.videoId));
  if (!songSection) return null;

  const songs = songSection.contents.filter(c => c.videoId).map(norm);

  return (
    <section>
      <h2 className="text-white font-bold text-xl mb-4">Trending</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {songs.slice(0, 12).map((song, i) => (
          <button
            key={song.videoId || i}
            onClick={() => playSong(song, songs.slice(i + 1))}
            className="bg-elevated hover:bg-subtle rounded-xl p-3 text-left transition-colors group"
          >
            <div className="relative mb-3">
              <img
                src={song.thumbnail}
                alt={song.title}
                className="w-full aspect-square object-cover rounded-lg"
                onError={e => { e.target.src = '/logo-dark.png'; }}
              />
              <div className="absolute bottom-2 right-2 w-9 h-9 bg-primary rounded-full
                              flex items-center justify-center shadow-lg
                              opacity-0 group-hover:opacity-100 transition-all translate-y-1 group-hover:translate-y-0">
                <svg className="w-4 h-4 text-black ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              </div>
            </div>
            <p className="text-white text-sm font-medium truncate">{song.title}</p>
            <p className="text-gray-400 text-xs truncate mt-0.5">{song.artist}</p>
          </button>
        ))}
      </div>
    </section>
  );
}

export function RecentSongs() {
  const playSong = usePlayerStore(s => s.playSong);
  const recent = JSON.parse(localStorage.getItem('recentSongs') || '[]');
  if (!recent.length) return null;

  return (
    <section>
      <h2 className="text-white font-bold text-xl mb-4">Recently Played</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
        {recent.slice(0, 8).map((song, i) => (
          <SongTile key={song.videoId || i} song={song} queue={recent.slice(i + 1)} />
        ))}
      </div>
    </section>
  );
}
