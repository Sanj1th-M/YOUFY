import { useEffect, useRef } from 'react';
import { useLyrics } from '../../hooks/useLyrics';
import usePlayerStore from '../../store/usePlayerStore';

export default function LyricsView() {
  const currentSong = usePlayerStore(s => s.currentSong);
  const currentTime = usePlayerStore(s => s.currentTime);
  const { lyrics, loading } = useLyrics(currentSong);
  const activeRef = useRef(null);

  const activeIndex = lyrics.synced.length
    ? lyrics.synced.reduce((acc, line, i) => currentTime >= line.time ? i : acc, -1)
    : -1;

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [activeIndex]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!lyrics.synced.length && !lyrics.plain) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-500">
        <svg className="w-12 h-12" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z"/>
        </svg>
        <p className="text-sm">No lyrics available for this song</p>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto h-full px-6 py-8 space-y-4 no-scrollbar">
      {lyrics.synced.length > 0
        ? lyrics.synced.map((line, i) => (
            <p
              key={i}
              ref={i === activeIndex ? activeRef : null}
              className={`text-center text-lg leading-relaxed transition-all duration-300 ${
                i === activeIndex
                  ? 'text-white font-bold scale-105'
                  : i === activeIndex - 1 || i === activeIndex + 1
                  ? 'text-gray-400 scale-100'
                  : 'text-gray-600 scale-95'
              }`}
            >
              {line.text || '—'}
            </p>
          ))
        : lyrics.plain.split('\n').map((line, i) => (
            <p key={i} className="text-center text-gray-300 leading-relaxed">
              {line || '\u00A0'}
            </p>
          ))
      }
    </div>
  );
}
