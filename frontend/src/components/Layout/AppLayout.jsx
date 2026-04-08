import { Outlet } from 'react-router-dom';
import Sidebar   from './Sidebar';
import BottomBar from './BottomBar';
import MiniPlayer from '../Player/MiniPlayer';
import FullPlayer from '../Player/FullPlayer';
import usePlayerStore from '../../store/usePlayerStore';

export default function AppLayout() {
  const currentSong    = usePlayerStore(s => s.currentSong);
  const showFullPlayer = usePlayerStore(s => s.showFullPlayer);

  return (
    <div className="flex h-screen bg-surface overflow-hidden">
      {/* Desktop sidebar */}
      <Sidebar />

      {/* Main content area */}
      <div className="flex flex-col flex-1 min-w-0">
        <main className={`flex-1 overflow-y-auto ${currentSong ? 'pb-24 md:pb-28' : 'pb-16 md:pb-0'}`}>
          <Outlet />
        </main>

        {/* Mini player */}
        {currentSong && <MiniPlayer />}
      </div>

      {/* Mobile bottom nav */}
      <BottomBar />

      {/* Full screen player overlay */}
      {showFullPlayer && <FullPlayer />}
    </div>
  );
}
