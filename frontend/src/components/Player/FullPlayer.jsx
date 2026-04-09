import { useState } from 'react';
import usePlayerStore from '../../store/usePlayerStore';
import PlayerControls from './PlayerControls';
import ProgressBar    from './ProgressBar';
import LyricsView     from './LyricsView';
import usePlaylistStore from '../../store/usePlaylistStore';

// Upgrade YouTube thumbnail to highest available resolution
// YouTube supports: default(120) → mqdefault(320) → hqdefault(480) → sddefault(640) → maxresdefault(1280)
function getBestThumbnail(url) {
  if (!url) return '/logo-dark.png';
  // If it's a YouTube thumbnail URL, upgrade to maxresdefault
  if (url.includes('ytimg.com') || url.includes('youtube.com')) {
    return url
      .replace(/\/default\.jpg/, '/maxresdefault.jpg')
      .replace(/\/mqdefault\.jpg/, '/maxresdefault.jpg')
      .replace(/\/hqdefault\.jpg/, '/maxresdefault.jpg')
      .replace(/\/sddefault\.jpg/, '/maxresdefault.jpg')
      .replace(/=w\d+-h\d+/, '=w1280-h1280')  // YouTube Music format
      .replace(/=s\d+/, '=s1280');              // Google APIs format
  }
  return url;
}

export default function FullPlayer() {
  const currentSong      = usePlayerStore(s => s.currentSong);
  const volume           = usePlayerStore(s => s.volume);
  const setVolume        = usePlayerStore(s => s.setVolume);
  const setShowFullPlayer = usePlayerStore(s => s.setShowFullPlayer);
  const [tab, setTab]    = useState('player'); // 'player' | 'lyrics'
  const isSongLiked      = usePlaylistStore(s => s.isSongLiked);
  const toggleLike       = usePlaylistStore(s => s.toggleLike);

  if (!currentSong) return null;
  const liked = isSongLiked(currentSong.videoId);

  return (
    <div className="fixed inset-0 z-50 bg-surface flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-safe pt-4 pb-2">
        <button
          onClick={() => setShowFullPlayer(false)}
          className="text-gray-400 hover:text-white transition-colors p-2"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" d="M19 12H5m7 7-7-7 7-7"/>
          </svg>
        </button>
        <p className="text-sm text-gray-400 font-medium">Now Playing</p>
        <button
          type="button"
          onClick={() => toggleLike(currentSong)}
          className={`p-2 rounded-full transition-colors
            ${liked ? 'text-primary' : 'text-gray-400 hover:text-white'}`}
          aria-label={liked ? 'Unlike' : 'Like'}
        >
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
          </svg>
        </button>
      </div>

      {/* Tab switcher */}
      <div className="flex mx-6 mb-4 bg-subtle rounded-full p-1">
        {['player', 'lyrics'].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-1.5 text-sm font-medium rounded-full transition-all capitalize
              ${tab === t ? 'bg-white text-black' : 'text-gray-400 hover:text-white'}`}
          >
            {t === 'player' ? 'Player' : 'Lyrics'}
          </button>
        ))}
      </div>

      {tab === 'player' ? (
        <div className="flex flex-col items-center flex-1 px-8 gap-6 overflow-hidden">
          {/* Album art */}
          <div className="flex-1 flex items-center justify-center w-full max-w-xs">
            <img
              src={getBestThumbnail(currentSong.thumbnail)}
              alt={currentSong.title}
              className="w-full aspect-square rounded-2xl object-cover shadow-2xl"
              onError={e => { e.target.src = '/logo-dark.png'; }}
            />
          </div>

          {/* Song info */}
          <div className="w-full text-center">
            <h2 className="text-white text-xl font-bold truncate">{currentSong.title}</h2>
            <p className="text-gray-400 text-sm mt-1">{currentSong.artist}</p>
            {currentSong.album && <p className="text-gray-600 text-xs mt-0.5">{currentSong.album}</p>}
          </div>

          {/* Progress */}
          <div className="w-full">
            <ProgressBar />
          </div>

          {/* Controls */}
          <PlayerControls size="lg" />

          {/* Volume */}
          <div className="w-full flex items-center gap-3 pb-8">
            <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
              <path d="M7 9v6h4l5 5V4L11 9H7z"/>
            </svg>
            <input
              type="range" min="0" max="1" step="0.01"
              value={volume}
              onChange={e => setVolume(parseFloat(e.target.value))}
              className="flex-1 accent-primary"
              style={{
                background: `linear-gradient(to right, #1DB954 ${volume * 100}%, #535353 ${volume * 100}%)`,
              }}
            />
            <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
            </svg>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-hidden">
          <LyricsView />
        </div>
      )}
    </div>
  );
}
