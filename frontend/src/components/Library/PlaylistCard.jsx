import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AddSongsModal from './AddSongsModal';
import PlaylistArtwork from './PlaylistArtwork';


export default function PlaylistCard({ playlist }) {
  const navigate = useNavigate();
  const [showAdd, setShowAdd] = useState(false);

  const songs = Array.isArray(playlist?.songs) ? playlist.songs : [];

  const openPlaylist = () => {
    navigate(`/playlist/${encodeURIComponent(playlist.id)}`);
  };

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={openPlaylist}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openPlaylist();
          }
        }}
        className="group rounded-[28px] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] p-4 transition-all hover:-translate-y-0.5 hover:border-white/20 hover:bg-[linear-gradient(135deg,rgba(255,255,255,0.11),rgba(255,255,255,0.03))] sm:p-5 backdrop-blur-md shadow-lg"
      >
        <div className="flex items-center gap-4">
          <PlaylistArtwork
            playlist={playlist}
            songs={songs}
            className="h-20 w-20 rounded-[24px] shadow-[0_20px_40px_rgba(0,0,0,0.35)]"
          />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-xl font-bold text-white">{playlist.name}</p>
            </div>

            {playlist?.description ? (
              <p className="mt-2 line-clamp-2 text-sm leading-6 text-white/55">
                {playlist.description}
              </p>
            ) : null}

            <div className="mt-3 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-white/35">
              <span>{songs.length} songs</span>
              <span className="h-1 w-1 rounded-full bg-white/20" />
              <span className="transition-colors group-hover:text-white/55">Open playlist</span>
            </div>
          </div>

          <div
            className="hidden items-center gap-2 sm:flex"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-white/80 transition-colors hover:border-white/20 hover:text-white"
            >
              Add songs
            </button>

            <button
              type="button"
              onClick={openPlaylist}
              className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 text-white/70 transition-colors hover:border-white/20 hover:text-white"
              aria-label="Open playlist"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
              </svg>
            </button>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 sm:hidden">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setShowAdd(true);
            }}
            className="rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-white/80"
          >
            Add songs
          </button>
        </div>
      </div>

      {showAdd ? (
        <AddSongsModal
          playlist={playlist}
          onClose={() => setShowAdd(false)}
        />
      ) : null}
    </>
  );
}
