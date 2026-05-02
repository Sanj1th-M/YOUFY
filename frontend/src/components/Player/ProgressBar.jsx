import usePlayerStore from '../../store/usePlayerStore';

function fmt(s) {
  if (!s || isNaN(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function ProgressBar({ compact = false }) {
  const currentTime = usePlayerStore(s => s.currentTime);
  const duration    = usePlayerStore(s => s.duration);
  const seek        = usePlayerStore(s => s.seek);
  const pct = duration ? (currentTime / duration) * 100 : 0;

  const handleClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    seek(((e.clientX - rect.left) / rect.width) * duration);
  };

  const handleTouch = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    seek(((e.touches[0].clientX - rect.left) / rect.width) * duration);
  };

  return (
    <div className={`w-full flex items-center gap-2 ${compact ? '' : 'gap-3'}`}>
      {!compact && <span className="text-xs text-gray-400 w-8 text-right tabular-nums">{fmt(currentTime)}</span>}
      <div
        className="flex-1 h-1 bg-subtle rounded-full cursor-pointer group relative"
        onClick={handleClick}
        onTouchStart={handleTouch}
      >
        <div className="h-full bg-gray-500 group-hover:bg-white rounded-full transition-colors relative"
          style={{ width: `${pct}%` }}>
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full
                          opacity-0 group-hover:opacity-100 transition-opacity shadow" />
        </div>
      </div>
      {!compact && <span className="text-xs text-gray-400 w-8 tabular-nums">{fmt(duration)}</span>}
    </div>
  );
}
