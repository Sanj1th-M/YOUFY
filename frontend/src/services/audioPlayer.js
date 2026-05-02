// HTML5 Audio API — browser built-in, zero packages needed
// NEVER use YouTube player or iframe embed

class AudioPlayer {
  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this._abortController = null;
    this._listeners = {};
    this._setupMediaSession();
  }

  /**
   * Play a new URL. Aborts any in-progress load first.
   * Returns only after audio actually starts playing.
   */
  async play(url, song) {
    // Abort any previous load — prevents race conditions
    if (this._abortController) {
      this._abortController.abort();
    }
    this._abortController = new AbortController();
    const { signal } = this._abortController;

    // Pause current playback immediately (user sees instant feedback)
    this.audio.pause();

    // Set new source
    this.audio.src = url;
    this.audio.load(); // force the browser to start loading immediately

    // Wait for the audio to be playable or for abort
    await new Promise((resolve, reject) => {
      const cleanup = () => {
        this.audio.removeEventListener('canplay', onCanPlay);
        this.audio.removeEventListener('error', onError);
        signal.removeEventListener('abort', onAbort);
      };

      const onCanPlay = () => { cleanup(); resolve(); };
      const onError = () => {
        cleanup();
        reject(new Error('Audio load failed'));
      };
      const onAbort = () => {
        cleanup();
        reject(new DOMException('Aborted', 'AbortError'));
      };

      // If already aborted before we even listen
      if (signal.aborted) {
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }

      this.audio.addEventListener('canplay', onCanPlay, { once: true });
      this.audio.addEventListener('error', onError, { once: true });
      signal.addEventListener('abort', onAbort, { once: true });
    });

    // If we weren't aborted, play
    if (!signal.aborted) {
      await this.audio.play();
      this._updateMediaSession(song);
    }
  }

  pause()             { this.audio.pause(); }
  resume()            { return this.audio.play(); }
  seek(s)             { this.audio.currentTime = s; }
  setVolume(v)        { this.audio.volume = Math.max(0, Math.min(1, v)); }

  get currentTime()   { return this.audio.currentTime; }
  get duration()      { return this.audio.duration || 0; }
  get paused()        { return this.audio.paused; }
  get volume()        { return this.audio.volume; }

  // Use proper addEventListener with cleanup to prevent listener leaks
  onTimeUpdate(cb) {
    if (this._listeners.timeupdate) {
      this.audio.removeEventListener('timeupdate', this._listeners.timeupdate);
    }
    this._listeners.timeupdate = cb;
    this.audio.addEventListener('timeupdate', cb);
  }

  onEnded(cb) {
    if (this._listeners.ended) {
      this.audio.removeEventListener('ended', this._listeners.ended);
    }
    this._listeners.ended = cb;
    this.audio.addEventListener('ended', cb);
  }

  onError(cb) {
    if (this._listeners.error) {
      this.audio.removeEventListener('error', this._listeners.error);
    }
    this._listeners.error = cb;
    this.audio.addEventListener('error', cb);
  }

  onCanPlay(cb) {
    if (this._listeners.canplay) {
      this.audio.removeEventListener('canplay', this._listeners.canplay);
    }
    this._listeners.canplay = cb;
    this.audio.addEventListener('canplay', cb);
  }

  onWaiting(cb) {
    if (this._listeners.waiting) {
      this.audio.removeEventListener('waiting', this._listeners.waiting);
    }
    this._listeners.waiting = cb;
    this.audio.addEventListener('waiting', cb);
  }

  _setupMediaSession() {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.setActionHandler('play',  () => this.resume());
    navigator.mediaSession.setActionHandler('pause', () => this.pause());
  }

  _updateMediaSession(song) {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title:   song.title,
      artist:  song.artist,
      artwork: [{ src: song.thumbnail, sizes: '512x512', type: 'image/jpeg' }],
    });
    navigator.mediaSession.setActionHandler('nexttrack',     () => window.__youfyNext?.());
    navigator.mediaSession.setActionHandler('previoustrack', () => window.__youfyPrev?.());
  }
}

export const audioPlayer = new AudioPlayer();
