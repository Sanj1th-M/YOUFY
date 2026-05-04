import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import usePlayerStore from '../../store/usePlayerStore';
import usePlaylistStore from '../../store/usePlaylistStore';
import { isSystemLikedPlaylist } from '../../utils/playlists';
import PlayerControls from './PlayerControls';
import ProgressBar from './ProgressBar';
import LyricsView from './LyricsView';
import { lyricsCache } from '../../hooks/useLyrics';
import AnimatedLikeButton from './AnimatedLikeButton';
import QueuePlaylistPickerModal from './QueuePlaylistPickerModal';

const HANDLE_DRAG_DELAY_MS = 140;
const ACTION_MENU_WIDTH = 320;
const ACTION_MENU_HEIGHT = 272;

function formatTime(seconds) {
  if (!seconds || Number.isNaN(seconds)) return '0:00';
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

export default function FullPlayer() {
  const navigate = useNavigate();
  const currentSong = usePlayerStore((state) => state.currentSong);
  const queue = usePlayerStore((state) => state.queue);
  const playFromQueueIndex = usePlayerStore((state) => state.playFromQueueIndex);
  const queueSongNext = usePlayerStore((state) => state.queueSongNext);
  const moveQueueItem = usePlayerStore((state) => state.moveQueueItem);
  const clearQueue = usePlayerStore((state) => state.clearQueue);
  const setShowFullPlayer = usePlayerStore((state) => state.setShowFullPlayer);
  const playlists = usePlaylistStore((state) => state.playlists);
  const isSongLiked = usePlaylistStore((state) => state.isSongLiked);
  const toggleLike = usePlaylistStore((state) => state.toggleLike);
  const addSongToPlaylist = usePlaylistStore((state) => state.addSong);
  const createPlaylist = usePlaylistStore((state) => state.createPlaylist);
  const [lyricsKey, setLyricsKey] = useState(0);
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
  const [queueActionMenu, setQueueActionMenu] = useState(null);
  const [playlistPickerSong, setPlaylistPickerSong] = useState(null);
  const [playlistActionBusy, setPlaylistActionBusy] = useState(false);
  const [queueNotice, setQueueNotice] = useState('');
  const dragSessionRef = useRef(null);
  const handlePressRef = useRef(null);
  const itemRefs = useRef(new Map());
  const dropIndexRef = useRef(null);
  const queueLengthRef = useRef(queue.length);
  const suppressClickRef = useRef(false);
  const suppressHandleClickRef = useRef(false);
  const queueScrollRef = useRef(null);
  const pointerClientYRef = useRef(null);
  const autoScrollFrameRef = useRef(null);
  const dragRenderFrameRef = useRef(null);

  // Use the exact URL we already have in state (often cached from lists/mini-player),
  // instead of rewriting it into a new "higher-res" URL that may fail under bursty loads.
  const heroImage = currentSong?.thumbnail || '/logo.svg';
  const regularPlaylists = useMemo(
    () => playlists.filter((playlist) => playlist?.id && !isSystemLikedPlaylist(playlist)),
    [playlists],
  );

  queueLengthRef.current = queue.length;

  useEffect(() => {
    if (!queueNotice) return undefined;
    const timer = window.setTimeout(() => setQueueNotice(''), 2200);
    return () => window.clearTimeout(timer);
  }, [queueNotice]);

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

  const clearHandlePress = useCallback(() => {
    if (handlePressRef.current?.timerId) {
      window.clearTimeout(handlePressRef.current.timerId);
    }
    handlePressRef.current = null;
  }, []);

  const closeQueueActionMenu = useCallback(() => {
    setQueueActionMenu(null);
  }, []);

  const openQueueActionMenu = useCallback((song, index, anchorNode) => {
    if (!song || !anchorNode) return;

    const rect = anchorNode.getBoundingClientRect();
    const left = Math.min(
      window.innerWidth - ACTION_MENU_WIDTH - 16,
      Math.max(16, rect.right - ACTION_MENU_WIDTH),
    );
    const preferredTop = rect.bottom + 12;
    const top = preferredTop + ACTION_MENU_HEIGHT > window.innerHeight - 16
      ? Math.max(16, rect.top - ACTION_MENU_HEIGHT - 12)
      : preferredTop;

    setQueueActionMenu((current) => (
      current?.index === index
        ? null
        : {
            index,
            song,
            left,
            top,
          }
    ));
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
    setDropIndex((previous) => (previous === value ? previous : value));
  }, []);

  const getDraggedRowNode = useCallback(() => {
    const dragSession = dragSessionRef.current;
    if (!dragSession) return null;
    return itemRefs.current.get(dragSession.startIndex) ?? null;
  }, []);

  const clearDraggedRowStyles = useCallback(() => {
    const rowNode = getDraggedRowNode();
    if (!rowNode) return;

    rowNode.style.transform = '';
    rowNode.style.transition = '';
    rowNode.style.zIndex = '';
    rowNode.style.willChange = '';
    rowNode.style.boxShadow = '';
  }, [getDraggedRowNode]);

  const applyDraggedRowTransform = useCallback((translateY) => {
    const rowNode = getDraggedRowNode();
    if (!rowNode) return;

    rowNode.style.transform = `translate3d(0, ${translateY}px, 0)`;
    rowNode.style.transition = 'none';
    rowNode.style.zIndex = '20';
    rowNode.style.willChange = 'transform';
    rowNode.style.boxShadow = '0 18px 40px rgba(0,0,0,0.42)';
  }, [getDraggedRowNode]);

  const resetDragState = useCallback(() => {
    stopAutoScroll();
    stopDragRender();
    clearDraggedRowStyles();
    dragSessionRef.current = null;
    pointerClientYRef.current = null;
    setDraggingIndex(null);
    updateDropIndex(null);
  }, [clearDraggedRowStyles, stopAutoScroll, stopDragRender, updateDropIndex]);

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

  const getDraggedMetrics = useCallback((clientY) => {
    const dragSession = dragSessionRef.current;
    const container = queueScrollRef.current;
    if (!dragSession?.active || !container) return null;

    const scrollDelta = container.scrollTop - dragSession.startScrollTop;
    const baseTop = dragSession.startTop - scrollDelta;
    const desiredTop = clientY - dragSession.pointerOffsetY;
    const rect = container.getBoundingClientRect();
    const padding = 8;
    const minTop = rect.top + padding;
    const maxTop = rect.bottom - dragSession.itemHeight - padding;
    const clampedTop = Math.min(maxTop, Math.max(minTop, desiredTop));
    const translateY = clampedTop - baseTop;
    const draggedCenter = clampedTop + (dragSession.itemHeight / 2);

    return { translateY, draggedCenter };
  }, []);

  const getTargetIndex = useCallback((draggedCenter) => {
    const dragSession = dragSessionRef.current;
    const container = queueScrollRef.current;
    if (!dragSession || !container) return 0;

    const scrollDelta = container.scrollTop - dragSession.startScrollTop;
    let targetIndex = 0;

    for (const row of dragSession.rows) {
      if (row.index === dragSession.startIndex) continue;

      const midpoint = row.top - scrollDelta + (row.height / 2);
      if (draggedCenter < midpoint) {
        break;
      }

      targetIndex += 1;
    }

    return Math.max(0, Math.min(targetIndex, queueLengthRef.current - 1));
  }, []);

  const renderDragFrame = useCallback(() => {
    dragRenderFrameRef.current = null;

    const dragSession = dragSessionRef.current;
    if (!dragSession?.active) return;

    const pointerY = pointerClientYRef.current ?? dragSession.startY;
    const dragMetrics = getDraggedMetrics(pointerY);
    if (!dragMetrics) return;

    applyDraggedRowTransform(dragMetrics.translateY);
    updateDropIndex(getTargetIndex(dragMetrics.draggedCenter));
  }, [applyDraggedRowTransform, getDraggedMetrics, getTargetIndex, updateDropIndex]);

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

  const activateQueueDrag = useCallback(({ index, pointerId, clientY }) => {
    if (queue.length < 2 || dragSessionRef.current) return;

    const container = queueScrollRef.current;
    const draggedNode = itemRefs.current.get(index);
    if (!container || !draggedNode) return;

    closeQueueActionMenu();

    const rect = draggedNode.getBoundingClientRect();
    const rows = queue
      .map((_, rowIndex) => {
        const rowNode = itemRefs.current.get(rowIndex);
        if (!rowNode) return null;
        const rowRect = rowNode.getBoundingClientRect();
        return {
          index: rowIndex,
          top: rowRect.top,
          height: rowRect.height,
        };
      })
      .filter(Boolean);

    pointerClientYRef.current = clientY;
    dragSessionRef.current = {
      pointerId,
      startIndex: index,
      startY: clientY,
      startTop: rect.top,
      startScrollTop: container.scrollTop,
      itemHeight: rect.height,
      pointerOffsetY: clientY - rect.top,
      rows,
      active: true,
    };
    setDraggingIndex(index);
    updateDropIndex(index);
    scheduleDragFrame();
  }, [closeQueueActionMenu, queue, scheduleDragFrame, updateDropIndex]);

  useEffect(() => {
    const handlePointerMove = (event) => {
      const handlePress = handlePressRef.current;
      if (handlePress && handlePress.pointerId === event.pointerId && !dragSessionRef.current) {
        handlePress.clientX = event.clientX;
        handlePress.clientY = event.clientY;

        if (handlePress.pointerType !== 'mouse') {
          if (event.cancelable) event.preventDefault();
          return;
        }

        const movement = Math.hypot(
          event.clientX - handlePress.startClientX,
          event.clientY - handlePress.startClientY,
        );

        if (queue.length > 1 && event.buttons === 1 && movement > 6) {
          clearHandlePress();
          activateQueueDrag({ index: handlePress.index, pointerId: event.pointerId, clientY: event.clientY });
          if (event.cancelable) event.preventDefault();
        }

        return;
      }

      const dragSession = dragSessionRef.current;
      if (!dragSession || dragSession.pointerId !== event.pointerId) return;

      if (event.cancelable) event.preventDefault();
      pointerClientYRef.current = event.clientY;
      scheduleDragFrame();

      if (getAutoScrollDelta(event.clientY) !== 0) {
        startAutoScroll();
      } else {
        stopAutoScroll();
      }
    };

    const handlePointerEnd = (event) => {
      const handlePress = handlePressRef.current;
      if (handlePress && handlePress.pointerId === event.pointerId && !dragSessionRef.current) {
        const { anchorNode, index, pointerType, song } = handlePress;
        clearHandlePress();

        if (pointerType !== 'mouse' && event.type !== 'pointercancel') {
          if (event.cancelable) event.preventDefault();
          suppressHandleClickRef.current = true;
          openQueueActionMenu(song, index, anchorNode);
        }

        return;
      }

      const dragSession = dragSessionRef.current;
      if (!dragSession || dragSession.pointerId !== event.pointerId) return;

      if (event.cancelable) event.preventDefault();

      if (event.type === 'pointercancel') {
        resetDragState();
        return;
      }

      suppressClickRef.current = true;
      suppressHandleClickRef.current = true;
      const nextIndex = Math.max(
        0,
        Math.min(dropIndexRef.current ?? dragSession.startIndex, queueLengthRef.current - 1),
      );
      const startIndex = dragSession.startIndex;

      resetDragState();

      if (nextIndex !== startIndex) {
        moveQueueItem(startIndex, nextIndex);
      }
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', handlePointerEnd, { passive: false });
    window.addEventListener('pointercancel', handlePointerEnd, { passive: false });

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerEnd);
      window.removeEventListener('pointercancel', handlePointerEnd);
      clearHandlePress();
      stopAutoScroll();
      stopDragRender();
      clearDraggedRowStyles();
    };
  }, [activateQueueDrag, clearDraggedRowStyles, clearHandlePress, getAutoScrollDelta, moveQueueItem, openQueueActionMenu, queue.length, resetDragState, scheduleDragFrame, startAutoScroll, stopAutoScroll, stopDragRender]);

  const beginQueueHandlePress = useCallback((event, song, index) => {
    if (!song) return;
    if (event.button !== undefined && event.button !== 0) return;

    const pointerId = event.pointerId;
    const anchorNode = event.currentTarget;
    const pointerType = event.pointerType || 'mouse';

    if (pointerType !== 'mouse' && event.cancelable) event.preventDefault();
    event.stopPropagation();
    anchorNode.setPointerCapture?.(pointerId);
    clearHandlePress();
    closeQueueActionMenu();

    handlePressRef.current = {
      pointerId,
      index,
      song,
      anchorNode,
      pointerType,
      startClientX: event.clientX,
      startClientY: event.clientY,
      clientX: event.clientX,
      clientY: event.clientY,
      timerId: null,
    };

    if (pointerType === 'mouse' || queue.length < 2) return;

    handlePressRef.current.timerId = window.setTimeout(() => {
      const currentPress = handlePressRef.current;
      if (!currentPress || currentPress.pointerId !== pointerId) return;

      const nextClientY = currentPress.clientY;
      clearHandlePress();
      activateQueueDrag({ index, pointerId, clientY: nextClientY });
    }, HANDLE_DRAG_DELAY_MS);
  }, [activateQueueDrag, clearHandlePress, closeQueueActionMenu, queue.length]);

  const getRowShift = useCallback((index) => {
    if (draggingIndex === null || dropIndex === null || index === draggingIndex) return 0;

    const draggedHeight = dragSessionRef.current?.itemHeight ?? 80;

    if (index < draggingIndex && index >= dropIndex) {
      return draggedHeight;
    }

    if (index > draggingIndex && index <= dropIndex) {
      return -draggedHeight;
    }

    return 0;
  }, [draggingIndex, dropIndex]);

  const handleQueueItemClick = useCallback((index) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }

    playFromQueueIndex(index);
  }, [playFromQueueIndex]);

  useEffect(() => {
    if (tab === 'queue') return;
    if (dragSessionRef.current) resetDragState();
    clearHandlePress();
    closeQueueActionMenu();
    setPlaylistActionBusy(false);
    setPlaylistPickerSong(null);
  }, [clearHandlePress, closeQueueActionMenu, resetDragState, tab]);

  useEffect(() => {
    if (!queueActionMenu && !playlistPickerSong) return undefined;

    const handleEscape = (event) => {
      if (event.key !== 'Escape') return;
      closeQueueActionMenu();
      setPlaylistPickerSong(null);
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [closeQueueActionMenu, playlistPickerSong, queueActionMenu]);

  const handleAddToLiked = useCallback(async (song) => {
    closeQueueActionMenu();

    if (!song?.videoId) return;
    if (isSongLiked(song.videoId)) {
      setQueueNotice('Already in liked songs.');
      return;
    }

    await toggleLike(song);
    setQueueNotice('Added to liked songs.');
  }, [closeQueueActionMenu, isSongLiked, toggleLike]);

  const handlePlayNext = useCallback((song) => {
    closeQueueActionMenu();

    if (!song?.videoId) return;
    queueSongNext(song);
    setQueueNotice('Will play next.');
  }, [closeQueueActionMenu, queueSongNext]);

  const handleOpenPlaylistPicker = useCallback((song) => {
    closeQueueActionMenu();
    setPlaylistPickerSong(song);
  }, [closeQueueActionMenu]);

  const handleAddSongToPlaylist = useCallback(async (playlistId) => {
    if (!playlistPickerSong?.videoId || !playlistId) return;

    const targetPlaylist = regularPlaylists.find((playlist) => playlist.id === playlistId);
    const alreadyExists = Boolean(
      targetPlaylist?.songs?.some((playlistSong) => playlistSong?.videoId === playlistPickerSong.videoId),
    );

    setPlaylistActionBusy(true);
    const added = await addSongToPlaylist(playlistId, playlistPickerSong);
    setPlaylistActionBusy(false);

    if (!added) {
      setQueueNotice('Could not add to playlist right now.');
      return;
    }

    setPlaylistPickerSong(null);
    setQueueNotice(alreadyExists ? 'Already in that playlist.' : `Added to ${targetPlaylist?.name || 'playlist'}.`);
  }, [addSongToPlaylist, playlistPickerSong, regularPlaylists]);

  const handleCreatePlaylistForSong = useCallback(async (name) => {
    if (!playlistPickerSong?.videoId || !name) return;

    setPlaylistActionBusy(true);
    const created = await createPlaylist(name);

    if (!created?.id) {
      setPlaylistActionBusy(false);
      setQueueNotice('Could not create a playlist right now.');
      return;
    }

    const added = await addSongToPlaylist(created.id, playlistPickerSong);
    setPlaylistActionBusy(false);

    if (!added) {
      setQueueNotice('Playlist created, but the song could not be added.');
      return;
    }

    setPlaylistPickerSong(null);
    setQueueNotice(`Created "${created.name}" and added the song.`);
  }, [addSongToPlaylist, createPlaylist, playlistPickerSong]);

  const handleShareSong = useCallback(async (song) => {
    closeQueueActionMenu();

    if (!song?.videoId) return;

    const url = `https://music.youtube.com/watch?v=${encodeURIComponent(song.videoId)}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: song.title || 'Song',
          text: song.artist ? `${song.title} by ${song.artist}` : (song.title || 'Listen on Youfy'),
          url,
        });
        setQueueNotice('Shared.');
        return;
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setQueueNotice('Song link copied.');
        return;
      }

      setQueueNotice(url);
    } catch (error) {
      if (error?.name === 'AbortError') return;
      setQueueNotice('Could not share this song right now.');
    }
  }, [closeQueueActionMenu]);

  const renderQueueRowMain = useCallback((song) => (
    <>
      <img
        src={song?.thumbnail || '/logo.svg'}
        alt={song?.title || 'Song'}
        className="h-14 w-14 rounded-xl object-cover"
        loading="lazy"
        decoding="async"
        onError={(event) => { event.target.src = '/logo.svg'; }}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">{song?.title || 'Unknown title'}</p>
        <p className="truncate text-sm text-white/55">{song?.artist || 'Unknown artist'}</p>
      </div>
    </>
  ), []);

  const renderQueueRowRight = useCallback((song, index) => (
    <>
      <span className="text-xs tabular-nums text-white/45">
        {formatTime(song?.durationSeconds)}
      </span>
      <button
        type="button"
        onPointerDown={(event) => beginQueueHandlePress(event, song, index)}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();

          if (suppressHandleClickRef.current) {
            suppressHandleClickRef.current = false;
            return;
          }

          openQueueActionMenu(song, index, event.currentTarget);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.stopPropagation();
          }
        }}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/40 transition hover:bg-white/6 hover:text-white active:scale-95"
        style={{ touchAction: 'none' }}
        aria-label="Queue item actions"
        title="Queue item actions"
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" d="M7 6h10M7 12h10M7 18h10" />
        </svg>
      </button>
    </>
  ), [beginQueueHandlePress, openQueueActionMenu]);

  if (!currentSong) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black">
      <div
        className="absolute inset-0 scale-110 opacity-25 blur-3xl md:hidden"
        style={{
          backgroundImage: `url(${heroImage})`,
          backgroundPosition: 'center',
          backgroundSize: 'cover',
        }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.14),transparent_42%)] md:hidden" />
      <div className="absolute inset-0 bg-black/80 backdrop-blur-3xl md:hidden" />

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

        {/* ── Mobile: Tab bar (hidden on desktop) ── */}
        <div
          ref={tabContainerRef}
          className="relative mx-auto mb-4 flex w-fit rounded-full border border-white/5 bg-white/[0.06] p-1 md:hidden"
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

        {/* ── Desktop: 3-column layout (lyrics | player | queue) ── */}
        <div className="hidden md:flex flex-1 overflow-hidden gap-6 px-8 pb-8">
          {/* Left: Lyrics */}
          <div className="flex w-[25%] min-w-[300px] max-w-[380px] flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.03]">
            <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
              <p className="text-sm uppercase tracking-[0.18em] text-white/45">Lyrics</p>
              <button
                type="button"
                onClick={() => {
                  if (currentSong?.videoId) {
                    lyricsCache.delete(currentSong.videoId);
                    setLyricsKey((k) => k + 1);
                  }
                }}
                className="flex h-8 w-8 items-center justify-center rounded-full text-white/50 transition hover:bg-white/10 hover:text-white"
                aria-label="Reload lyrics"
                title="Reload lyrics"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-hidden flex flex-col relative">
              <LyricsView key={`desktop-${lyricsKey}`} />
            </div>
          </div>

          {/* Center: Player */}
          <div className="flex flex-1 flex-col items-center justify-center px-6 min-w-0">
            <div className="flex flex-1 items-center justify-center w-full min-h-0">
              <img
                src={heroImage}
                alt={currentSong.title}
                className="aspect-square w-full max-w-[clamp(16rem,30vw,28rem)] rounded-[2rem] object-cover shadow-[0_28px_80px_rgba(0,0,0,0.55)]"
                onError={(event) => { event.target.src = '/logo.svg'; }}
              />
            </div>

            <div className="mt-6 w-full text-center min-w-0">
              <h2 className="text-3xl font-bold tracking-tight text-white truncate">{currentSong.title}</h2>
              <p
                className="mt-2 text-lg text-white/75 hover:underline cursor-pointer inline-block truncate max-w-full"
                onClick={() => {
                  setShowFullPlayer(false);
                  navigate(`/search?q=${encodeURIComponent(currentSong.artist)}`);
                }}
              >
                {currentSong.artist}
              </p>
            </div>

            <div className="mt-6 w-full max-w-xl mx-auto">
              <ProgressBar />
              <div className="mt-6 pb-4">
                <PlayerControls size="lg" showModeButtons />
              </div>
            </div>
          </div>

          {/* Right: Queue */}
          <div className="flex w-[25%] min-w-[300px] max-w-[380px] flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.03]">
            <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
              <div>
                <p className="text-sm uppercase tracking-[0.18em] text-white/45">Up next</p>
                <p className="mt-0.5 text-base font-semibold text-white">
                  {queue?.length ? `${queue.length} song${queue.length > 1 ? 's' : ''}` : 'Queue is empty'}
                </p>
              </div>

              {queue?.length > 0 && (
                <button
                  type="button"
                  onClick={clearQueue}
                  className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/70 transition hover:bg-white/10 hover:text-white"
                >
                  Clear
                </button>
              )}
            </div>

            <div ref={queueScrollRef} className="flex-1 overflow-y-auto p-2">
              <div className="relative pb-4">
                {queue?.length ? (
                  queue.map((song, index) => (
                    <div
                      key={`${song?.videoId || index}-desktop`}
                      ref={(node) => {
                        if (node) {
                          itemRefs.current.set(index, node);
                        } else {
                          itemRefs.current.delete(index);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleQueueItemClick(index)}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return;
                        event.preventDefault();
                        handleQueueItemClick(index);
                      }}
                      className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left select-none outline-none ring-0 transition ${
                        draggingIndex === index
                          ? 'bg-white/[0.08]'
                          : 'hover:bg-white/5 focus-visible:bg-white/5'
                      }`}
                      style={{
                        transform: draggingIndex === index
                          ? undefined
                          : `translate3d(0, ${getRowShift(index)}px, 0)`,
                        transition: draggingIndex === index
                          ? 'none'
                          : 'transform 0.2s ease, background-color 0.2s ease',
                        touchAction: 'pan-y',
                      }}
                    >
                      {renderQueueRowMain(song)}
                      <div className="ml-auto flex items-center gap-2 pl-2">
                        {renderQueueRowRight(song, index)}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex h-full flex-col items-center justify-center px-6 py-8 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/5">
                      <svg className="h-6 w-6 text-white/45" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                        <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h10" />
                      </svg>
                    </div>
                    <p className="mt-4 text-base font-semibold text-white">Nothing queued yet</p>
                    <p className="mt-1.5 max-w-[200px] text-xs text-white/55">
                      Add songs to the queue and they will show up here.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Mobile: Tabbed content (hidden on desktop) ── */}
        {tab === 'player' && (
          <div className="flex-1 overflow-y-auto px-5 pb-12 md:hidden">
            <div className="mx-auto flex min-h-full w-full max-w-md flex-col">
              <div className="flex flex-1 flex-col">
                <div className="flex flex-1 items-center justify-center pt-1">
                  <img
                    src={heroImage}
                    alt={currentSong.title}
                    className="aspect-square w-full max-w-[clamp(18rem,72vw,23rem)] rounded-[2rem] object-cover shadow-[0_28px_80px_rgba(0,0,0,0.55)]"
                    onError={(event) => { event.target.src = '/logo.svg'; }}
                  />
                </div>

                <div className="mt-5">
                  <h2 className="text-3xl font-bold tracking-tight text-white">{currentSong.title}</h2>
                  <p 
                    className="mt-2 text-lg text-white/75 hover:underline cursor-pointer inline-block"
                    onClick={() => {
                      setShowFullPlayer(false);
                      navigate(`/search?q=${encodeURIComponent(currentSong.artist)}`);
                    }}
                  >
                    {currentSong.artist}
                  </p>
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

        <div className={`flex-1 overflow-hidden md:hidden relative ${tab === 'lyrics' ? 'flex flex-col' : 'hidden'}`}>
          <div className="absolute right-4 top-2 z-10">
            <button
              type="button"
              onClick={() => {
                if (currentSong?.videoId) {
                  lyricsCache.delete(currentSong.videoId);
                  setLyricsKey((k) => k + 1);
                }
              }}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-white/50 backdrop-blur-md transition hover:bg-white/10 hover:text-white"
              aria-label="Reload lyrics"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
          <LyricsView key={`mobile-${lyricsKey}`} />
        </div>

        {tab === 'queue' && (
          <div className="flex-1 overflow-hidden px-4 pb-4 md:hidden">
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
                      <div
                        key={`${song?.videoId || index}`}
                        ref={(node) => {
                          if (node) {
                            itemRefs.current.set(index, node);
                          } else {
                            itemRefs.current.delete(index);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleQueueItemClick(index)}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter' && event.key !== ' ') return;
                          event.preventDefault();
                          handleQueueItemClick(index);
                        }}
                        className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left select-none outline-none ring-0 transition ${
                          draggingIndex === index
                            ? 'bg-white/[0.08]'
                            : 'hover:bg-white/5 focus-visible:bg-white/5'
                        }`}
                        style={{
                          transform: draggingIndex === index
                            ? undefined
                            : `translate3d(0, ${getRowShift(index)}px, 0)`,
                          transition: draggingIndex === index
                            ? 'none'
                            : 'transform 0.2s ease, background-color 0.2s ease',
                          touchAction: 'pan-y',
                        }}
                      >
                        {renderQueueRowMain(song)}
                        <div className="ml-auto flex items-center gap-2 pl-2">
                          {renderQueueRowRight(song, index)}
                        </div>
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
                </div>
              </div>
            </div>
          </div>
        )}

        {queueActionMenu?.song && (
          <>
            <button
              type="button"
              aria-label="Close queue actions"
              onClick={closeQueueActionMenu}
              className="absolute inset-0 z-[55] bg-transparent"
            />

            <div
              className="absolute z-[60] overflow-hidden rounded-[34px] border border-white/10 bg-black/92 shadow-[0_30px_90px_rgba(0,0,0,0.62)] backdrop-blur-[24px]"
              style={{
                left: `${queueActionMenu.left}px`,
                top: `${queueActionMenu.top}px`,
                width: `${ACTION_MENU_WIDTH}px`,
              }}
            >
              <div className="px-4 py-4">
                <button
                  type="button"
                  onClick={() => handleAddToLiked(queueActionMenu.song)}
                  className="w-full rounded-[24px] px-5 py-4 text-left text-[18px] font-medium text-white transition-colors hover:bg-white/[0.06]"
                >
                  Add to liked
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenPlaylistPicker(queueActionMenu.song)}
                  className="w-full rounded-[24px] px-5 py-4 text-left text-[18px] font-medium text-white transition-colors hover:bg-white/[0.06]"
                >
                  Add to playlist
                </button>
                <button
                  type="button"
                  onClick={() => handlePlayNext(queueActionMenu.song)}
                  className="w-full rounded-[24px] px-5 py-4 text-left text-[18px] font-medium text-white transition-colors hover:bg-white/[0.06]"
                >
                  Play next
                </button>
                <button
                  type="button"
                  onClick={() => handleShareSong(queueActionMenu.song)}
                  className="w-full rounded-[24px] px-5 py-4 text-left text-[18px] font-medium text-white transition-colors hover:bg-white/[0.06]"
                >
                  Share
                </button>
              </div>
            </div>
          </>
        )}

        <QueuePlaylistPickerModal
          song={playlistPickerSong}
          playlists={regularPlaylists}
          busy={playlistActionBusy}
          onClose={() => {
            setPlaylistActionBusy(false);
            setPlaylistPickerSong(null);
          }}
          onAddToPlaylist={handleAddSongToPlaylist}
          onCreatePlaylist={handleCreatePlaylistForSong}
        />

        {queueNotice && (
          <div className="pointer-events-none absolute inset-x-0 bottom-6 z-[70] flex justify-center px-4">
            <div className="rounded-full border border-white/10 bg-black/85 px-4 py-2 text-sm font-medium text-white shadow-[0_18px_48px_rgba(0,0,0,0.42)] backdrop-blur-xl">
              {queueNotice}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
