import usePlayerStore from '../../store/usePlayerStore';

export default function PlayerControls({ size = 'md' }) {
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const isLoading = usePlayerStore(s => s.isLoading);
  const togglePlay = usePlayerStore(s => s.togglePlay);
  const playNext   = usePlayerStore(s => s.playNext);
  const playPrev   = usePlayerStore(s => s.playPrev);

  const btnSz  = size === 'lg' ? 'w-8 h-8' : 'w-5 h-5';
  const playBtnSz = size === 'lg' ? 'w-14 h-14' : 'w-9 h-9';
  const iconSz = size === 'lg' ? 'w-7 h-7' : 'w-5 h-5';

  return (
    <div className="flex items-center gap-4">
      {/* Prev */}
      <button onClick={playPrev} className={`${btnSz} text-gray-400 hover:text-white transition-colors`}>
        <svg className="w-full h-full" fill="currentColor" viewBox="0 0 24 24">
          <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/>
        </svg>
      </button>

      {/* Play / Pause */}
      <button
        onClick={togglePlay}
        className={`${playBtnSz} bg-white rounded-full flex items-center justify-center
                    hover:scale-105 transition-transform flex-shrink-0`}
      >
        {isLoading ? (
          <div className="youfy-eq scale-50" aria-hidden="true">
            <span className="youfy-eq-bar bg-black" />
            <span className="youfy-eq-bar bg-black" />
            <span className="youfy-eq-bar bg-black" />
            <span className="youfy-eq-bar bg-black" />
          </div>
        ) : isPlaying ? (
          <svg className={iconSz} fill="black" viewBox="0 0 24 24">
            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
          </svg>
        ) : (
          <svg className={iconSz} fill="black" viewBox="0 0 24 24" style={{ marginLeft: '2px' }}>
            <path d="M8 5v14l11-7z"/>
          </svg>
        )}
      </button>

      {/* Next */}
      <button onClick={playNext} className={`${btnSz} text-gray-400 hover:text-white transition-colors`}>
        <svg className="w-full h-full" fill="currentColor" viewBox="0 0 24 24">
          <path d="M6 18l8.5-6L6 6v12zm2-8.14L11.03 12 8 14.14V9.86zM16 6h2v12h-2z"/>
        </svg>
      </button>
    </div>
  );
}
