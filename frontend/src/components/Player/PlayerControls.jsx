import usePlayerStore from '../../store/usePlayerStore';

function ShuffleIcon({ active = false }) {
  return (
    <svg className="w-full h-full" fill="none" stroke="currentColor" strokeWidth="1.9" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 3h5v5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 20 20 4" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l5 5v-5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4l6 6" />
      {active && <circle cx="6.5" cy="17.5" r="1.4" fill="currentColor" stroke="none" />}
    </svg>
  );
}

function RepeatIcon({ mode = 'off' }) {
  return (
    <div className="relative w-full h-full">
      <svg className="w-full h-full" fill="none" stroke="currentColor" strokeWidth="1.9" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 2l4 4-4 4" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 11V9a3 3 0 0 1 3-3h15" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 22l-4-4 4-4" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 13v2a3 3 0 0 1-3 3H3" />
      </svg>
      {mode === 'one' && (
        <span className="absolute -right-1 -top-1 text-[10px] font-semibold leading-none">1</span>
      )}
    </div>
  );
}

export default function PlayerControls({ size = 'md', showModeButtons = false }) {
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const isLoading = usePlayerStore((state) => state.isLoading);
  const togglePlay = usePlayerStore((state) => state.togglePlay);
  const playNext = usePlayerStore((state) => state.playNext);
  const playPrev = usePlayerStore((state) => state.playPrev);
  const shuffleEnabled = usePlayerStore((state) => state.shuffleEnabled);
  const toggleShuffle = usePlayerStore((state) => state.toggleShuffle);
  const repeatMode = usePlayerStore((state) => state.repeatMode);
  const cycleRepeatMode = usePlayerStore((state) => state.cycleRepeatMode);

  const sideButtonSize = size === 'lg' ? 'w-10 h-10' : 'w-5 h-5';
  const playButtonSize = size === 'lg' ? 'w-16 h-16' : 'w-9 h-9';
  const playIconSize = size === 'lg' ? 'w-8 h-8' : 'w-5 h-5';
  const modeButtonClass = size === 'lg'
    ? 'w-11 h-11 rounded-full'
    : 'w-8 h-8 rounded-full';

  return (
    <div className={`flex items-center ${showModeButtons ? 'w-full justify-between gap-3' : 'gap-4'}`}>
      {showModeButtons && (
        <button
          type="button"
          onClick={toggleShuffle}
          className={`${modeButtonClass} flex items-center justify-center transition-colors ${
            shuffleEnabled ? 'text-white bg-white/10' : 'text-gray-500 hover:text-white'
          }`}
          aria-label={shuffleEnabled ? 'Disable shuffle' : 'Enable shuffle'}
        >
          <div className={size === 'lg' ? 'w-5 h-5' : 'w-4 h-4'}>
            <ShuffleIcon active={shuffleEnabled} />
          </div>
        </button>
      )}

      <div className={`flex items-center ${size === 'lg' ? 'gap-5' : 'gap-4'}`}>
        <button
          type="button"
          onClick={playPrev}
          className={`${sideButtonSize} text-gray-400 hover:text-white transition-colors`}
          aria-label="Previous track"
        >
          <svg className="w-full h-full" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
          </svg>
        </button>

        <button
          type="button"
          onClick={togglePlay}
          className={`${playButtonSize} bg-white rounded-full flex items-center justify-center hover:scale-105 transition-transform flex-shrink-0`}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isLoading ? (
            <div className="youfy-eq scale-50" aria-hidden="true">
              <span className="youfy-eq-bar bg-black" />
              <span className="youfy-eq-bar bg-black" />
              <span className="youfy-eq-bar bg-black" />
              <span className="youfy-eq-bar bg-black" />
            </div>
          ) : isPlaying ? (
            <svg className={playIconSize} fill="black" viewBox="0 0 24 24">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          ) : (
            <svg className={playIconSize} fill="black" viewBox="0 0 24 24" style={{ marginLeft: '2px' }}>
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        <button
          type="button"
          onClick={playNext}
          className={`${sideButtonSize} text-gray-400 hover:text-white transition-colors`}
          aria-label="Next track"
        >
          <svg className="w-full h-full" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 18l8.5-6L6 6v12zm2-8.14L11.03 12 8 14.14V9.86zM16 6h2v12h-2z" />
          </svg>
        </button>
      </div>

      {showModeButtons && (
        <button
          type="button"
          onClick={cycleRepeatMode}
          className={`${modeButtonClass} flex items-center justify-center transition-colors ${
            repeatMode !== 'off' ? 'text-white bg-white/10' : 'text-gray-500 hover:text-white'
          }`}
          aria-label={
            repeatMode === 'off'
              ? 'Turn repeat on'
              : repeatMode === 'all'
                ? 'Repeat one track'
                : 'Turn repeat off'
          }
        >
          <div className={size === 'lg' ? 'w-5 h-5' : 'w-4 h-4'}>
            <RepeatIcon mode={repeatMode} />
          </div>
        </button>
      )}
    </div>
  );
}
