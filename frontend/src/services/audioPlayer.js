// HTML5 Audio API — browser built-in, zero packages needed
// NEVER use YouTube player or iframe embed

class AudioPlayer {
  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'metadata';
    this._setupMediaSession();
  }

  // Always fetch fresh URL from /stream/:videoId — never cache
  async play(url, song) {
    this.audio.src = url;
    await this.audio.play();
    this._updateMediaSession(song);
  }

  pause()             { this.audio.pause(); }
  resume()            { return this.audio.play(); }
  seek(s)             { this.audio.currentTime = s; }
  setVolume(v)        { this.audio.volume = Math.max(0, Math.min(1, v)); }

  get currentTime()   { return this.audio.currentTime; }
  get duration()      { return this.audio.duration || 0; }
  get paused()        { return this.audio.paused; }
  get volume()        { return this.audio.volume; }

  onTimeUpdate(cb)    { this.audio.ontimeupdate = cb; }
  onEnded(cb)         { this.audio.onended = cb; }
  onError(cb)         { this.audio.onerror = cb; }
  onCanPlay(cb)       { this.audio.oncanplay = cb; }
  onWaiting(cb)       { this.audio.onwaiting = cb; }

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
