import usePlayerStore from '../../store/usePlayerStore';

// Pick highest quality thumbnail from YouTube Music API results
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

/* ─────────────────────────────────────────────
   Trending Section — Classic Spotify square cards
   ───────────────────────────────────────────── */
export function TrendingSection({ sections }) {
  const playSong = usePlayerStore(s => s.playSong);
  if (!sections?.length) return null;

  const songSection = sections.find(sec => sec.contents?.some(c => c.videoId));
  if (!songSection) return null;

  const songs = songSection.contents.filter(c => c.videoId).map(norm);

  return (
    <section>
      <h2 className="text-white font-bold text-xl mb-5">Trending</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
        {songs.slice(0, 12).map((song, i) => (
          <button
            key={song.videoId || i}
            onClick={() => playSong(song, songs.slice(i + 1))}
            className="bg-card hover:bg-subtle rounded-lg p-3 md:p-4 text-left
                       transition-all duration-300 group cursor-pointer"
          >
            {/* Album Art with hover play button */}
            <div className="relative mb-3">
              <img
                src={song.thumbnail}
                alt={song.title}
                className="w-full aspect-square object-cover rounded-md shadow-lg shadow-black/40"
                onError={e => { e.target.src = '/logo-dark.png'; }}
              />
              {/* Green play button — desktop hover only */}
              <div className="absolute bottom-2 right-2 w-10 h-10 bg-primary rounded-full
                              flex items-center justify-center shadow-xl shadow-black/50
                              opacity-0 translate-y-2
                              group-hover:opacity-100 group-hover:translate-y-0
                              transition-all duration-300 ease-out">
                <svg className="w-5 h-5 text-black ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              </div>
            </div>

            {/* Title */}
            <p className="text-white text-sm font-semibold truncate">{song.title}</p>
            {/* Artist */}
            <p className="text-muted text-xs truncate mt-1">{song.artist}</p>
          </button>
        ))}
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────
   Recently Played — Horizontal mini-cards
   ───────────────────────────────────────────── */
export function RecentlyPlayed() {
  const playSong    = usePlayerStore(s => s.playSong);
  const currentSong = usePlayerStore(s => s.currentSong);
  const isPlaying   = usePlayerStore(s => s.isPlaying);
  const recent      = JSON.parse(localStorage.getItem('recentSongs') || '[]');

  if (!recent.length) return null;

  return (
    <section>
      <h2 className="text-white font-bold text-xl mb-4">Recently Played</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 md:gap-3">
        {recent.slice(0, 8).map((song, i) => {
          const isActive = currentSong?.videoId === song.videoId;
          return (
            <button
              key={song.videoId || i}
              onClick={() => playSong(song, recent.slice(i + 1))}
              className={`flex items-center gap-3 rounded-md overflow-hidden
                         bg-white/5 hover:bg-white/10 transition-colors group h-14 md:h-16
                         ${isActive ? 'ring-1 ring-primary/40' : ''}`}
            >
              {/* Image */}
              <img
                src={song.thumbnail}
                alt={song.title}
                className="h-full aspect-square object-cover flex-shrink-0"
                onError={e => { e.target.src = '/logo-dark.png'; }}
              />

              {/* Title */}
              <div className="flex-1 min-w-0 pr-3">
                <p className={`text-sm font-semibold truncate
                  ${isActive ? 'text-primary' : 'text-white'}`}>
                  {song.title}
                </p>
              </div>

              {/* Playing indicator */}
              {isActive && isPlaying && (
                <div className="flex gap-0.5 items-end h-4 mr-3 flex-shrink-0">
                  {[0, 1, 2].map(j => (
                    <div
                      key={j}
                      className="w-0.5 bg-primary rounded-full animate-bounce"
                      style={{
                        height: `${(j + 1) * 4 + 2}px`,
                        animationDelay: `${j * 0.15}s`,
                      }}
                    />
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
