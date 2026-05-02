import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  confirmPlaylistImport,
  getImportSourcePlaylists,
  getPlaylistImportConfig,
  getPlaylistImportJob,
  getPlaylistImportSources,
  previewPlaylistImport,
  startPlaylistImportOAuth,
} from '../services/api';
import usePlaylistStore from '../store/usePlaylistStore';

const OAUTH_EVENT = 'youfy.playlistImport.oauth';

function formatDuration(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  if (!total) return '--';
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function statusTone(status) {
  if (status === 'matched') return 'text-[#FCFFF9]';
  if (status === 'unmatched') return 'text-amber-400';
  return 'text-gray-400';
}

function getImportErrorMessage(requestError, fallback) {
  const backendMessage = requestError?.response?.data?.error;
  if (typeof backendMessage !== 'string' || !backendMessage.trim()) {
    if (requestError?.code === 'ECONNABORTED') {
      return 'Playlist import backend timed out. Check backend health and Firebase/Firestore connectivity.';
    }

    if (requestError?.code === 'ERR_NETWORK') {
      return 'Playlist import backend is unreachable. Check that the backend is running.';
    }

    return fallback;
  }

  // Hide backend internal codes like "5 NOT_FOUND:" from the UI.
  if (/^\d+\s+[A-Z_]+:/.test(backendMessage.trim())) {
    return fallback;
  }

  return backendMessage;
}

export default function ImportPlaylist() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const refreshPlaylists = usePlaylistStore(s => s.fetchPlaylists);
  const popupRef = useRef(null);
  const popupTimerRef = useRef(null);

  const [config, setConfig] = useState(null);
  const [sources, setSources] = useState([]);
  const [selectedSource, setSelectedSource] = useState('youtube');
  const [playlists, setPlaylists] = useState([]);
  const [loadingSources, setLoadingSources] = useState(true);
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);
  const [activePlaylistId, setActivePlaylistId] = useState('');
  const [job, setJob] = useState(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [startingOAuth, setStartingOAuth] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const selectedSourceState = useMemo(
    () => sources.find(source => source.id === selectedSource) || null,
    [selectedSource, sources]
  );

  const previewSummary = useMemo(() => {
    const matches = Array.isArray(job?.matches) ? job.matches : [];
    const matched = matches.filter(item => item.status === 'matched').length;
    const unmatched = matches.length - matched;
    const accuracy = matches.length ? Math.round((matched / matches.length) * 100) : 0;
    return { matched, unmatched, accuracy };
  }, [job]);

  const loadConfig = useCallback(async () => {
    try {
      const nextConfig = await getPlaylistImportConfig();
      setConfig(nextConfig);
    } catch (requestError) {
      setError(getImportErrorMessage(requestError, 'Failed to load import configuration.'));
    }
  }, []);

  const loadSources = useCallback(async () => {
    setLoadingSources(true);
    try {
      const nextSources = await getPlaylistImportSources();
      setSources(nextSources);
      setError('');
      setSelectedSource(current =>
        nextSources.some(source => source.id === current) ? current : (nextSources[0]?.id || current)
      );
    } catch (requestError) {
      setError(getImportErrorMessage(requestError, 'Failed to load connected sources.'));
    } finally {
      setLoadingSources(false);
    }
  }, []);

  const loadPlaylists = useCallback(async (sourceId) => {
    setLoadingPlaylists(true);
    setPlaylists([]);
    setActivePlaylistId('');

    try {
      const nextPlaylists = await getImportSourcePlaylists(sourceId);
      setPlaylists(nextPlaylists);
      setError('');
    } catch (requestError) {
      setError(getImportErrorMessage(requestError, 'Failed to load source playlists.'));
    } finally {
      setLoadingPlaylists(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
    loadSources();
  }, [loadConfig, loadSources]);

  useEffect(() => {
    if (selectedSourceState?.connected) {
      loadPlaylists(selectedSource);
    } else {
      setPlaylists([]);
      setActivePlaylistId('');
    }
  }, [loadPlaylists, selectedSource, selectedSourceState?.connected]);

  useEffect(() => {
    const oauthStatus = searchParams.get('oauth');
    const source = searchParams.get('source');
    const reason = searchParams.get('reason');

    if (!oauthStatus) return;

    if (window.opener && window.opener !== window) {
      window.opener.postMessage({
        type: OAUTH_EVENT,
        oauthStatus,
        source,
        reason,
      }, window.location.origin);
      window.close();
      return;
    }

    if (oauthStatus === 'connected') {
      setNotice(`${source === 'youtube' ? 'YouTube Music' : 'Spotify'} connected.`);
      loadSources();
    } else {
      setError(reason || 'Connection failed.');
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('oauth');
    nextParams.delete('source');
    nextParams.delete('reason');
    setSearchParams(nextParams, { replace: true });
  }, [loadSources, searchParams, setSearchParams]);

  useEffect(() => {
    function handleOAuthMessage(event) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== OAUTH_EVENT) return;

      if (event.data.oauthStatus === 'connected') {
        setNotice(`${event.data.source === 'youtube' ? 'YouTube Music' : 'Spotify'} connected.`);
        setError('');
        loadSources();
      } else {
        setError(event.data.reason || 'Connection failed.');
      }
    }

    window.addEventListener('message', handleOAuthMessage);
    return () => window.removeEventListener('message', handleOAuthMessage);
  }, [loadSources]);

  useEffect(() => {
    if (!job?.id) return undefined;
    if (['preview_ready', 'failed', 'imported'].includes(job.status)) return undefined;

    const interval = window.setInterval(async () => {
      try {
        const nextJob = await getPlaylistImportJob(job.id);
        setJob(nextJob);
      } catch (requestError) {
        setError(getImportErrorMessage(requestError, 'Failed to refresh import progress.'));
      }
    }, 1500);

    return () => window.clearInterval(interval);
  }, [job?.id, job?.status]);

  useEffect(() => () => {
    if (popupTimerRef.current) window.clearInterval(popupTimerRef.current);
  }, []);

  async function handleConnect(sourceId) {
    const sourceState = sources.find(source => source.id === sourceId);
    if (!sourceState?.configured) {
      setError(`${sourceState?.label || 'This source'} is not configured on backend yet.`);
      return;
    }

    setStartingOAuth(true);
    setError('');
    setNotice('');

    try {
      const { authUrl } = await startPlaylistImportOAuth(sourceId);
      const popup = window.open(authUrl, 'youfy-playlist-import', 'width=520,height=720');
      if (!popup) {
        setError('Popup blocked. Allow popups for this site and try again.');
        return;
      }
      popupRef.current = popup;

      if (popupTimerRef.current) {
        window.clearInterval(popupTimerRef.current);
      }

      popupTimerRef.current = window.setInterval(() => {
        if (popupRef.current && popupRef.current.closed) {
          window.clearInterval(popupTimerRef.current);
          popupTimerRef.current = null;
          loadSources();
        }
      }, 1000);
    } catch (requestError) {
      setError(getImportErrorMessage(requestError, 'Failed to start provider authorization.'));
    } finally {
      setStartingOAuth(false);
    }
  }

  async function handlePreview() {
    if (!selectedSource || !activePlaylistId) return;
    setPreviewing(true);
    setError('');
    setNotice('');

    try {
      const nextJob = await previewPlaylistImport(selectedSource, activePlaylistId);
      setJob(nextJob);
    } catch (requestError) {
      setError(getImportErrorMessage(requestError, 'Failed to start import preview.'));
    } finally {
      setPreviewing(false);
    }
  }

  async function handleConfirmImport() {
    if (!job?.id) return;
    setConfirming(true);
    setError('');

    try {
      const result = await confirmPlaylistImport(job.id);
      setJob(current => current ? { ...current, status: result.status, playlistId: result.playlistId } : current);
      setNotice('Playlist imported into your library.');
      await refreshPlaylists();
    } catch (requestError) {
      setError(getImportErrorMessage(requestError, 'Failed to finish playlist import.'));
    } finally {
      setConfirming(false);
    }
  }

  if (!config) {
    return (
      <div className="px-4 md:px-6 lg:px-8 py-6 max-w-6xl mx-auto">
        <div className="text-gray-400 text-sm">Loading playlist import...</div>
      </div>
    );
  }

  const featureEnabled = Boolean(config.enabled);

  return (
    <div className="px-4 md:px-6 lg:px-8 py-6 max-w-6xl mx-auto">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between mb-8">
        <div>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="text-gray-400 hover:text-white text-sm mb-3"
          >
            Back
          </button>
          <h1 className="text-white text-3xl font-bold">Import Playlist</h1>
          <p className="text-gray-400 text-sm mt-2 max-w-2xl">
            Connect YouTube Music, preview the match results, then import the matched tracks into Youfy.
          </p>
        </div>
        <Link
          to="/library"
          className="inline-flex items-center justify-center px-4 py-2 text-sm font-semibold text-black bg-[#FCFFF9] rounded-md"
        >
          Open Library
        </Link>
      </div>

      {!featureEnabled && (
        <section className="border border-subtle bg-elevated rounded-lg p-5">
          <p className="text-white font-semibold">Playlist import is currently turned off.</p>
          <p className="text-gray-400 text-sm mt-2">
            The backend feature flag is disabled. Set `playlist_import_enabled` before rollout.
          </p>
        </section>
      )}

      {featureEnabled && (
        <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <section className="space-y-6">
            <div className="border border-subtle bg-elevated rounded-lg p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white font-semibold">1. Choose a source</h2>
                <span className="text-xs text-gray-500">Rollout {config.rolloutPercentage}%</span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {sources.map(source => {
                  const active = source.id === selectedSource;
                  const isConfigured = Boolean(source.configured);
                  const isSpotify = source.id === 'spotify';
                  const isComingSoon = isSpotify && !source.connected;
                  return (
                    <button
                      key={source.id}
                      type="button"
                      onClick={() => {
                        if (isComingSoon) return;
                        setSelectedSource(source.id);
                        setNotice('');
                        setError('');
                      }}
                        className={`text-left border rounded-lg px-4 py-4 transition-colors ${
                          isComingSoon
                            ? 'border-subtle opacity-50 cursor-not-allowed'
                          : active ? 'border-[#FCFFF9] bg-black/30' : 'border-subtle hover:border-white/20'
                      }`}
                      disabled={isComingSoon}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className={`font-semibold ${isComingSoon ? 'text-gray-400' : 'text-white'}`}>{source.label}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            {isComingSoon ? 'Coming Soon' : (source.connected ? 'Connected' : (isConfigured ? 'Needs authorization' : 'Setup required'))}
                          </p>
                        </div>
                        <span className={`text-xs font-semibold ${
                          isComingSoon ? 'text-gray-500'
                          : source.connected ? 'text-[#FCFFF9]'
                          : isConfigured ? 'text-amber-400'
                          : 'text-gray-400'
                        }`}>
                          {isComingSoon ? 'Coming Soon' : (source.connected ? 'Ready' : (isConfigured ? 'Connect' : 'Configure'))}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {selectedSourceState && !selectedSourceState.connected && (
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  {selectedSourceState.id === 'spotify' ? (
                    <p className="text-sm text-gray-400">
                      Spotify integration is coming soon. Stay tuned for updates!
                    </p>
                  ) : (
                    <>
                      <p className="text-sm text-gray-400">
                        {selectedSourceState.configured
                          ? `Authorize ${selectedSourceState.label} to read your private playlists.`
                          : `${selectedSourceState.label} credentials are missing on backend. Add provider keys to enable secure OAuth.`}
                      </p>
                      <button
                        type="button"
                        onClick={() => handleConnect(selectedSourceState.id)}
                        disabled={startingOAuth || !selectedSourceState.configured}
                        className="inline-flex items-center justify-center px-4 py-2 text-sm font-semibold text-black bg-[#FCFFF9] rounded-md disabled:opacity-60"
                      >
                        {startingOAuth ? 'Opening provider...' : (selectedSourceState.configured ? `Connect ${selectedSourceState.label}` : 'Setup Required')}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="border border-subtle bg-elevated rounded-lg p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white font-semibold">2. Pick a playlist</h2>
                {loadingSources && <span className="text-xs text-gray-500">Checking connections...</span>}
              </div>

              {!selectedSourceState?.connected && (
                <p className="text-sm text-gray-500">
                  {selectedSourceState?.configured
                    ? 'Connect a source to load playlists.'
                    : 'Provider setup is required before playlists can be loaded.'}
                </p>
              )}

              {selectedSourceState?.connected && loadingPlaylists && (
                <p className="text-sm text-gray-500">Loading playlists...</p>
              )}

              {selectedSourceState?.connected && !loadingPlaylists && playlists.length === 0 && (
                <p className="text-sm text-gray-500">No playlists found for this source.</p>
              )}

              {selectedSourceState?.connected && playlists.length > 0 && (
                <>
                  <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                    {playlists.map(playlist => (
                      <button
                        key={playlist.id}
                        type="button"
                        onClick={() => setActivePlaylistId(playlist.id)}
                        className={`w-full text-left border rounded-lg px-4 py-3 transition-colors ${
                          activePlaylistId === playlist.id ? 'border-[#FCFFF9] bg-black/30' : 'border-subtle hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-white text-sm font-semibold truncate">{playlist.title}</p>
                            <p className="text-xs text-gray-500 mt-1 truncate">
                              {playlist.totalTracks || 0} tracks
                              {playlist.owner ? `  ${playlist.owner}` : ''}
                            </p>
                          </div>
                          {activePlaylistId === playlist.id && (
                            <span className="text-[#FCFFF9] text-xs font-semibold">Selected</span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <p className="text-sm text-gray-400">
                      Preview runs asynchronously and keeps the UI responsive for large playlists.
                    </p>
                    <button
                      type="button"
                      onClick={handlePreview}
                      disabled={!activePlaylistId || previewing}
                      className="inline-flex items-center justify-center px-4 py-2 text-sm font-semibold text-black bg-[#FCFFF9] rounded-md disabled:opacity-60"
                    >
                      {previewing ? 'Starting preview...' : 'Preview Matches'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </section>

          <section className="border border-subtle bg-elevated rounded-lg p-5 min-h-[520px]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-semibold">3. Review matches</h2>
              {job?.status && (
                <span className={`text-xs capitalize ${job.status === 'processing' || job.status === 'queued' ? 'text-shimmer font-semibold animate-pulse' : 'text-gray-500'}`}>
                  {job.status.replace('_', ' ')}
                </span>
              )}
            </div>

            {!job && (
              <p className="text-sm text-gray-500">
                Select a playlist and run a preview to see matched tracks, unmatched tracks, and import progress.
              </p>
            )}

            {job && (
              <>
                <div className="mb-5">
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className={`font-medium ${job.status === 'processing' || job.status === 'queued' ? 'text-shimmer animate-pulse' : 'text-white'}`}>
                      {job.status === 'processing' || job.status === 'queued'
                        ? `Matching songs... ${job.progress || 0}%`
                        : (job.playlistTitle || 'Import preview')}
                    </span>
                    <span className="text-gray-500">{job.totalTracks || 0} tracks</span>
                  </div>
                  <div className="h-2 bg-black rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#FCFFF9] transition-[width] duration-300"
                      style={{ width: `${Math.max(4, job.progress || 0)}%` }}
                    />
                  </div>
                </div>

                {job.status === 'failed' && (
                  <p className="text-sm text-red-400">{job.error || 'Preview failed.'}</p>
                )}

                {job.status !== 'failed' && (
                  <>
                    <div className="grid grid-cols-3 gap-3 mb-5">
                      {[
                        { label: 'Matched', value: previewSummary.matched, tone: 'text-[#FCFFF9]' },
                        { label: 'Unmatched', value: previewSummary.unmatched, tone: 'text-amber-400' },
                        { label: 'Accuracy', value: `${previewSummary.accuracy}%`, tone: 'text-white' },
                      ].map(item => (
                        <div key={item.label} className="border border-subtle rounded-lg px-3 py-3">
                          <p className="text-xs text-gray-500">{item.label}</p>
                          <p className={`mt-1 text-lg font-semibold ${item.tone}`}>{item.value}</p>
                        </div>
                      ))}
                    </div>

                    <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                      {(job.matches || []).map(item => (
                        <div key={`${item.index}-${item.sourceTrack?.name}`} className="border border-subtle rounded-lg px-3 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-white text-sm font-semibold truncate">
                                {item.sourceTrack?.name || 'Unknown track'}
                              </p>
                              <p className="text-xs text-gray-500 truncate mt-1">
                                {item.sourceTrack?.artist || 'Unknown artist'}
                                {item.sourceTrack?.duration ? `  ${formatDuration(item.sourceTrack.duration)}` : ''}
                              </p>
                              {item.youfyTrack && (
                                <p className="text-xs text-gray-400 truncate mt-2">
                                  Matched to {item.youfyTrack.title} by {item.youfyTrack.artist}
                                </p>
                              )}
                            </div>
                            <span className={`text-xs font-semibold uppercase ${statusTone(item.status)}`}>
                              {item.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {job.status === 'preview_ready' && (
                      <button
                        type="button"
                        onClick={handleConfirmImport}
                        disabled={confirming || previewSummary.matched === 0}
                        className="mt-5 w-full inline-flex items-center justify-center px-4 py-2.5 text-sm font-semibold text-black bg-[#FCFFF9] rounded-md disabled:opacity-60"
                      >
                        {confirming ? 'Importing...' : 'Confirm Import'}
                      </button>
                    )}

                    {job.status === 'imported' && (
                      <button
                        type="button"
                        onClick={() => navigate('/library')}
                        className="mt-5 w-full inline-flex items-center justify-center px-4 py-2.5 text-sm font-semibold text-black bg-[#FCFFF9] rounded-md"
                      >
                        Open Imported Playlist
                      </button>
                    )}
                  </>
                )}
              </>
            )}

            {notice && <p className="text-sm text-[#FCFFF9] mt-5">{notice}</p>}
            {error && <p className="text-sm text-red-400 mt-5">{error}</p>}
          </section>
        </div>
      )}
    </div>
  );
}
