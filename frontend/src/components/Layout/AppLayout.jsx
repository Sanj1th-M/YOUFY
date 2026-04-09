import { Outlet } from 'react-router-dom';
import Sidebar       from './Sidebar';
import BottomNavBar  from './BottomBar';
import MiniPlayer    from '../Player/MiniPlayer';
import DesktopPlayer from '../Player/DesktopPlayer';
import FullPlayer    from '../Player/FullPlayer';
import usePlayerStore from '../../store/usePlayerStore';

export default function AppLayout() {
  const currentSong    = usePlayerStore(s => s.currentSong);
  const showFullPlayer = usePlayerStore(s => s.showFullPlayer);

  return (
    <div className="flex h-screen w-full bg-black overflow-hidden">
      {/* Desktop sidebar — fixed left, hidden on mobile */}
      <Sidebar hasDesktopPlayer={!!currentSong} />

      {/* Main content area */}
      <main
        className={`
          flex-1 overflow-y-auto
          md:ml-64
          ${currentSong
            ? 'pb-36 md:pb-[110px]'   /* mobile: mini-player + bottom nav | desktop: player bar */
            : 'pb-16 md:pb-0'          /* mobile: bottom nav only | desktop: nothing */
          }
        `}
      >
        <Outlet />
      </main>

      {/* Mobile: floating mini-player */}
      {currentSong && <MiniPlayer />}

      {/* Desktop: full player bar */}
      {currentSong && <DesktopPlayer />}

      {/* Mobile: bottom navigation */}
      <BottomNavBar />

      {/* Full-screen player overlay (both platforms) */}
      {showFullPlayer && <FullPlayer />}
    </div>
  );
}
