import { isSystemLikedPlaylist } from '../../utils/playlists';
import ArtworkImage from '../ArtworkImage';
import { getArtworkSources, getBestThumbnail } from '../../utils/artwork';

export function getPlaylistArtworkSources(playlist, songs = []) {
  if (isSystemLikedPlaylist(playlist)) {
    return ['/liked-heart.png'];
  }

  const playlistImage = getBestThumbnail(playlist?.thumbnails) || playlist?.thumbnail || '';
  if (playlistImage) {
    return getArtworkSources(playlist, { fallback: playlistImage, size: 512 });
  }

  const songImages = songs
    .flatMap(song => getArtworkSources(song, { size: 512 }))
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
        <ArtworkImage
          src="/liked-heart.png"
          alt=""
          className={`h-full w-full object-cover ${imageClassName}`}
          loading="lazy"
          fallbackSrc="/liked-heart.png"
        />
      </div>
    );
  }

  const artworkSources = getPlaylistArtworkSources(playlist, songs);

  if (artworkSources.length <= 1) {
    const source = artworkSources[0] || '/logo.svg';
    return (
      <div className={`overflow-hidden bg-[#111111] ${className}`}>
        <ArtworkImage
          sources={artworkSources}
          src={source}
          alt=""
          className={`h-full w-full object-cover ${imageClassName}`}
          loading="lazy"
        />
      </div>
    );
  }

  return (
    <div className={`grid grid-cols-2 overflow-hidden bg-[#101010] ${className}`}>
      {Array.from({ length: 4 }).map((_, index) => {
        const source = artworkSources[index];

        return source ? (
          <ArtworkImage
            key={source + index}
            sources={[source]}
            src={source}
            alt=""
            className={`h-full w-full object-cover ${imageClassName}`}
            loading="lazy"
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
