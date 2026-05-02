import { useNavigate } from 'react-router-dom';
import useAuthStore from '../store/useAuthStore';

export default function Profile() {
  const user = useAuthStore(s => s.user);
  const logout = useAuthStore(s => s.logout);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const initial = (user?.displayName || user?.email || 'U')[0].toUpperCase();

  return (
    <div className="px-4 md:px-6 lg:px-8 py-6 max-w-lg mx-auto">
      <h1 className="text-white text-2xl font-bold mb-8">Profile</h1>

      {/* Avatar + info */}
      <div className="flex items-center gap-5 bg-elevated rounded-2xl p-6 mb-6">
        <div className="w-16 h-16 rounded-full bg-[#FCFFF9] flex items-center justify-center
                        text-black font-bold text-2xl flex-shrink-0">
          {initial}
        </div>
        <div className="min-w-0">
          <p className="text-white font-semibold text-lg truncate">
            {user?.displayName || 'Youfy User'}
          </p>
          <p className="text-gray-400 text-sm truncate">{user?.email}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {[
          { label: 'Recently Played', value: JSON.parse(localStorage.getItem('recentSongs') || '[]').length },
          { label: 'Account Type', value: 'Free' },
        ].map(({ label, value }) => (
          <div key={label} className="bg-elevated rounded-xl p-4">
            <p className="text-gray-400 text-xs mb-1">{label}</p>
            <p className="text-white font-bold text-xl">{value}</p>
          </div>
        ))}
      </div>

      {/* Info section */}
      <div className="bg-elevated rounded-xl p-5 mb-6 space-y-3">
        <h2 className="text-white font-semibold">About Youfy</h2>
        <p className="text-gray-400 text-sm leading-relaxed">
          Youfy streams music ad-free using YouTube Music as its source.
          Audio is extracted as a raw stream — no YouTube player, no ads.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          {['Ad-Free', 'Free Forever', 'YouTube Music Source', 'Synced Lyrics'].map(tag => (
            <span key={tag} className="bg-subtle text-[#FCFFF9] text-xs px-3 py-1 rounded-full">
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Logout */}
      <button
        onClick={handleLogout}
        className="w-full border border-red-500/50 text-red-400 hover:bg-red-500/10
                   py-3 rounded-xl font-medium text-sm transition-colors"
      >
        Log Out
      </button>
    </div>
  );
}
