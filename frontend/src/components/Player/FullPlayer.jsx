import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import usePlayerStore from '../../store/usePlayerStore';
import PlayerControls from './PlayerControls';
import ProgressBar from './ProgressBar';
import LyricsView from './LyricsView';
import AnimatedLikeButton from './AnimatedLikeButton';

function getBestThumbnail(url) {
  if (!url) return '/logo-dark.png';

  if (
    url.includes('ytimg.com')
    || url.includes('youtube.com')
    || url.includes('googleusercontent.com')
    || url.includes('ggpht.com')
  ) {
    const upgradedUrl = url
      .replace(/\/default\.jpg/, '/maxresdefault.jpg')
      .replace(/\/mqdefault\.jpg/, '/maxresdefault.jpg')
      .replace(/\/hqdefault\.jpg/, '/maxresdefault.jpg')
      .replace(/\/sddefault\.jpg/, '/maxresdefault.jpg');

    const widthTokenIndex = upgradedUrl.indexOf('=w');
    if (widthTokenIndex !== -1) {
      const querySuffixIndex = upgradedUrl.indexOf('&', widthTokenIndex);
      const querySuffix = querySuffixIndex === -1 ? '' : upgradedUrl.slice(querySuffixIndex);
      return `${upgradedUrl.slice(0, widthTokenIndex)}=w1280-h1280${querySuffix}`;
    }

    const sizeTokenIndex = upgradedUrl.indexOf('=s');
    if (sizeTokenIndex !== -1) {
      const querySuffixIndex = upgradedUrl.indexOf('&', sizeTokenIndex);
      const querySuffix = querySuffixIndex === -1 ? '' : upgradedUrl.slice(querySuffixIndex);
      return `${upgradedUrl.slice(0, sizeTokenIndex)}=s1280${querySuffix}`;
    }

    return upgradedUrl;
  }

  return url;
}

function formatTime(seconds) {
  if (!seconds || Number.isNaN(seconds)) return '0:00';
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

export default function FullPlayer() {
  const currentSong = usePlayerStore((state) => state.currentSong);
  const queue = usePlayerStore((state) => state.queue);
  const playFromQueueIndex = usePlayerStore((state) => state.playFromQueueIndex);
  const moveQueueItem = usePlayerStore((state) => state.moveQueueItem);
  const clearQueue = usePlayerStore((state) => state.clearQueue);
  const setShowFullPlayer = usePlayerStore((state) => state.setShowFullPlayer);
  const [tab, setTab] = useState('player');
  const tabs = useMemo(() => ([
    { key: 'player', label: 'Player' },
    { key: 'lyrics', label: 'Lyrics' },
    { key: 'queue', label: 'Up next' },
  ]), []);
  const tabContainerRef = useRef(null);
  const tabButtonRefs = useRef(new Map());
  const [tabIndicator, setTabIndicator] = useState({ left: 4, width: 96, ready: false });
  const [draggingIndex, setDraggingIndex] = useState(null);
  const [dropIndex, setDropIndex] = useState(null);
  const [dragOverlay, setDragOverlay] = useState(null);
  const dragSessionRef = useRef(null);
  const itemRefs = useRef(new Map());
  const holdTimerRef = useRef(null);
  const dropIndexRef = useRef(null);
  const queueLengthRef = useRef(queue.length);
  const suppressClickRef = useRef(false);
  const queueScrollRef = useRef(null);
  const pointerClientYRef = useRef(null);
  const autoScrollFrameRef = useRef(null);
  const dragRenderFrameRef = useRef(null);

  const heroImage = getBestThumbnail(currentSong?.thumbnail);

  queueLengthRef.current = queue.length;

  useLayoutEffect(() => {
    const container = tabContainerRef.current;
    const activeButton = tabButtonRefs.current.get(tab);
    if (!container || !activeButton) return;

    const containerRect = container.getBoundingClientRect();
    const buttonRect = activeButton.getBoundingClientRect();
    const left = Math.round(buttonRect.left - containerRect.left);
    const width = Math.round(buttonRect.width);

    setTabIndicator((prev) => {
      if (prev.ready && prev.left === left && prev.width === width) return prev;
      return { left, width, ready: true };
    });
  }, [tab]);

  const clearHoldTimer = useCallback(() => {
    if (!holdTimerRef.current) return;
    window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
  }, []);

  const stopAutoScroll = useCallback(() => {
    if (!autoScrollFrameRef.current) return;
    window.cancelAnimationFrame(autoScrollFrameRef.current);
    autoScrollFrameRef.current = null;
  }, []);

  const stopDragRender = useCallback(() => {
    if (!dragRenderFrameRef.current) return;
    window.cancelAnimationFrame(dragRenderFrameRef.current);
    dragRenderFrameRef.current = null;
  }, []);

  const updateDropIndex = useCallback((value) => {
    dropIndexRef.current = value;
    setDropIndex(value);
  }, []);

  const resetDragState = useCallback(() => {
    stopAutoScroll();
    stopDragRender();
    clearHoldTimer();
    dragSessionRef.current = null;
    pointerClientYRef.current = null;
    setDraggingIndex(null);
    updateDropIndex(null);
    setDragOverlay(null);
  }, [clearHoldTimer, stopAutoScroll, stopDragRender, updateDropIndex]);

  const getInsertionIndex = useCallback((clientY) => {
    const container = queueScrollRef.current;
    if (container) {
      const rect = container.getBoundingClientRect();
      if (clientY >= rect.bottom - 28) {
        return queueLengthRef.current;
      }
    }

    const nodes = Array.from(itemRefs.current.entries())
      .sort((left, right) => left[0] - right[0]);

    for (const [index, node] of nodes) {
      if (!node) continue;
      const rect = node.getBoundingClientRect();
      const midpoint = rect.top + (rect.height / 2);
      if (clientY < midpoint) {
        return index;
      }
    }

    return queueLengthRef.current;
  }, []);

  const getClampedOverlayTop = useCallback((clientY) => {
    const container = queueScrollRef.current;
    if (!container) return clientY;

    const dragSession = dragSessionRef.current;
    const draggedHeight = dragSession?.itemHeight ?? 80;
    const pointerOffsetY = dragSession?.pointerOffsetY ?? (draggedHeight / 2);
    const rect = container.getBoundingClientRect();
    const padding = 12;
    const minTop = rect.top + padding;
    const maxTop = rect.bottom - draggedHeight - padding;
    const rawTop = clientY - pointerOffsetY;

    if (minTop > maxTop) {
      return rect.top + Math.max(0, (rect.height - draggedHeight) / 2);
    }

    return Math.min(maxTop, Math.max(minTop, rawTop));
  }, []);

  const getAutoScrollDelta = useCallback((clientY) => {
    const container = queueScrollRef.current;
    if (!container) return 0;

    const rect = container.getBoundingClientRect();
    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
    if (maxScrollTop <= 0) return 0;

    const threshold = 84;
    const maxSpeed = 18;

    if (clientY > rect.bottom - threshold && container.scrollTop < maxScrollTop - 1) {
      const intensity = Math.min(1, (clientY - (rect.bottom - threshold)) / threshold);
      return Math.max(4, intensity * maxSpeed);
    }

    if (clientY < rect.top + threshold && container.scrollTop > 1) {
      const intensity = Math.min(1, ((rect.top + threshold) - clientY) / threshold);
      return -Math.max(4, intensity * maxSpeed);
    }

    return 0;
  }, []);

  const syncDraggedItemPosition = useCallback(() => {
    const dragSession = dragSessionRef.current;
    if (!dragSession?.active) return;

    const clientY = pointerClientYRef.current ?? dragSession.startY;
    const nextTop = getClampedOverlayTop(clientY);

    setDragOverlay((current) => (current ? { ...current, top: nextTop } : current));
  }, [getClampedOverlayTop]);

  const renderDragFrame = useCallback(() => {
    dragRenderFrameRef.current = null;

    const dragSession = dragSessionRef.current;
    if (!dragSession?.active) return;

    const pointerY = pointerClientYRef.current ?? dragSession.startY;
    syncDraggedItemPosition();
    updateDropIndex(getInsertionIndex(pointerY));
  }, [getInsertionIndex, syncDraggedItemPosition, updateDropIndex]);

  const scheduleDragFrame = useCallback(() => {
    if (dragRenderFrameRef.current) return;
    dragRenderFrameRef.current = window.requestAnimationFrame(renderDragFrame);
  }, [renderDragFrame]);

  const runAutoScroll = useCallback(() => {
    const dragSession = dragSessionRef.current;
    const container = queueScrollRef.current;

    if (!dragSession?.active || !container) {
      stopAutoScroll();
      return;
    }

    const pointerY = pointerClientYRef.current ?? dragSession.startY;
    const scrollDelta = getAutoScrollDelta(pointerY);
    if (scrollDelta === 0) {
      stopAutoScroll();
      return;
    }

    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
    const currentScrollTop = container.scrollTop;
    const nextScrollTop = Math.max(0, Math.min(currentScrollTop + scrollDelta, maxScrollTop));

    if (Math.abs(nextScrollTop - currentScrollTop) < 0.5) {
      stopAutoScroll();
      return;
    }

    container.scrollTop = nextScrollTop;
    scheduleDragFrame();

    autoScrollFrameRef.current = window.requestAnimationFrame(runAutoScroll);
  }, [getAutoScrollDelta, scheduleDragFrame, stopAutoScroll]);

  const startAutoScroll = useCallback(() => {
    if (autoScrollFrameRef.current) return;
    autoScrollFrameRef.current = window.requestAnimationFrame(runAutoScroll);
  }, [runAutoScroll]);

  useEffect(() => {
    const handlePointerMove = (event) => {
      const dragSession = dragSessionRef.current;
      if (!dragSession || dragSession.pointerId !== event.pointerId) return;

      const offsetY = event.clientY - dragSession.startY;

      if (!dragSession.active) {
        if (Math.abs(offsetY) > 10) {
          resetDragState();
        }
        return;
      }

      event.preventDefault();
      pointerClientYRef.current = event.clientY;
      scheduleDragFrame();

      if (getAutoScrollDelta(event.clientY) !== 0) {
        startAutoScroll();
      } else {
        stopAutoScroll();
      }
    };

    const handlePointerEnd = (event) => {
      const dragSession = dragSessionRef.current;
      if (!dragSession || dragSession.pointerId !== event.pointerId) return;

      if (!dragSession.active) {
        resetDragState();
        return;
      }

      suppressClickRef.current = true;

      const insertionIndex = dropIndexRef.current ?? dragSession.startIndex;
      let nextIndex = insertionIndex;

      if (insertionIndex > dragSession.startIndex) {
        nextIndex -= 1;
      }

      nextIndex = Math.max(0, Math.min(nextIndex, queueLengthRef.current - 1));

      if (nextIndex !== dragSession.startIndex) {
        moveQueueItem(dragSession.startIndex, nextIndex);
      }

      resetDragState();
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', handlePointerEnd);
    window.addEventListener('pointercancel', handlePointerEnd);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerEnd);
      window.removeEventListener('pointercancel', handlePointerEnd);
      stopAutoScroll();
      stopDragRender();
      clearHoldTimer();
    };
  }, [clearHoldTimer, getAutoScrollDelta, moveQueueItem, resetDragState, scheduleDragFrame, startAutoScroll, stopAutoScroll, stopDragRender]);

  const activateQueueDrag = useCallback((index, clientY) => {
    const dragSession = dragSessionRef.current;
    const draggedNode = itemRefs.current.get(index);
    const draggedSong = Array.isArray(queue) && Number.isInteger(index) && index >= 0 && index < queue.length
      ? queue.at(index)
      : null;
    if (!dragSession || !draggedNode || !draggedSong) return;

    const rect = draggedNode.getBoundingClientRect();
    dragSession.active = true;
    dragSession.pointerOffsetY = clientY - rect.top;
    dragSession.itemHeight = rect.height;

    setDraggingIndex(index);
    setDragOverlay({
      song: draggedSong,
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    });
    updateDropIndex(index);
    scheduleDragFrame();
    startAutoScroll();
  }, [queue, scheduleDragFrame, startAutoScroll, updateDropIndex]);

  const beginQueueDrag = useCallback((event, index) => {
    clearHoldTimer();
    pointerClientYRef.current = event.clientY;

    const pointerType = event.pointerType || 'mouse';
    const dragSession = {
      pointerId: event.pointerId,
      startIndex: index,
      startY: event.clientY,
      startScrollTop: queueScrollRef.current?.scrollTop ?? 0,
      active: pointerType !== 'touch',
    };

    dragSessionRef.current = dragSession;

    if (dragSession.active) {
      activateQueueDrag(index, event.clientY);
      return;
    }

    holdTimerRef.current = window.setTimeout(() => {
      if (!dragSessionRef.current || dragSessionRef.current.pointerId !== event.pointerId) return;
      activateQueueDrag(index, pointerClientYRef.current ?? event.clientY);
    }, 180);
  }, [activateQueueDrag, clearHoldTimer]);

  const handleQueueItemClick = useCallback((index) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }

    playFromQueueIndex(index);
  }, [playFromQueueIndex]);

  const renderQueueRow = useCallback((song) => (
    <>
      <img
        src={getBestThumbnail(song?.thumbnail || '')}
        alt={song?.title || 'Song'}
        className="h-14 w-14 rounded-xl object-cover"
        onError={(event) => { event.target.src = '/logo-dark.png'; }}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">{song?.title || 'Unknown title'}</p>
        <p className="truncate text-sm text-white/55">{song?.artist || 'Unknown artist'}</p>
      </div>
      <span className="text-xs tabular-nums text-white/45">
        {formatTime(song?.durationSeconds)}
      </span>
    </>
  ), []);

  if (!currentSong) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black">
      <div
        className="absolute inset-0 scale-110 opacity-25 blur-3xl"
        style={{
          backgroundImage: `url(${heroImage})`,
          backgroundPosition: 'center',
          backgroundSize: 'cover',
        }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.14),transparent_42%)]" />
      <div className="absolute inset-0 bg-black/80 backdrop-blur-3xl" />

      <div className="relative flex h-full flex-col">
        <div className="flex items-center justify-between px-4 pt-safe pt-4 pb-3">
          <button
            type="button"
            onClick={() => setShowFullPlayer(false)}
            className="flex h-11 w-11 items-center justify-center rounded-full text-gray-300 transition hover:bg-white/10 hover:text-white"
            aria-label="Close player"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" d="M19 12H5m7 7-7-7 7-7" />
            </svg>
          </button>

          <AnimatedLikeButton
            song={currentSong}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white/5"
            iconClassName="h-5 w-5"
          />
        </div>

        <div
          ref={tabContainerRef}
          className="relative mx-auto mb-4 flex w-fit rounded-full border border-white/5 bg-white/[0.06] p-1"
        >
          <div
            aria-hidden="true"
            className="absolute top-1 bottom-1 rounded-full bg-white shadow-[0_8px_24px_rgba(255,255,255,0.18)]"
            style={{
              left: `${tabIndicator.left}px`,
              width: `${tabIndicator.width}px`,
              opacity: tabIndicator.ready ? 1 : 0,
              transition: 'left 240ms cubic-bezier(.2,.8,.2,1), width 240ms cubic-bezier(.2,.8,.2,1), opacity 120ms ease-out',
              willChange: 'left,width',
            }}
          />

          {tabs.map((item) => (
            <button
              key={item.key}
              type="button"
              ref={(node) => {
                if (node) tabButtonRefs.current.set(item.key, node);
                else tabButtonRefs.current.delete(item.key);
              }}
              onClick={() => setTab(item.key)}
              className={`relative z-10 rounded-full px-4 py-2 text-sm font-medium transition-colors duration-200 ${
                tab === item.key
                  ? 'text-black'
                  : 'text-white/60 hover:text-white'
              } ${item.key === 'queue' ? 'min-w-[92px]' : 'min-w-[84px]'}`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === 'player' && (
          <div className="flex-1 overflow-y-auto px-5 pb-12">
            <div className="mx-auto flex min-h-full w-full max-w-md flex-col">
              <div className="flex flex-1 flex-col">
                <div className="flex flex-1 items-center justify-center pt-1">
                  <img
                    src={heroImage}
                    alt={currentSong.title}
                    className="aspect-square w-full max-w-[clamp(18rem,72vw,23rem)] rounded-[2rem] object-cover shadow-[0_28px_80px_rgba(0,0,0,0.55)]"
                    onError={(event) => { event.target.src = '/logo-dark.png'; }}
                  />
                </div>

                <div className="mt-5">
                  <h2 className="text-3xl font-bold tracking-tight text-white">{currentSong.title}</h2>
                  <p className="mt-2 text-lg text-white/75">{currentSong.artist}</p>
                </div>
              </div>

              <div className="mt-5">
                <ProgressBar />
                <div className="mt-5 pb-6">
                  <PlayerControls size="lg" showModeButtons />
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'lyrics' && (
          <div className="flex-1 overflow-hidden">
            <LyricsView />
          </div>
        )}

        {tab === 'queue' && (
          <div className="flex-1 overflow-hidden px-4 pb-4">
            <div className="flex h-full flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04]">
              <div className="flex items-center justify-between border-b border-white/5 px-4 py-4">
                <div>
                  <p className="text-sm uppercase tracking-[0.18em] text-white/45">Up next</p>
                  <p className="mt-1 text-lg font-semibold text-white">
                    {queue?.length ? `${queue.length} song${queue.length > 1 ? 's' : ''}` : 'Queue is empty'}
                  </p>
                </div>

                {queue?.length > 0 && (
                  <button
                    type="button"
                    onClick={clearQueue}
                    className="rounded-full border border-white/10 px-3 py-2 text-sm text-white/70 transition hover:bg-white/10 hover:text-white"
                  >
                    Clear
                  </button>
                )}
              </div>

              <div ref={queueScrollRef} className="flex-1 overflow-y-auto p-2">
                <div className="relative pb-4">
                  {queue?.length ? (
                    queue.map((song, index) => (
                      <div key={`${song?.videoId || index}`}>
                      {dropIndex === index && draggingIndex !== null && (
                        <div className="mx-3 mb-2 h-[3px] rounded-full bg-white/70 shadow-[0_0_18px_rgba(255,255,255,0.25)]" />
                      )}

                      <button
                        ref={(node) => {
                          if (node) {
                            itemRefs.current.set(index, node);
                          } else {
                            itemRefs.current.delete(index);
                          }
                        }}
                        type="button"
                        onPointerDown={(event) => beginQueueDrag(event, index)}
                        onClick={() => handleQueueItemClick(index)}
                        className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition hover:bg-white/5 ${
                          draggingIndex === index ? 'bg-white/[0.06] opacity-35 scale-[0.985]' : ''
                        }`}
                        style={{
                          transitionProperty: 'background-color, opacity, transform',
                          transitionDuration: draggingIndex === index ? '0ms' : '160ms',
                          touchAction: draggingIndex === index ? 'none' : 'pan-y',
                        }}
                      >
                        {renderQueueRow(song)}
                      </button>
                    </div>
                    ))
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/5">
                        <svg className="h-7 w-7 text-white/45" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                          <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h10" />
                        </svg>
                      </div>
                      <p className="mt-5 text-lg font-semibold text-white">Nothing queued yet</p>
                      <p className="mt-2 max-w-xs text-sm text-white/55">
                        Add songs to the queue and they will show up here, just like a proper mobile music player.
                      </p>
                    </div>
                  )}

                  {dropIndex === queue.length && draggingIndex !== null && (
                    <div className="px-3 pt-2">
                      <div className="h-[3px] rounded-full bg-white/70 shadow-[0_0_18px_rgba(255,255,255,0.25)]" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {dragOverlay?.song && (
          <div
            className="pointer-events-none absolute z-30"
            style={{
              left: `${dragOverlay.left}px`,
              top: `${dragOverlay.top}px`,
              width: `${dragOverlay.width}px`,
              height: `${dragOverlay.height}px`,
              transition: 'top 0ms',
              willChange: 'top',
            }}
          >
            <div className="flex h-full items-center gap-3 rounded-2xl bg-[#1d1a17] px-3 py-3 text-left shadow-2xl shadow-black/45 ring-1 ring-white/10">
              {renderQueueRow(dragOverlay.song)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
