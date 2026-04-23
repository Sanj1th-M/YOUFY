import { useEffect, useMemo, useState } from 'react';

export default function PlaylistEditModal({
  playlist,
  onClose,
  onSave,
  saving = false,
}) {
  const [form, setForm] = useState({
    name: '',
    description: '',
  });

  useEffect(() => {
    if (!playlist) return;

    setForm({
      name: playlist.name || '',
      description: playlist.description || '',
    });
  }, [playlist]);

  const hasChanges = useMemo(() => (
    form.name.trim() !== (playlist?.name || '')
    || form.description.trim() !== (playlist?.description || '')
  ), [form, playlist]);

  if (!playlist) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close edit playlist modal"
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
      />

      <div className="relative z-10 w-full max-w-3xl overflow-hidden rounded-[28px] border border-white/10 bg-[rgba(32,32,32,0.7)] backdrop-blur-xl shadow-[0_32px_120px_rgba(0,0,0,0.68)]">
        <div className="border-b border-white/10 px-6 py-5 sm:px-8">
          <p className="text-[11px] uppercase tracking-[0.28em] text-white/45">Playlist</p>
          <h2 className="mt-3 text-3xl font-bold text-white">{playlist.name}</h2>
        </div>

        <div className="grid gap-6 px-6 py-6 sm:px-8 sm:py-8">
          <label className="grid gap-3">
            <span className="text-sm text-white/70">Title</span>
            <input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              className="w-full border-b border-white/20 bg-transparent px-0 py-2 text-3xl font-semibold text-white outline-none transition-colors focus:border-[#3ea6ff]"
              maxLength={100}
              autoFocus
            />
          </label>

          <label className="grid gap-3">
            <span className="text-sm text-white/70">Description</span>
            <textarea
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              className="min-h-[120px] w-full resize-none border-b border-white/20 bg-transparent px-0 py-2 text-xl text-white outline-none transition-colors focus:border-[#3ea6ff]"
              maxLength={300}
              placeholder="Say something about this playlist"
            />
          </label>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-white/10 px-6 py-5 sm:px-8">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-5 py-3 text-lg font-medium text-white/80 transition-colors hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving || !form.name.trim() || !hasChanges}
            onClick={() => onSave({
              name: form.name,
              description: form.description,
            })}
            className="rounded-full bg-white px-7 py-3 text-lg font-semibold text-black transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
