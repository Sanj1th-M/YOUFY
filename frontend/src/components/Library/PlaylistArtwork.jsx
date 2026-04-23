import { isSystemLikedPlaylist } from '../../utils/playlists';

function getBestThumbnail(thumbnails, fallback = '') {
  if (!Array.isArray(thumbnails) || thumbnails.length === 0) return fallback;
  return thumbnails[thumbnails.length - 1]?.url || fallback;
}

export function getPlaylistArtworkSources(playlist, songs = []) {
  if (isSystemLikedPlaylist(playlist)) {
    return ['/liked-heart.png'];
  }

  const playlistImage = getBestThumbnail(playlist?.thumbnails) || playlist?.thumbnail || '';
  if (playlistImage) {
    return [playlistImage];
  }

  const songImages = songs
    .map(song => song?.thumbnail || '')
    .filter(Boolean);

  if (songImages.length > 0) {
    return songImages.slice(0, 4);
  }

  return [];
}

export default function PlaylistArtwork({
  playlist,
  songs = [],
  className = '',
  imageClassName = '',
}) {
  const isLikedSongs = isSystemLikedPlaylist(playlist);

  if (isLikedSongs) {
    return (
      <div className={`overflow-hidden bg-[#101010] ${className}`}>
        <img
          src="/liked-heart.png"
          alt=""
          className={`h-full w-full object-cover ${imageClassName}`}
          loading="lazy"
        />
      </div>
    );
  }

  const artworkSources = getPlaylistArtworkSources(playlist, songs);

  if (artworkSources.length <= 1) {
    const source = artworkSources[0] || '/logo-dark.png';
    return (
      <div className={`overflow-hidden bg-[#111111] ${className}`}>
        <img
          src={source}
          alt=""
          className={`h-full w-full object-cover ${imageClassName}`}
          loading="lazy"
          referrerPolicy="no-referrer"
          crossOrigin="anonymous"
          onError={(event) => {
            event.currentTarget.src = '/logo-dark.png';
          }}
        />
      </div>
    );
  }

  return (
    <div className={`grid grid-cols-2 overflow-hidden bg-[#101010] ${className}`}>
      {Array.from({ length: 4 }).map((_, index) => {
        const source = artworkSources[index];

        return source ? (
          <img
            key={source + index}
            src={source}
            alt=""
            className={`h-full w-full object-cover ${imageClassName}`}
            loading="lazy"
            referrerPolicy="no-referrer"
            crossOrigin="anonymous"
            onError={(event) => {
              event.currentTarget.src = '/logo-dark.png';
            }}
          />
        ) : (
          <div
            key={`placeholder-${index}`}
            className="h-full w-full bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.16),_transparent_58%),linear-gradient(145deg,_rgba(255,255,255,0.08),_rgba(255,255,255,0.02))]"
          />
        );
      })}
    </div>
  );
}
