import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AddSongsModal from '../components/Library/AddSongsModal';
import PlaylistArtwork, { getPlaylistArtworkSources } from '../components/Library/PlaylistArtwork';
import PlaylistEditModal from '../components/Library/PlaylistEditModal';
import SavePlaylistModal from '../components/Library/SavePlaylistModal';
import { getPlaylistSongs } from '../services/api';
import useAuthStore from '../store/useAuthStore';
import usePlayerStore from '../store/usePlayerStore';
import usePlaylistStore from '../store/usePlaylistStore';

function getBestThumbnail(thumbnails, fallback = '') {
  if (!Array.isArray(thumbnails) || thumbnails.length === 0) return fallback;
  const url = thumbnails[thumbnails.length - 1]?.url || fallback;
  if (!url) return fallback;
  return url
    .replace(/=w\d+-h\d+(-[^&]+)?/, '=w1280-h1280')
    .replace(/=s\d+/, '=s1280');
}

function normalizeSong(song) {
  if (!song) return null;

  return {
    videoId: song.videoId || '',
    title: song.name || song.title || 'Unknown',
    artist:
      (typeof song.artist === 'string' ? song.artist : song.artist?.name)
      || (Array.isArray(song.artists) ? song.artists[0]?.name : null)
      || song.author?.name
      || 'Unknown',
    thumbnail: getBestThumbnail(song.thumbnails) || song.thumbnail || '',
    durationSeconds: song.duration || song.durationSeconds || 0,
    album: (typeof song.album === 'string' ? song.album : song.album?.name) || '',
  };
}

function fmtSongDuration(seconds) {
  if (!seconds) return '';
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}:${remainder.toString().padStart(2, '0')}`;
}

function fmtTotalDuration(songs) {
  const total = songs.reduce((accumulator, song) => accumulator + (song.durationSeconds || 0), 0);
  if (!total) return '';

  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);

  if (hours <= 0) {
    return `${minutes} min`;
  }

  return `${hours} hr${hours === 1 ? '' : 's'}, ${minutes} min`;
}

function getPlaylistYear(createdAt) {
  if (!createdAt) return '';

  if (typeof createdAt === 'string' || typeof createdAt === 'number') {
    const date = new Date(createdAt);
    return Number.isNaN(date.getTime()) ? '' : String(date.getFullYear());
  }

  if (typeof createdAt === 'object') {
    if (typeof createdAt.seconds === 'number') {
      return String(new Date(createdAt.seconds * 1000).getFullYear());
    }
    if (typeof createdAt._seconds === 'number') {
      return String(new Date(createdAt._seconds * 1000).getFullYear());
    }
  }

  return '';
}

function privacyLabel(privacy) {
  if (privacy === 'private') return 'Private';
  if (privacy === 'unlisted') return 'Unlisted';
  return 'Public';
}

function shuffleSongs(songs) {
  const next = [...songs];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

function buildQueue(items, excludedId = '') {
  const seen = new Set();

  return items.filter((song) => {
    const videoId = song?.videoId;
    if (!videoId || videoId === excludedId || seen.has(videoId)) {
      return false;
    }
    seen.add(videoId);
    return true;
  });
}

function sortSongs(songs, sortMode) {
  const next = [...songs];

  if (sortMode === 'title') {
    return next.sort((left, right) => left.title.localeCompare(right.title));
  }

  if (sortMode === 'artist') {
    return next.sort((left, right) => left.artist.localeCompare(right.artist));
  }

  if (sortMode === 'duration') {
    return next.sort((left, right) => (right.durationSeconds || 0) - (left.durationSeconds || 0));
  }

  return next;
}

function getOwnerName(user, playlist) {
  if (playlist?.artist?.name) {
    return playlist.artist.name;
  }

  return user?.displayName || user?.email?.split('@')[0] || 'Youfy';
}

function buildLibraryPlaylistView(playlist, ownerName) {
  const songs = Array.isArray(playlist?.songs) ? playlist.songs.filter((song) => song?.videoId) : [];
  const playlistThumbnails = Array.isArray(playlist?.thumbnails)
    ? playlist.thumbnails.filter((item) => item?.url)
    : [];
  const fallbackThumbnails = songs
    .slice(0, 4)
    .map((song) => ({ url: song.thumbnail }))
    .filter((item) => item?.url);

  return {
    id: playlist?.id || '',
    name: playlist?.name || 'Untitled Playlist',
    description: playlist?.description || '',
    privacy: playlist?.privacy || (playlist?.systemKey ? 'private' : 'public'),
    voting: playlist?.voting || 'off',
    thumbnails: playlistThumbnails.length > 0 ? playlistThumbnails : fallbackThumbnails,
    thumbnail: playlist?.thumbnail || '',
    songs,
    ownerName,
    trackCount: songs.length,
    totalTime: fmtTotalDuration(songs),
    year: getPlaylistYear(playlist?.createdAt),
    source: 'library',
    canEdit: !playlist?.systemKey,
    canDelete: !playlist?.systemKey,
    canAddSongs: true,
    systemKey: playlist?.systemKey || '',
  };
}

function buildRemotePlaylistView(playlist, songs) {
  return {
    id: playlist?.id || playlist?.playlistId || '',
    name: playlist?.name || 'Unknown Playlist',
    description: playlist?.description || '',
    privacy: playlist?.privacy || 'public',
    voting: 'off',
    thumbnails: Array.isArray(playlist?.thumbnails) ? playlist.thumbnails : [],
    songs,
    ownerName: playlist?.artist?.name || playlist?.author?.name || 'YouTube Music',
    trackCount: songs.length || playlist?.videoCount || 0,
    totalTime: fmtTotalDuration(songs),
    year: String(playlist?.year || ''),
    views: playlist?.views || playlist?.viewCount || '',
    source: 'youtube',
    canEdit: false,
    canDelete: false,
    canAddSongs: false,
    systemKey: '',
  };
}

function iconButtonClass(active = false) {
  return [
    'flex h-16 w-16 items-center justify-center rounded-full transition-transform hover:scale-[1.03]',
    active ? 'bg-white text-black' : 'bg-white/[0.1] text-white',
  ].join(' ');
}

function PlaylistTrackRow({ song, index, queue, canRemove = false, onRemove }) {
  const playSong = usePlayerStore((state) => state.playSong);
  const currentSong = usePlayerStore((state) => state.currentSong);
  const isPlaying = usePlayerStore((state) => state.isPlaying);

  const isActive = currentSong?.videoId === song.videoId;

  return (
    <div className={`group grid grid-cols-[32px_56px_minmax(0,1fr)_auto] items-center gap-4 rounded-[20px] px-3 py-3 transition-colors hover:bg-white/[0.05] ${isActive ? 'bg-white/[0.06]' : ''}`}>
      <button
        type="button"
        onClick={() => playSong(song, queue)}
        className="flex h-8 w-8 items-center justify-center rounded-full text-sm text-white/45 transition-colors hover:text-white"
        aria-label={`Play ${song.title}`}
      >
        {isActive && isPlaying ? (
          <div className="flex h-4 items-end gap-[3px]">
            {[0, 1, 2].map((bar) => (
              <span
                key={bar}
                className="block w-[3px] animate-pulse rounded-full bg-white"
                style={{ height: `${8 + bar * 3}px`, animationDelay: `${bar * 0.12}s` }}
              />
            ))}
          </div>
        ) : (
          <span>{index + 1}</span>
        )}
      </button>

      <button
        type="button"
        onClick={() => playSong(song, queue)}
        className="relative h-14 w-14 overflow-hidden rounded-2xl bg-white/5"
        aria-label={`Open ${song.title}`}
      >
        <img
          src={song.thumbnail || '/logo.svg'}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
          crossOrigin="anonymous"
          onError={(event) => {
            event.currentTarget.src = '/logo.svg';
          }}
        />
      </button>

      <button
        type="button"
        onClick={() => playSong(song, queue)}
        className="min-w-0 text-left"
      >
        <p className={`truncate text-lg font-semibold ${isActive ? 'text-white' : 'text-white/95'}`}>
          {song.title}
        </p>
        <p className="mt-1 truncate text-sm text-white/50">
          {song.artist}
          {song.album ? ` • ${song.album}` : ''}
        </p>
      </button>

      <div className="flex items-center gap-3">
        <span className="text-base tabular-nums text-white/55">{fmtSongDuration(song.durationSeconds)}</span>
        {canRemove ? (
          <button
            type="button"
            onClick={() => onRemove(song.videoId)}
            className="flex h-10 w-10 items-center justify-center rounded-full text-white/45 transition-colors hover:bg-white/[0.06] hover:text-white"
            aria-label={`Remove ${song.title}`}
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default function PlaylistPage() {
  const { playlistId = '' } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const playlists = usePlaylistStore((state) => state.playlists);
  const libraryPlaylist = playlists.find((playlist) => String(playlist?.id) === String(playlistId));
  const updatePlaylist = usePlaylistStore((state) => state.updatePlaylist);
  const deletePlaylist = usePlaylistStore((state) => state.deletePlaylist);
  const removeSong = usePlaylistStore((state) => state.removeSong);
  const createPlaylist = usePlaylistStore((state) => state.createPlaylist);
  const copySongsToPlaylist = usePlaylistStore((state) => state.copySongsToPlaylist);

  const playSong = usePlayerStore((state) => state.playSong);
  const togglePlay = usePlayerStore((state) => state.togglePlay);
  const setQueue = usePlayerStore((state) => state.setQueue);
  const currentSong = usePlayerStore((state) => state.currentSong);
  const currentQueue = usePlayerStore((state) => state.queue);
  const isPlaying = usePlayerStore((state) => state.isPlaying);

  const [remotePlaylist, setRemotePlaylist] = useState(null);
  const [remoteSongs, setRemoteSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sortMode, setSortMode] = useState('custom');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showAddSongs, setShowAddSongs] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [busyAction, setBusyAction] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!notice) return undefined;

    const timer = window.setTimeout(() => setNotice(''), 2600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    let cancelled = false;

    if (!playlistId) {
      setLoading(false);
      setError('Playlist not found.');
      return undefined;
    }

    if (libraryPlaylist) {
      setRemotePlaylist(null);
      setRemoteSongs([]);
      setLoading(false);
      setError('');
      return undefined;
    }

    setLoading(true);
    setError('');

    getPlaylistSongs(playlistId)
      .then((data) => {
        if (cancelled) return;

        if (!data) {
          setError('Playlist not found.');
          return;
        }

        const songs = Array.isArray(data.videos)
          ? data.videos.map(normalizeSong).filter((song) => song?.videoId)
          : [];

        setRemotePlaylist(data);
        setRemoteSongs(songs);
      })
      .catch(() => {
        if (!cancelled) {
          setError('Could not load playlist. Please try again.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [libraryPlaylist, playlistId]);

  const playlistView = useMemo(() => {
    if (libraryPlaylist) {
      return buildLibraryPlaylistView(libraryPlaylist, getOwnerName(user, libraryPlaylist));
    }

    if (remotePlaylist) {
      return buildRemotePlaylistView(remotePlaylist, remoteSongs);
    }

    return null;
  }, [libraryPlaylist, remotePlaylist, remoteSongs, user]);

  const songs = playlistView?.songs || [];
  const sortedSongs = useMemo(() => sortSongs(songs, sortMode), [songs, sortMode]);
  const isPlaylistActive = Boolean(
    currentSong?.videoId && songs.some((song) => song.videoId === currentSong.videoId)
  );

  const heroImage = useMemo(() => {
    const art = playlistView ? getPlaylistArtworkSources(playlistView, songs) : [];
    return art[0] || getBestThumbnail(playlistView?.thumbnails) || '';
  }, [playlistView, songs]);

  const metaLine = [
    'Playlist',
    playlistView?.privacy ? privacyLabel(playlistView.privacy) : '',
    playlistView?.year || '',
  ].filter(Boolean).join(' • ');

  const statsLine = [
    playlistView?.views || '',
    playlistView?.trackCount ? `${playlistView.trackCount} track${playlistView.trackCount === 1 ? '' : 's'}` : '',
    playlistView?.totalTime || '',
  ].filter(Boolean).join(' • ');

  const playVisibleSongs = (items) => {
    if (!items || items.length === 0) return;
    playSong(items[0], items.slice(1));
  };

  const handlePlay = () => {
    if (songs.length === 0) return;

    if (isPlaylistActive) {
      togglePlay();
      return;
    }

    playVisibleSongs(sortedSongs);
  };

  const handleShufflePlay = () => {
    if (songs.length === 0) {
      setNotice('No tracks to shuffle yet.');
      setShowActionMenu(false);
      return;
    }
    const shuffled = shuffleSongs(sortedSongs);
    playVisibleSongs(shuffled);
    setNotice('Shuffling this playlist.');
    setShowActionMenu(false);
  };

  const queuePlaylist = (mode) => {
    if (songs.length === 0) {
      setNotice('No tracks to queue yet.');
      setShowActionMenu(false);
      return;
    }

    const queueSongs = buildQueue(sortedSongs, currentSong?.videoId);

    if (!currentSong?.videoId) {
      playVisibleSongs(queueSongs);
      setNotice(mode === 'next' ? 'Playlist queued to start playing.' : 'Playlist added and started.');
      setShowActionMenu(false);
      return;
    }

    if (mode === 'next') {
      const merged = buildQueue([...queueSongs, ...currentQueue], currentSong.videoId);
      setQueue(merged);
      setNotice('Playlist will play next.');
    } else {
      const merged = buildQueue([...currentQueue, ...queueSongs], currentSong.videoId);
      setQueue(merged);
      setNotice('Playlist added to queue.');
    }

    setShowActionMenu(false);
  };

  const handleSaveToPlaylist = () => {
    if (songs.length === 0) {
      setNotice('No tracks to save yet.');
      setShowActionMenu(false);
      return;
    }

    setShowSaveModal(true);
    setShowActionMenu(false);
  };

  const handleShare = async () => {
    if (!playlistView) return;

    const url = `${window.location.origin}/playlist/${encodeURIComponent(playlistId)}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: playlistView.name,
          text: `${playlistView.name} on Youfy`,
          url,
        });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setNotice('Playlist link copied.');
      } else {
        setNotice(url);
      }
    } catch {
      setNotice('Could not share the playlist right now.');
    } finally {
      setShowActionMenu(false);
    }
  };

  const handleSaveDetails = async (updates) => {
    if (!playlistView?.id) return;

    setBusyAction('edit');
    const updated = await updatePlaylist(playlistView.id, updates);
    setBusyAction('');

    if (updated) {
      setShowEditModal(false);
      setNotice('Playlist updated.');
    } else {
      setNotice('Could not update playlist right now.');
    }
  };

  const handleSaveToExisting = async (targetPlaylistId) => {
    setBusyAction('save');
    const addedCount = await copySongsToPlaylist(targetPlaylistId, songs);
    setBusyAction('');

    setShowSaveModal(false);
    setShowActionMenu(false);

    if (addedCount > 0) {
      setNotice(`Saved ${addedCount} track${addedCount === 1 ? '' : 's'} to your playlist.`);
    } else {
      setNotice('That playlist already has every track.');
    }
  };

  const handleCreateAndSave = async (name) => {
    setBusyAction('save');
    const created = await createPlaylist(name);

    if (!created?.id) {
      setBusyAction('');
      setNotice('Could not create a playlist right now.');
      return;
    }

    const addedCount = await copySongsToPlaylist(created.id, songs);
    setBusyAction('');
    setShowSaveModal(false);
    setShowActionMenu(false);
    setNotice(
      addedCount > 0
        ? `Created "${created.name}" and saved ${addedCount} track${addedCount === 1 ? '' : 's'}.`
        : `Created "${created.name}".`
    );
  };

  const handleDeletePlaylist = async () => {
    if (!playlistView?.canDelete || !playlistView?.id) return;
    setShowDeleteConfirm(false);
    setShowActionMenu(false);

    setBusyAction('delete');
    await deletePlaylist(playlistView.id);
    setBusyAction('');
    navigate('/library');
  };

  const handleRemoveSong = async (videoId) => {
    if (!libraryPlaylist?.id || !videoId) return;
    await removeSong(libraryPlaylist.id, videoId);
    setNotice('Song removed from playlist.');
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl animate-pulse px-4 pb-32 pt-8 sm:px-6 lg:px-10">
        <div className="mx-auto h-10 w-32 rounded-full bg-white/5" />
        <div className="mx-auto mt-10 h-72 w-72 rounded-[40px] bg-white/5" />
        <div className="mx-auto mt-8 h-10 w-40 rounded-full bg-white/5" />
        <div className="mx-auto mt-5 h-6 w-64 rounded-full bg-white/5" />
        <div className="mx-auto mt-3 h-5 w-80 rounded-full bg-white/5" />
        <div className="mx-auto mt-10 h-24 w-full max-w-4xl rounded-[28px] bg-white/5" />
        <div className="mx-auto mt-6 max-w-5xl space-y-3">
          {Array.from({ length: 7 }).map((_, index) => (
            <div key={index} className="h-20 rounded-[24px] bg-white/5" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !playlistView) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm text-white/70 transition-colors hover:border-white/20 hover:text-white"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>

        <div className="mt-14 rounded-[28px] border border-red-400/20 bg-red-500/10 px-6 py-12 text-center text-sm text-red-200">
          {error || 'Playlist not found.'}
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-full overflow-hidden bg-black pb-32">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[540px] overflow-hidden">
        {heroImage ? (
          <img
            src={heroImage}
            alt=""
            className="h-full w-full scale-125 object-cover opacity-30 blur-[120px]"
            referrerPolicy="no-referrer"
            crossOrigin="anonymous"
          />
        ) : null}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.12),_transparent_55%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,8,8,0.25),rgba(0,0,0,0.84)_68%,#000)]" />
      </div>

      {(showActionMenu || showSortMenu) ? (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => {
            setShowActionMenu(false);
            setShowSortMenu(false);
          }}
          className="fixed inset-0 z-20 cursor-default bg-transparent"
        />
      ) : null}

      <div className="relative z-30 mx-auto max-w-6xl px-4 pt-6 sm:px-6 lg:px-10">
        {notice ? (
          <div className="pointer-events-none fixed right-4 top-4 z-50 rounded-full border border-white/10 bg-[#111111]/95 px-4 py-2 text-sm text-white shadow-lg backdrop-blur">
            {notice}
          </div>
        ) : null}

        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm font-medium text-white/75 backdrop-blur transition-colors hover:border-white/20 hover:text-white"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>

          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/45">
            {playlistView.source === 'library' ? 'Your Library' : 'YouTube Music Style'}
          </span>
        </div>

        <section className="mx-auto flex max-w-5xl flex-col items-center pb-8 pt-10 text-center">
          <PlaylistArtwork
            playlist={playlistView}
            songs={songs}
            className="h-72 w-72 rounded-[40px] shadow-[0_30px_90px_rgba(0,0,0,0.52)] sm:h-[320px] sm:w-[320px]"
          />

          <p className="mt-9 text-[11px] uppercase tracking-[0.28em] text-white/45">{metaLine}</p>
          <h1 className="mt-3 max-w-3xl text-5xl font-black tracking-tight text-white sm:text-6xl">
            {playlistView.name}
          </h1>

          <div className="mt-6 flex items-center gap-3 text-white/80">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/[0.06] text-sm font-semibold uppercase">
              {playlistView.ownerName.slice(0, 2)}
            </span>
            <span className="text-lg font-semibold tracking-wide">{playlistView.ownerName}</span>
          </div>

          {statsLine ? (
            <p className="mt-4 text-2xl font-medium text-white/72">{statsLine}</p>
          ) : null}

          {playlistView.description ? (
            <p className="mt-5 max-w-3xl text-lg leading-8 text-white/58">
              {playlistView.description}
            </p>
          ) : null}

          <div className="mt-10 flex items-center gap-5">
            {playlistView.canEdit ? (
              <button
                type="button"
                onClick={() => setShowEditModal(true)}
                className={iconButtonClass()}
                aria-label="Edit playlist"
              >
                <svg className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 3.487a2.1 2.1 0 113.03 2.909L8.5 18.056 4 19.5l1.444-4.5L16.862 3.487z" />
                </svg>
              </button>
            ) : null}

            <button
              type="button"
              onClick={handlePlay}
              className="flex h-24 w-24 items-center justify-center rounded-full bg-white text-black shadow-[0_18px_50px_rgba(255,255,255,0.14)] transition-transform hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-30"
              disabled={songs.length === 0}
              aria-label={isPlaylistActive && isPlaying ? 'Pause playlist' : 'Play playlist'}
            >
              {isPlaylistActive && isPlaying ? (
                <svg className="h-10 w-10" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
              ) : (
                <svg className="ml-1 h-10 w-10" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setShowActionMenu((current) => !current)}
                className={iconButtonClass()}
                aria-label="Playlist actions"
              >
                <svg className="h-7 w-7" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 8a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4z" />
                </svg>
              </button>

              <div
                className={`absolute right-0 top-[calc(100%+16px)] z-30 w-72 overflow-hidden rounded-[24px] border border-white/10 bg-[#222222]/98 py-2 shadow-[0_28px_80px_rgba(0,0,0,0.58)] backdrop-blur origin-top-right transition-all duration-250 ease-out ${
                  showActionMenu
                    ? 'pointer-events-auto translate-y-0 scale-100 opacity-100'
                    : 'pointer-events-none -translate-y-2 scale-95 opacity-0'
                }`}
              >
                  {[
                    { key: 'shuffle', label: 'Shuffle play', onClick: handleShufflePlay },
                    { key: 'next', label: 'Play next', onClick: () => queuePlaylist('next') },
                    { key: 'queue', label: 'Add to queue', onClick: () => queuePlaylist('queue') },
                    { key: 'save', label: 'Save to playlist', onClick: handleSaveToPlaylist },
                    { key: 'share', label: 'Share', onClick: handleShare },
                  ].map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={item.onClick}
                      className="flex w-full items-center justify-between px-5 py-4 text-left text-lg text-white/88 transition-colors hover:bg-white/[0.08]"
                    >
                      <span>{item.label}</span>
                    </button>
                  ))}

                  {playlistView.canDelete ? (
                    <>
                      <div className="mx-4 my-2 h-px bg-white/8" />
                      <button
                        type="button"
                        onClick={() => {
                          setShowDeleteConfirm(true);
                          setShowActionMenu(false);
                        }}
                        disabled={busyAction === 'delete'}
                        className="flex w-full items-center justify-between px-5 py-4 text-left text-lg text-red-300 transition-colors hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <span>{busyAction === 'delete' ? 'Deleting...' : 'Delete playlist'}</span>
                      </button>
                    </>
                  ) : null}
              </div>
            </div>
          </div>

        </section>

        <section className="mx-auto max-w-5xl rounded-[30px] border border-white/8 bg-white/[0.02] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.22)] sm:p-6">
          <div className="grid grid-cols-[auto_1fr_auto] items-center gap-4 border-b border-white/8 pb-5">
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowSortMenu((current) => !current)}
                className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-black/20 px-4 py-2.5 text-lg font-semibold text-white/88 transition-colors hover:border-white/20"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h10M4 18h7" />
                </svg>
                Sort
              </button>

              {showSortMenu ? (
                <div className="absolute left-0 top-[calc(100%+12px)] z-30 w-56 overflow-hidden rounded-[22px] border border-white/10 bg-[#1d1d1d]/98 py-2 shadow-[0_24px_70px_rgba(0,0,0,0.5)]">
                  {[
                    { id: 'custom', label: 'Playlist order' },
                    { id: 'title', label: 'Title' },
                    { id: 'artist', label: 'Artist' },
                    { id: 'duration', label: 'Duration' },
                  ].map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => {
                        setSortMode(option.id);
                        setShowSortMenu(false);
                      }}
                      className={`flex w-full items-center justify-between px-4 py-3 text-left text-base transition-colors ${
                        sortMode === option.id
                          ? 'bg-white/[0.08] text-white'
                          : 'text-white/78 hover:bg-white/[0.06]'
                      }`}
                    >
                      <span>{option.label}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="justify-self-center text-center text-sm text-white/45">
              {playlistView.trackCount} track{playlistView.trackCount === 1 ? '' : 's'}
            </div>

            {playlistView.canAddSongs ? (
              <button
                type="button"
                onClick={() => setShowAddSongs(true)}
                className="justify-self-end rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-white/80 transition-colors hover:border-white/20 hover:text-white"
              >
                Add songs
              </button>
            ) : null}
          </div>

          {sortedSongs.length > 0 ? (
            <div className="mt-4 space-y-1">
              {sortedSongs.map((song, index) => (
                <PlaylistTrackRow
                  key={song.videoId || `${song.title}-${index}`}
                  song={song}
                  index={index}
                  queue={sortedSongs.slice(index + 1)}
                  canRemove={playlistView.canEdit}
                  onRemove={handleRemoveSong}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-4 px-6 py-20 text-center">
              <div className="rounded-full border border-white/10 bg-white/[0.03] p-5">
                <svg className="h-9 w-9 text-white/35" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-2v11" />
                  <circle cx="6" cy="18" r="3" />
                  <circle cx="18" cy="16" r="3" />
                </svg>
              </div>
              <div>
                <p className="text-xl font-semibold text-white">No tracks here yet</p>
                <p className="mt-2 text-sm text-white/48">
                  {playlistView.canAddSongs
                    ? 'Add songs to start shaping this playlist.'
                    : 'This playlist does not have tracks available right now.'}
                </p>
              </div>
              {playlistView.canAddSongs ? (
                <button
                  type="button"
                  onClick={() => setShowAddSongs(true)}
                  className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-black"
                >
                  Add songs
                </button>
              ) : null}
            </div>
          )}
        </section>
      </div>

      {showEditModal ? (
        <PlaylistEditModal
          playlist={playlistView}
          saving={busyAction === 'edit'}
          onClose={() => setShowEditModal(false)}
          onSave={handleSaveDetails}
        />
      ) : null}

      {showSaveModal ? (
        <SavePlaylistModal
          sourcePlaylist={playlistView}
          playlists={playlists}
          saving={busyAction === 'save'}
          onClose={() => setShowSaveModal(false)}
          onSaveToPlaylist={handleSaveToExisting}
          onCreateAndSave={handleCreateAndSave}
        />
      ) : null}

      {showAddSongs && libraryPlaylist ? (
        <AddSongsModal
          playlist={libraryPlaylist}
          onClose={() => setShowAddSongs(false)}
        />
      ) : null}

      {showDeleteConfirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close delete confirmation"
            onClick={() => setShowDeleteConfirm(false)}
            className="absolute inset-0 bg-black/70"
          />

          <div className="relative z-10 w-full max-w-md rounded-3xl border border-white/10 bg-black/70 p-7 shadow-[0_30px_100px_rgba(0,0,0,0.7)] backdrop-blur">
            <h3 className="text-xl font-semibold text-white">Delete playlist?</h3>
            <p className="mt-3 text-sm text-white/65">
              Delete "{playlistView.name}" from your library. This action cannot be undone.
            </p>

            <div className="mt-7 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold text-white/80 transition-colors hover:border-white/30 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeletePlaylist}
                disabled={busyAction === 'delete'}
                className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busyAction === 'delete' ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
