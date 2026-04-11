import { useState } from 'react';
import SongTile from '../SongTile';
import usePlayerStore from '../../store/usePlayerStore';
import { getArtistSongs } from '../../services/api';

export default function SearchResultTile({ results }) {
  const playSong = usePlayerStore(s => s.playSong);

  const [activeTab,       setActiveTab]       = useState('all');
  const [loadingAlbumId,  setLoadingAlbumId]  = useState('');
  const [loadingArtistId, setLoadingArtistId] = useState('');

  // Artist page state
  const [artistPage,      setArtistPage]      = useState(null); // null = not viewing artist
  // artistPage shape when set:
  // { name, thumbnail, topSongs: [...], albums: [...], singles: [...] }

  if (!results) return null;

  const { songs = [], albums = [], artists = [], playlists = [] } = results;

  const normalizedSongs = songs
    .map(normalizeSong)
    .filter(s => s && s.videoId);

  const hasAnyResults =
    normalizedSongs.length || albums.length || artists.length || playlists.length;

  const tabs = [
    { id: 'all',       label: 'All',       show: true },
    { id: 'songs',     label: 'Songs',     show: normalizedSongs.length > 0 },
    { id: 'albums',    label: 'Albums',    show: albums.length > 0 },
    { id: 'artists',   label: 'Artists',   show: artists.length > 0 },
    { id: 'playlists', label: 'Playlists', show: playlists.length > 0 },
  ].filter(t => t.show);

  const safeActiveTab = tabs.some(t => t.id === activeTab) ? activeTab : 'all';

  // ── Album click — unchanged, was working ──────────────────
  async function onAlbumClick(album) {
    const { getAlbumSongs } = await import('../../services/api');
    const browseId =
      album?.browseId ||
      album?.audioPlaylistId ||
      album?.albumId ||
      album?.playlistId || '';
    if (!browseId) return;

    setLoadingAlbumId(browseId);
    try {
      const albumData = await getAlbumSongs(browseId);
      const rawSongs  = Array.isArray(albumData?.songs) ? albumData.songs : [];
      const queue     = rawSongs.map(normalizeSong).filter(s => s && s.videoId);
      if (!queue.length) { window.alert('Could not load album songs.'); return; }
      playSong(queue[0], queue.slice(1));
    } catch {
      window.alert('Could not load album.');
    } finally {
      setLoadingAlbumId('');
    }
  }

  // ── Artist click — THE FIX ────────────────────────────────
  // Problem was: artistData?.topSongs → does not exist in ytmusic-api
  // Fix: ytmusic-api getArtist() returns { songs: { content: [...] }, albums: { content: [...] }, singles: { content: [...] } }
  async function onArtistClick(artist) {
    const artistId = artist?.artistId || artist?.browseId || '';
    if (!artistId) return;

    setLoadingArtistId(artistId);
    try {
      // getArtistSongs calls GET /search/artist/:artistId
      // which calls ytmusic-api client.getArtist(artistId)
      const data = await getArtistSongs(artistId);

      // ── CORRECT field access for ytmusic-api getArtist() response ──
      // data.songs.content  → top songs array
      // data.albums.content → albums array
      // data.singles.content → singles array
      const rawTopSongs = data?.songs?.content     || [];
      const rawAlbums   = data?.albums?.content    || [];
      const rawSingles  = data?.singles?.content   || [];

      const topSongs = rawTopSongs
        .map(s => normalizeSong(s))
        .filter(s => s && s.videoId);

      setArtistPage({
        name:      data?.name      || artist?.name || 'Artist',
        thumbnail: getBestThumbnail(data?.thumbnails || artist?.thumbnails) || '/logo-dark.png',
        topSongs,
        albums:    rawAlbums,
        singles:   rawSingles,
        description: data?.description || '',
      });

    } catch (err) {
      console.error('[artist] fetch failed:', err.message);
      window.alert('Could not load artist page. Try again.');
    } finally {
      setLoadingArtistId('');
    }
  }

  // ── Artist page view ──────────────────────────────────────
  if (artistPage) {
    return (
      <div className="pb-8">
        {/* Back button */}
        <button
          onClick={() => setArtistPage(null)}
          className="flex items-center gap-2 text-gray-400 hover:text-white
                     transition-colors mb-6 text-sm"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor"
               strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" d="M19 12H5m7 7-7-7 7-7"/>
          </svg>
          Back to results
        </button>

        {/* Artist header */}
        <div className="flex items-center gap-5 mb-8">
          <img
            src={artistPage.thumbnail}
            alt={artistPage.name}
            className="w-24 h-24 rounded-full object-cover flex-shrink-0 shadow-lg"
            onError={e => { e.target.src = '/logo-dark.png'; }}
          />
          <div className="min-w-0">
            <h1 className="text-white text-2xl font-bold truncate">{artistPage.name}</h1>
            {artistPage.description && (
              <p className="text-gray-400 text-sm mt-1 line-clamp-2">
                {artistPage.description}
              </p>
            )}
            {artistPage.topSongs.length > 0 && (
              <button
                onClick={() => playSong(artistPage.topSongs[0], artistPage.topSongs.slice(1))}
                className="mt-3 flex items-center gap-2 bg-primary text-black
                           font-bold text-sm px-5 py-2 rounded-full
                           hover:scale-105 transition-transform"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
                Play Top Songs
              </button>
            )}
          </div>
        </div>

        {/* Top Songs */}
        {artistPage.topSongs.length > 0 && (
          <section className="mb-8">
            <h2 className="text-white font-bold text-lg mb-3">Top Songs</h2>
            <div className="space-y-1">
              {artistPage.topSongs.slice(0, 10).map((song, i) => (
                <SongTile
                  key={song.videoId || i}
                  song={song}
                  queue={artistPage.topSongs.slice(i + 1)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Albums */}
        {artistPage.albums.length > 0 && (
          <section className="mb-8">
            <h2 className="text-white font-bold text-lg mb-3">Albums</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {artistPage.albums.map((album, i) => (
                <div key={album?.browseId || i}
                  className="bg-elevated rounded-xl p-3 hover:bg-subtle transition-colors">
                  <img
                    src={getBestThumbnail(album?.thumbnails) || '/logo-dark.png'}
                    alt={album?.name || 'Album'}
                    className="w-full aspect-square object-cover rounded-lg mb-2"
                    onError={e => { e.target.src = '/logo-dark.png'; }}
                  />
                  <p className="text-white text-sm font-medium truncate">
                    {album?.name || 'Unknown'}
                  </p>
                  {album?.year && (
                    <p className="text-gray-400 text-xs mt-0.5">{album.year}</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Singles */}
        {artistPage.singles.length > 0 && (
          <section className="mb-8">
            <h2 className="text-white font-bold text-lg mb-3">Singles</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {artistPage.singles.map((single, i) => (
                <div key={single?.browseId || i}
                  className="bg-elevated rounded-xl p-3 hover:bg-subtle transition-colors">
                  <img
                    src={getBestThumbnail(single?.thumbnails) || '/logo-dark.png'}
                    alt={single?.name || 'Single'}
                    className="w-full aspect-square object-cover rounded-lg mb-2"
                    onError={e => { e.target.src = '/logo-dark.png'; }}
                  />
                  <p className="text-white text-sm font-medium truncate">
                    {single?.name || 'Unknown'}
                  </p>
                  {single?.year && (
                    <p className="text-gray-400 text-xs mt-0.5">{single.year}</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Empty */}
        {!artistPage.topSongs.length && !artistPage.albums.length && !artistPage.singles.length && (
          <div className="flex flex-col items-center py-16 gap-3 text-gray-500">
            <p className="text-sm">No content found for this artist</p>
          </div>
        )}
      </div>
    );
  }

  // ── Search results view ───────────────────────────────────
  if (!hasAnyResults) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-500">
        <svg className="w-14 h-14" fill="none" stroke="currentColor"
             strokeWidth="1.5" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <p>No results found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tabs */}
      {tabs.length > 1 && (
        <div className="flex items-center gap-6 overflow-x-auto no-scrollbar
                        border-b border-white/10 pb-2">
          {tabs.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={[
                'text-sm font-semibold whitespace-nowrap transition-colors',
                safeActiveTab === t.id
                  ? 'text-white border-b-2 border-white pb-2 -mb-2'
                  : 'text-gray-400 hover:text-gray-200',
              ].join(' ')}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Songs */}
      {(safeActiveTab === 'all' || safeActiveTab === 'songs') &&
        normalizedSongs.length > 0 && (
        <section>
          <h2 className="text-white font-bold text-lg mb-3">Songs</h2>
          <div className="space-y-1">
            {normalizedSongs.map((song, i) => (
              <SongTile key={song.videoId || i} song={song} queue={normalizedSongs} />
            ))}
          </div>
        </section>
      )}

      {/* Artists — clickable, opens full artist page */}
      {(safeActiveTab === 'all' || safeActiveTab === 'artists') &&
        artists.length > 0 && (
        <section>
          <h2 className="text-white font-bold text-lg mb-3">Artists</h2>
          <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
            {artists.slice(0, 12).map((a, i) => {
              const id        = a?.artistId || a?.browseId || '';
              const isLoading = id && loadingArtistId === id;
              const hasId     = Boolean(id);

              return (
                <button
                  key={id || i}
                  type="button"
                  disabled={!hasId || isLoading}
                  onClick={() => hasId && !isLoading && onArtistClick(a)}
                  className={[
                    'flex flex-col items-center gap-2 flex-shrink-0 w-24 text-left',
                    hasId && !isLoading
                      ? 'cursor-pointer'
                      : 'cursor-not-allowed opacity-60',
                  ].join(' ')}
                >
                  <div className="relative w-20 h-20">
                    <img
                      src={getBestThumbnail(a?.thumbnails) || '/logo-dark.png'}
                      alt={a?.name || 'Artist'}
                      className="w-20 h-20 rounded-full object-cover
                                 ring-2 ring-transparent hover:ring-primary transition-all"
                      onError={e => { e.target.src = '/logo-dark.png'; }}
                    />
                    {isLoading && (
                      <div className="absolute inset-0 rounded-full bg-black/50
                                      flex items-center justify-center">
                        <div className="w-5 h-5 border-2 border-white/60
                                        border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-gray-300 text-center truncate w-full">
                    {a?.name || 'Unknown'}
                  </p>
                  {hasId && !isLoading && (
                    <p className="text-xs text-primary -mt-1">View</p>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Albums */}
      {(safeActiveTab === 'all' || safeActiveTab === 'albums') &&
        albums.length > 0 && (
        <section>
          <h2 className="text-white font-bold text-lg mb-3">Albums</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {albums.slice(0, 15).map((album, i) => {
              const id        = album?.browseId || album?.audioPlaylistId ||
                                album?.albumId  || album?.playlistId || '';
              const isLoading = id && loadingAlbumId === id;
              const hasId     = Boolean(id);

              return (
                <button
                  key={id || i}
                  type="button"
                  disabled={!hasId || isLoading}
                  onClick={() => hasId && !isLoading && onAlbumClick(album)}
                  className={[
                    'bg-elevated rounded-lg p-3 transition-colors text-left',
                    hasId && !isLoading
                      ? 'hover:bg-subtle cursor-pointer'
                      : 'opacity-60 cursor-not-allowed',
                  ].join(' ')}
                >
                  <div className="relative">
                    <img
                      src={getBestThumbnail(album?.thumbnails) || '/logo-dark.png'}
                      alt={album?.name || 'Album'}
                      className="w-full aspect-square object-cover rounded mb-2"
                      onError={e => { e.target.src = '/logo-dark.png'; }}
                    />
                    {isLoading && (
                      <div className="absolute inset-0 rounded bg-black/50
                                      flex items-center justify-center">
                        <div className="w-6 h-6 border-2 border-white/60
                                        border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                  </div>
                  <p className="text-white text-sm font-medium truncate">
                    {album?.name || 'Unknown'}
                  </p>
                  <p className="text-gray-400 text-xs truncate">
                    {album?.artist?.name || 'Unknown'}
                    {album?.year ? ` • ${album.year}` : ''}
                  </p>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Playlists */}
      {(safeActiveTab === 'all' || safeActiveTab === 'playlists') &&
        playlists.length > 0 && (
        <section>
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="text-white font-bold text-lg">Playlists</h2>
            <span className="text-xs text-gray-500">Coming soon</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {playlists.slice(0, 15).map((p, i) => (
              <div key={p?.playlistId || i} className="bg-elevated rounded-lg p-3 opacity-90">
                <img
                  src={getBestThumbnail(p?.thumbnails) || '/logo-dark.png'}
                  alt={p?.name || 'Playlist'}
                  className="w-full aspect-square object-cover rounded mb-2"
                  onError={e => { e.target.src = '/logo-dark.png'; }}
                />
                <p className="text-white text-sm font-medium truncate">
                  {p?.name || 'Unknown'}
                </p>
                <p className="text-gray-400 text-xs truncate">
                  {p?.author?.name || p?.artist?.name || ''}
                  {typeof p?.trackCount === 'number' ? ` • ${p.trackCount} songs` : ''}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────

function getBestThumbnail(thumbnails, fallback = '') {
  if (!thumbnails || !thumbnails.length) return fallback;
  const url = thumbnails[thumbnails.length - 1]?.url || fallback;
  if (!url) return fallback;
  return url
    .replace(/=w\d+-h\d+(-[^&]+)?/, '=w1280-h1280')
    .replace(/=s\d+/, '=s1280');
}

function normalizeSong(s) {
  if (!s) return null;
  return {
    videoId:         s.videoId || '',
    title:           s.name || s.title || 'Unknown',
    artist:          s.artist?.name
                  || s.artists?.[0]?.name
                  || s.author?.name
                  || 'Unknown',
    thumbnail:       getBestThumbnail(s.thumbnails) || s.thumbnail || '',
    durationSeconds: s.duration || s.durationSeconds || 0,
    album:           s.album?.name || s.album || '',
  };
      }
