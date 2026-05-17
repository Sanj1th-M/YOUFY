const os = require('os');
const { execSync } = require('child_process');

if (os.platform() === 'linux') {
  try {
    console.log('Downloading yt-dlp for Linux (bypassing GitHub API rate limits)...');
    execSync('curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o yt-dlp && chmod +x yt-dlp', { stdio: 'inherit' });
    console.log('yt-dlp downloaded and made executable.');
  } catch (e) {
    console.error('Failed to download yt-dlp:', e.message);
    process.exit(1);
  }
} else {
  console.log('Not on Linux, assuming yt-dlp is available in PATH.');
}
