import { useEffect, useState } from 'react';
import { motion, useAnimationControls, useReducedMotion } from 'framer-motion';
import usePlaylistStore from '../../store/usePlaylistStore';
import { isSystemLikedPlaylist } from '../../utils/playlists';

const HEART_PATH = 'M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z';

export default function AnimatedLikeButton({
  song,
  className = '',
  iconClassName = 'w-5 h-5',
  activeClassName = 'text-[#FCFFF9]',
  inactiveClassName = 'text-gray-400 hover:text-white',
  ariaLabel,
}) {
  const prefersReducedMotion = useReducedMotion();
  const controls = useAnimationControls();
  const playlists = usePlaylistStore((s) => s.playlists);
  const toggleLike = usePlaylistStore((s) => s.toggleLike);
  const likedInStore = Boolean(
    playlists
      .find(isSystemLikedPlaylist)
      ?.songs?.some((playlistSong) => playlistSong?.videoId === song?.videoId)
  );
  const [displayLiked, setDisplayLiked] = useState(likedInStore);

  useEffect(() => {
    setDisplayLiked(likedInStore);
    controls.set({ scale: 1 });
  }, [controls, likedInStore, song?.videoId]);

  const handleClick = async () => {
    if (!song?.videoId) return;

    const nextLiked = !displayLiked;
    setDisplayLiked(nextLiked);

    if (!prefersReducedMotion) {
      if (nextLiked) {
        controls.start({
          scale: [1, 1.3, 1],
          transition: {
            duration: 0.3,
            ease: 'easeInOut',
          },
        });
      } else {
        controls.set({ scale: 1 });
      }
    }

    await toggleLike(song);
  };

  return (
    <motion.button
      type="button"
      onClick={handleClick}
      whileTap={prefersReducedMotion ? undefined : { scale: 0.9 }}
      className={`${className} transition-colors ${displayLiked ? activeClassName : inactiveClassName}`.trim()}
      aria-label={ariaLabel || (displayLiked ? 'Unlike' : 'Like')}
    >
      <motion.svg
        className={iconClassName}
        viewBox="0 0 24 24"
        fill={displayLiked ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="2"
        animate={controls}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d={HEART_PATH} />
      </motion.svg>
    </motion.button>
  );
}
