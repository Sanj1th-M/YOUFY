import { NavLink } from 'react-router-dom';

const links = [
  { to: '/',        label: 'Home',    Icon: HomeIcon },
  { to: '/search',  label: 'Search',  Icon: SearchIcon },
  { to: '/library', label: 'Library', Icon: LibraryIcon },
  { to: '/profile', label: 'Profile', Icon: ProfileIcon },
];

export default function BottomBar() {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-black border-t border-subtle z-40 flex">
      {links.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center justify-center py-2 gap-1 text-xs transition-colors
             ${isActive ? 'text-primary' : 'text-gray-500'}`
          }
        >
          <Icon />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

function HomeIcon() {
  return <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>;
}
function SearchIcon() {
  return <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>;
}
function LibraryIcon() {
  return <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9V9h10v2zm-4 4H9v-2h6v2zm4-8H9V5h10v2z"/></svg>;
}
function ProfileIcon() {
  return <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>;
}
