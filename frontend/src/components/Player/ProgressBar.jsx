import { useState, useEffect, useRef } from 'react';
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

  const [isDragging, setIsDragging] = useState(false);
  const [dragValue, setDragValue] = useState(0);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!isDragging) {
      setDragValue(currentTime);
    }
  }, [currentTime, isDragging]);

  const handlePointerMove = (e) => {
    if (!isDragging || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX || (e.touches && e.touches[0].clientX);
    const pos = Math.max(0, Math.min(1, (x - rect.left) / rect.width));
    const val = pos * duration;
    setDragValue(val);
    seek(val);
  };

  const handlePointerDown = (e) => {
    setIsDragging(true);
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX || (e.touches && e.touches[0].clientX);
    const pos = Math.max(0, Math.min(1, (x - rect.left) / rect.width));
    const val = pos * duration;
    setDragValue(val);
    seek(val);
  };

  useEffect(() => {
    const up = () => setIsDragging(false);
    const move = (e) => {
      if (isDragging) handlePointerMove(e);
    };

    if (isDragging) {
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('touchmove', move, { passive: false });
      window.addEventListener('touchend', up);
    }
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', up);
    };
  }, [isDragging, duration]);

  const pct = duration ? (dragValue / duration) * 100 : 0;

  return (
    <div className={`w-full flex items-center gap-4 ${compact ? '' : 'gap-6'}`}>
      {!compact && <span className="text-xs text-gray-400 w-8 text-right tabular-nums">{fmt(isDragging ? dragValue : currentTime)}</span>}
      <div
        ref={containerRef}
        className="flex-1 h-6 flex items-center cursor-pointer group relative touch-none"
        onPointerDown={handlePointerDown}
      >
        <div className="w-full h-1 bg-subtle rounded-full overflow-hidden">
          <div 
            className="h-full bg-gray-500 group-hover:bg-white rounded-full transition-colors relative"
            style={{ width: `${pct}%` }}
          >
          </div>
        </div>
        {/* Visible Thumb - original design was absolute right-0 inside the progress bar */}
        <div 
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full
                      opacity-0 group-hover:opacity-100 transition-opacity shadow pointer-events-none"
          style={{ left: `calc(${pct}% - 6px)` }}
        />
      </div>
      {!compact && <span className="text-xs text-gray-400 w-8 tabular-nums">{fmt(duration)}</span>}
    </div>
  );
}
