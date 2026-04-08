import { NavLink } from 'react-router-dom';
import useAuthStore from '../../store/useAuthStore';

const links = [
  { to: '/', label: 'Home', icon: HomeIcon },
  { to: '/search', label: 'Search', icon: SearchIcon },
  { to: '/library', label: 'Library', icon: LibraryIcon },
];

export default function Sidebar() {
  const user = useAuthStore(s => s.user);

  return (
    <aside className="hidden md:flex flex-col w-56 lg:w-64 bg-black flex-shrink-0 p-4 gap-2">
      {/* Logo */}
      <div className="flex items-center gap-2 px-2 py-4 mb-2">
        <img src="/logo-dark.png" alt="Youfy" className="w-8 h-8 object-contain" />
        <span className="text-white font-bold text-xl tracking-tight">Youfy</span>
      </div>

      {/* Nav links */}
      <nav className="flex flex-col gap-1">
        {links.map(({ to, label, Icon = () => null, icon: Icon2 }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
               ${isActive ? 'bg-subtle text-white' : 'text-gray-400 hover:text-white hover:bg-subtle/50'}`
            }
          >
            <Icon2 />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Profile link at bottom */}
      <div className="mt-auto">
        <NavLink
          to="/profile"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
             ${isActive ? 'bg-subtle text-white' : 'text-gray-400 hover:text-white hover:bg-subtle/50'}`
          }
        >
          <ProfileIcon />
          {user ? (user.displayName || user.email?.split('@')[0]) : 'Profile'}
        </NavLink>
      </div>
    </aside>
  );
}

function HomeIcon() {
  return (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
    </svg>
  );
}
function SearchIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
    </svg>
  );
}
function LibraryIcon() {
  return (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9V9h10v2zm-4 4H9v-2h6v2zm4-8H9V5h10v2z" />
    </svg>
  );
}
function ProfileIcon() {
  return (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
    </svg>
  );
}
