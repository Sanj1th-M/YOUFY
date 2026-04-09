import { useState } from 'react';
import SongTile from '../SongTile';
import usePlayerStore from '../../store/usePlayerStore';
import { getAlbumSongs, getArtistSongs } from '../../services/api';

export default function SearchResultTile({ results }) {
  const playSong = usePlayerStore(s => s.playSong);

  const [activeTab, setActiveTab] = useState('all');
  const [loadingAlbumId, setLoadingAlbumId] = useState('');
  const [loadingArtistId, setLoadingArtistId] = useState('');
  const [selectedArtist, setSelectedArtist] = useState(null);
  const [artistSongs, setArtistSongs] = useState([]);

  if (!results) return null;

  const { songs = [], albums = [], artists = [], playlists = [] } = results;

  const normalizedSongs = songs
    .map(normalizeSong)
    .filter(s => s && s.videoId);

  const hasAnyResults = normalizedSongs.length || albums.length || artists.length || playlists.length;

  const tabs = [
    { id: 'all', label: 'All', show: true },
    { id: 'songs', label: 'Songs', show: normalizedSongs.length > 0 },
    { id: 'albums', label: 'Albums', show: albums.length > 0 },
    { id: 'artists', label: 'Artists', show: artists.length > 0 },
    { id: 'playlists', label: 'Playlists', show: playlists.length > 0 },
  ].filter(t => t.show);

  const safeActiveTab = tabs.some(t => t.id === activeTab) ? activeTab : 'all';

  async function onAlbumClick(album) {
    const browseId = album?.browseId || album?.audioPlaylistId || album?.albumId || album?.playlistId || '';
    if (!browseId) return;

    setLoadingAlbumId(browseId);
    try {
      const albumData = await getAlbumSongs(browseId);
      const rawSongs = Array.isArray(albumData?.songs) ? albumData.songs : [];
      const queue = rawSongs
        .map(normalizeSong)
        .filter(s => s && s.videoId);

      if (!queue.length) {
        window.alert('Could not load album');
        return;
      }
      playSong(queue[0], queue.slice(1));
    } catch {
      window.alert('Could not load album');
    } finally {
      setLoadingAlbumId('');
    }
  }

  async function onArtistClick(artist) {
    const artistId = artist?.artistId || artist?.browseId || '';
    if (!artistId) return;

    setLoadingArtistId(artistId);
    try {
      const artistData = await getArtistSongs(artistId);
      const rawSongs = Array.isArray(artistData?.topSongs) ? artistData.topSongs : [];
      const list = rawSongs
        .map(normalizeSong)
        .filter(s => s && s.videoId);

      if (!list.length) {
        window.alert('Could not load artist');
        return;
      }

      setSelectedArtist({
        id: artistId,
        name: artistData?.name || artist?.name || 'Artist',
        thumbnail: getBestThumbnail(artistData?.thumbnails || artist?.thumbnails) || '/logo-dark.png',
      });
      setArtistSongs(list);
    } catch {
      window.alert('Could not load artist');
    } finally {
      setLoadingArtistId('');
    }
  }

  if (!hasAnyResults) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-500">
        <svg className="w-14 h-14" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
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
        <div className="flex items-center gap-6 overflow-x-auto no-scrollbar border-b border-white/10 pb-2">
          {tabs.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={[
                'text-sm font-semibold whitespace-nowrap transition-colors',
                safeActiveTab === t.id ? 'text-white border-b-2 border-white pb-2 -mb-2' : 'text-gray-400 hover:text-gray-200',
              ].join(' ')}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Songs */}
      {(safeActiveTab === 'all' || safeActiveTab === 'songs') && normalizedSongs.length > 0 && (
        <section>
          <h2 className="text-white font-bold text-lg mb-3">Songs</h2>
          <div className="space-y-1">
            {normalizedSongs.map((song, i) => (
              <SongTile key={song.videoId || i} song={song} queue={normalizedSongs} />
            ))}
          </div>
        </section>
      )}

      {/* Artists */}
      {(safeActiveTab === 'all' || safeActiveTab === 'artists') && artists.length > 0 && (
        <section>
          <h2 className="text-white font-bold text-lg mb-3">Artists</h2>
          <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
            {artists.slice(0, 12).map((a, i) => {
              const id = a?.artistId || a?.browseId || '';
              const isLoading = id && loadingArtistId === id;
              const isClickable = Boolean(id) && !isLoading;
              const isSelected = Boolean(id) && selectedArtist?.id === id;

              return (
                <button
                  key={id || i}
                  type="button"
                  disabled={!isClickable}
                  onClick={() => onArtistClick(a)}
                  className={[
                    'flex flex-col items-center gap-2 flex-shrink-0 w-24 text-left',
                    isClickable ? 'cursor-pointer' : 'cursor-not-allowed opacity-60',
                    isSelected ? 'opacity-100' : '',
                  ].join(' ')}
                >
                  <div className="relative w-20 h-20">
                    <img
                      src={getBestThumbnail(a?.thumbnails) || '/logo-dark.png'}
                      alt={a?.name || 'Artist'}
                      className="w-20 h-20 rounded-full object-cover"
                      onError={e => { e.target.src = '/logo-dark.png'; }}
                    />
                    {isLoading && (
                      <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
                        <div className="w-5 h-5 border-2 border-white/60 border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-gray-300 text-center truncate w-full">{a?.name || 'Unknown'}</p>
                </button>
              );
            })}
          </div>

          {selectedArtist && artistSongs.length > 0 && (
            <div className="mt-5 bg-elevated/60 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <img
                  src={selectedArtist.thumbnail || '/logo-dark.png'}
                  alt={selectedArtist.name}
                  className="w-14 h-14 rounded-full object-cover"
                  onError={e => { e.target.src = '/logo-dark.png'; }}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-white font-bold truncate">{selectedArtist.name}</p>
                  <p className="text-xs text-gray-400 truncate">{artistSongs.length} songs</p>
                </div>
                <button
                  type="button"
                  className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-sm font-semibold"
                  onClick={() => playSong(artistSongs[0], artistSongs.slice(1))}
                >
                  Play
                </button>
              </div>

              <div className="mt-3 space-y-1">
                {artistSongs.map((song, i) => (
                  <SongTile key={song.videoId || i} song={song} queue={artistSongs} />
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Albums */}
      {(safeActiveTab === 'all' || safeActiveTab === 'albums') && albums.length > 0 && (
        <section>
          <h2 className="text-white font-bold text-lg mb-3">Albums</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {albums.slice(0, 15).map((album, i) => {
              const id = album?.browseId || album?.audioPlaylistId || album?.albumId || album?.playlistId || '';
              const isLoading = id && loadingAlbumId === id;
              const isClickable = Boolean(id) && !isLoading;

              return (
                <button
                  key={id || i}
                  type="button"
                  disabled={!isClickable}
                  onClick={() => onAlbumClick(album)}
                  className={[
                    'bg-elevated rounded-lg p-3 transition-colors text-left',
                    isClickable ? 'hover:bg-subtle cursor-pointer' : 'opacity-60 cursor-not-allowed',
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
                      <div className="absolute inset-0 rounded bg-black/50 flex items-center justify-center">
                        <div className="w-6 h-6 border-2 border-white/60 border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                  </div>
                  <p className="text-white text-sm font-medium truncate">{album?.name || 'Unknown'}</p>
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
      {(safeActiveTab === 'all' || safeActiveTab === 'playlists') && playlists.length > 0 && (
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
                <p className="text-white text-sm font-medium truncate">{p?.name || 'Unknown'}</p>
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
