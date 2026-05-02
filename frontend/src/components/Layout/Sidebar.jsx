import { NavLink } from 'react-router-dom';
import useAuthStore from '../../store/useAuthStore';

const navLinks = [
  { to: '/', label: 'Home', icon: HomeIcon },
  { to: '/search', label: 'Search', icon: SearchIcon },
  { to: '/library', label: 'Library', icon: LibraryIcon },
];

export default function Sidebar({
  hasDesktopPlayer = false,
  isExpanded = false,
  onToggleExpanded,
}) {
  const user = useAuthStore(s => s.user);
  const userName = user ? (user.displayName || user.email?.split('@')[0]) : 'Guest';
  const desktopWidthClass = isExpanded ? 'md:w-[240px]' : 'md:w-[84px]';

  return (
    <aside
      id="sidebar"
      className={`hidden md:flex md:flex-col md:fixed md:top-0 md:left-0
                  md:h-screen overflow-hidden ${desktopWidthClass}
                  ${hasDesktopPlayer ? 'md:pb-[90px]' : 'md:pb-0'} box-border bg-black z-30`}
      style={{ transition: 'width 0.2s ease' }}
    >
      {/* Brand */}
      <div className="px-3 pt-4 pb-4">
        <button
          type="button"
          onClick={onToggleExpanded}
          className={`flex w-full items-center rounded-xl text-left transition-colors duration-200 hover:bg-white/5
            ${isExpanded ? 'gap-3 px-3 py-2.5' : 'justify-center p-2.5'}`}
          aria-expanded={isExpanded}
          aria-label={isExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
          title={isExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#FCFFF9] text-black">
            <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 3v10.55A4 4 0 1014 17V7h4V3h-6z"/>
            </svg>
          </div>
          {isExpanded && (
            <span className="truncate text-xl font-bold tracking-tight text-white">Youfy</span>
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className="mt-2 flex flex-col gap-1 px-3">
        {navLinks.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            aria-label={label}
            title={!isExpanded ? label : undefined}
            className={({ isActive }) =>
              `flex items-center rounded-xl text-sm font-semibold transition-colors duration-200
               ${isExpanded ? 'gap-4 px-3 py-2.5 justify-start' : 'h-12 justify-center px-0'}
               ${isActive
                 ? 'bg-white/5 text-white'
                 : 'text-muted hover:bg-white/5 hover:text-white'
               }`
            }
          >
            <Icon />
            {isExpanded && <span className="truncate">{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Spacer */}
      <div className="flex-1" />

      {/* User profile at bottom */}
      <div className="px-3 pb-4">
        <NavLink
          to="/profile"
          aria-label={userName}
          title={!isExpanded ? userName : undefined}
          className={({ isActive }) =>
            `flex items-center rounded-xl text-sm font-medium transition-colors duration-200
             ${isExpanded ? 'gap-3 px-3 py-2.5 justify-start' : 'h-12 justify-center px-0'}
             ${isActive ? 'bg-white/5 text-white' : 'text-muted hover:bg-white/5 hover:text-white'}`
          }
        >
          <div className="w-7 h-7 bg-subtle rounded-full flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
            </svg>
          </div>
          {isExpanded && <span className="truncate">{userName}</span>}
        </NavLink>
      </div>
    </aside>
  );
}

/* ── Icon Components ── */
function HomeIcon() {
  return (
    <svg className="w-6 h-6 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
      <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
    </svg>
  );
}
function SearchIcon() {
  return (
    <svg className="w-6 h-6 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
    </svg>
  );
}
function LibraryIcon() {
  return (
    <svg className="w-6 h-6 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
      <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9V9h10v2zm-4 4H9v-2h6v2zm4-8H9V5h10v2z" />
    </svg>
  );
}
