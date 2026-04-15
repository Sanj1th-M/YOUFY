import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import AppLayout from './components/Layout/AppLayout';
import Home from './pages/Home';
import Search from './pages/Search';
import Library from './pages/Library';
import Profile from './pages/Profile';
import AlbumPage from './pages/AlbumPage';
import PlaylistPage from './pages/PlaylistPage';
import Login from './components/Auth/Login';
import Register from './components/Auth/Register';
import useAuthStore from './store/useAuthStore';
import usePlaylistStore from './store/usePlaylistStore';

function ProtectedRoute({ children }) {
  const user = useAuthStore(s => s.user);
  const loading = useAuthStore(s => s.loading);
  if (loading) return null;
  return user ? children : <Navigate to="/login" replace />;
}

export default function App() {
  const user = useAuthStore(s => s.user);
  const loading = useAuthStore(s => s.loading);
  const initPlaylists = usePlaylistStore(s => s.init);

  useEffect(() => {
    if (!loading) initPlaylists(user);
  }, [user, loading]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-surface">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full border-4 border-primary border-t-transparent animate-spin" />
          <p className="text-gray-400 text-sm">Loading Youfy...</p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route element={<AppLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/search" element={<Search />} />
        <Route path="/album/:browseId" element={<AlbumPage />} />
        <Route path="/playlist/:playlistId" element={<PlaylistPage />} />
        <Route path="/library" element={<Library />} />
        <Route path="/profile" element={
          <ProtectedRoute><Profile /></ProtectedRoute>
        } />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
