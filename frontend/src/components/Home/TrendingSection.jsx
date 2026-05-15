import usePlayerStore from '../../store/usePlayerStore';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { searchMusic } from '../../services/api';
import ArtworkImage from '../ArtworkImage';
import { getBestThumbnail } from '../../utils/artwork';

const recentThumbnailRepairAttempts = new Set();

function readRecentSongs() {
  try {
    const parsed = JSON.parse(localStorage.getItem('recentSongs') || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function isGeneratedVideoThumbnailUrl(value) {
  if (typeof value !== 'string') return false;

  try {
    const url = new URL(value);
    const parts = url.pathname.split('/').filter(Boolean);
    return url.protocol === 'https:'
      && url.hostname === 'i.ytimg.com'
      && parts.length === 3
      && parts[0] === 'vi'
      && parts[2] === 'hqdefault.jpg';
  } catch {
    return false;
  }
}

function hasGeneratedVideoThumbnail(song) {
  return isGeneratedVideoThumbnailUrl(song?.thumbnail);
}

// Normalize ytmusic-api shape → Song model
function norm(s) {
  return {
    videoId:         s.videoId,
    title:           s.name || s.title || 'Unknown',
    artist:          s.artist?.name || s.artists?.[0]?.name || 'Unknown',
    thumbnail:       getBestThumbnail(s.thumbnails, '', 544) || s.thumbnail || '',
    thumbnails:      Array.isArray(s.thumbnails) ? s.thumbnails : [],
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
            className="liquid-glass-card rounded-lg p-3 md:p-4 text-left transition-all duration-300 group cursor-pointer"
          >
            {/* Album Art with hover play button */}
            <div className="relative mb-3">
              <ArtworkImage
                item={song}
                src={song.thumbnail}
                alt={song.title}
                size={544}
                className="w-full aspect-square object-cover rounded-md shadow-lg shadow-black/40"
              />
              {/* Bluish-white play button — desktop hover only */}
              <div className="absolute bottom-2 right-2 w-10 h-10 bg-[#FCFFF9] rounded-full
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
  const [recentRepairVersion, setRecentRepairVersion] = useState(0);
  
  // Re-read recent songs whenever currentSong changes to ensure UI is fresh
  const recentRaw = readRecentSongs();

  useEffect(() => {
    const storedRecent = readRecentSongs();
    const songsToRepair = storedRecent
      .filter(song => song?.videoId && hasGeneratedVideoThumbnail(song))
      .filter(song => !recentThumbnailRepairAttempts.has(song.videoId))
      .slice(0, 6);

    if (!songsToRepair.length) return undefined;

    let cancelled = false;
    songsToRepair.forEach(song => recentThumbnailRepairAttempts.add(song.videoId));

    Promise.all(songsToRepair.map(async (song) => {
      const query = [song.title, song.artist].filter(Boolean).join(' ');
      if (!query) return null;

      try {
        const data = await searchMusic(query);
        const candidates = Array.isArray(data?.songs) ? data.songs : [];
        const match = candidates.find(candidate => candidate?.videoId === song.videoId);
        const thumbnail = getBestThumbnail(match?.thumbnails, '', 544) || match?.thumbnail || '';

        return thumbnail && !isGeneratedVideoThumbnailUrl(thumbnail)
          ? { videoId: song.videoId, thumbnail }
          : null;
      } catch {
        return null;
      }
    })).then((repairs) => {
      if (cancelled) return;
      const repairMap = new Map(
        repairs.filter(Boolean).map(repair => [repair.videoId, repair.thumbnail])
      );
      if (!repairMap.size) return;

      const latestRecent = readRecentSongs();
      const repairedRecent = latestRecent.map(song => (
        repairMap.has(song?.videoId)
          ? { ...song, thumbnail: repairMap.get(song.videoId) }
          : song
      ));

      localStorage.setItem('recentSongs', JSON.stringify(repairedRecent));
      setRecentRepairVersion(version => version + 1);
    });

    return () => {
      cancelled = true;
    };
  }, [currentSong?.videoId, recentRepairVersion]);
  
  // Logic: Ensure currentSong is always first in the rendered list
  let displayRecent = [...recentRaw];
  if (currentSong?.videoId) {
    const currentIndex = displayRecent.findIndex(s => s.videoId === currentSong.videoId);
    if (currentIndex !== -1) {
      // Remove it from its current position
      const [playingItem] = displayRecent.splice(currentIndex, 1);
      // Put it at the front
      displayRecent.unshift(playingItem);
    } else {
      // If not in recent list for some reason, add it to front
      displayRecent.unshift(currentSong);
    }
  }

  if (!displayRecent.length) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
    >
      <h2 className="text-white font-bold text-xl mb-4">Recently Played</h2>
      <div className="overflow-x-auto no-scrollbar -mx-4 px-4 pb-4 touch-pan-x snap-x snap-mandatory scroll-smooth">
        <div className="grid grid-rows-3 grid-flow-col gap-3 w-max">
          {displayRecent.slice(0, 24).map((song, i) => {
            const isActive = currentSong?.videoId === song.videoId;
            return (
              <motion.button
                key={song.videoId || i}
                layout
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ 
                  opacity: { duration: 0.4, delay: i * 0.02 },
                  x: { duration: 0.4, delay: i * 0.02 },
                  layout: { duration: 0.3 }
                }}
                whileHover={{ scale: 1.02, backgroundColor: 'rgba(255, 255, 255, 0.08)' }}
                whileTap={{ scale: 0.98 }}
                onClick={() => playSong(song, displayRecent.slice(i + 1))}
                className={`flex items-center gap-3 rounded-md overflow-hidden group h-14 md:h-16 transition-colors hover:bg-subtle
                           w-[220px] md:w-[280px] snap-start
                           ${isActive ? 'bg-subtle' : ''}`}
              >
                {/* Image */}
                <ArtworkImage
                  item={song}
                  src={song.thumbnail || '/logo.svg'}
                  alt={song.title}
                  size={226}
                  className="h-full aspect-square object-cover flex-shrink-0"
                />

                {/* Title */}
                <div className="flex-1 min-w-0 pr-3">
                  <p className={`text-sm font-semibold truncate
                    ${isActive && isPlaying ? 'playing-title-shimmer' : isActive ? 'text-[#dbeafe]' : 'text-white'}`}
                    data-text={song.title}
                  >
                    {song.title}
                  </p>
                </div>

                {/* Playing indicator */}
                {isActive && isPlaying && (
                  <div className="flex gap-0.5 items-end h-4 mr-3 flex-shrink-0">
                    {[0, 1, 2].map(j => (
                      <div
                        key={j}
                        className="w-0.5 bg-[#FCFFF9] rounded-full animate-bounce"
                        style={{
                          height: `${(j + 1) * 4 + 2}px`,
                          animationDelay: `${j * 0.15}s`,
                        }}
                      />
                    ))}
                  </div>
                )}
              </motion.button>
            );
          })}
        </div>
      </div>
    </motion.section>
  );
}
