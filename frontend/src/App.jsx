import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import AppLayout from './components/Layout/AppLayout';
import Home from './pages/Home';
import Search from './pages/Search';
import Library from './pages/Library';
import Profile from './pages/Profile';
import ImportPlaylist from './pages/ImportPlaylist';
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
  }, [user, loading, initPlaylists]);

  if (loading) {
    return (
      <div className="youfy-loader-screen">
        <div className="youfy-eq" aria-hidden="true">
          <span className="youfy-eq-bar bg-white" />
          <span className="youfy-eq-bar bg-white" />
          <span className="youfy-eq-bar bg-white" />
          <span className="youfy-eq-bar bg-white" />
        </div>

        <p className="youfy-loader-copy" role="status" aria-live="polite">
          Loading your music...
        </p>
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
        <Route path="/import-playlist" element={
          <ProtectedRoute><ImportPlaylist /></ProtectedRoute>
        } />
        <Route path="/profile" element={
          <ProtectedRoute><Profile /></ProtectedRoute>
        } />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
