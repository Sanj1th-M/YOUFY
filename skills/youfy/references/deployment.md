# Youfy Deployment — Oracle Cloud, PM2, SSL & Monitoring

Everything here is **$0 forever**. No trials, no expiry.

---

## Why Oracle Cloud Free Tier

| Provider | Sleeps? | Time Limit | Cost | Verdict |
|---|---|---|---|---|
| Oracle Cloud Always Free | ❌ Never | ❌ None | $0 forever | ✅ Use this |
| Render free tier | ✅ Yes (15 min) | ❌ None | $0 | ❌ Too slow to wake |
| Railway free tier | ❌ No | ✅ 500 hrs/mo | $0 | ❌ Hours run out |
| Heroku free | ✅ Yes | ✅ Discontinued | $0 | ❌ No longer free |

Oracle Always Free specs: **1 OCPU, 1 GB RAM, 50 GB storage, Ubuntu 22.04 LTS**

---

## Step 1 — Create Oracle Cloud Account

1. Go to https://cloud.oracle.com → Sign Up
2. Choose **Always Free** tier during signup
3. Use a real credit card (for verification only — you will NOT be charged)
4. Select your home region — **pick one close to you, you cannot change it later**

---

## Step 2 — Create a Compute Instance

1. Console → **Compute** → **Instances** → **Create Instance**
2. Settings:
   - **Name**: `youfy-backend`
   - **Image**: Ubuntu 22.04 (Canonical)
   - **Shape**: VM.Standard.E2.1.Micro (Always Free eligible)
   - **SSH Keys**: Upload your public key (or generate one)
3. Click **Create**
4. Wait ~2 minutes → Instance state becomes **Running**
5. Note the **Public IP address** — this is your server IP

### Generate SSH key (if you don't have one)
```bash
ssh-keygen -t ed25519 -C "youfy-server"
# Public key is at ~/.ssh/id_ed25519.pub — paste this into Oracle
```

---

## Step 3 — Open Firewall Port 3000

1. Console → **Networking** → **Virtual Cloud Networks** → your VCN
2. Click **Security Lists** → **Default Security List**
3. Click **Add Ingress Rules**:
   - Source CIDR: `0.0.0.0/0`
   - IP Protocol: TCP
   - Destination Port Range: `3000`
4. Save

Also open port 80 and 443 (for SSL later):
- Add rule for port `80`
- Add rule for port `443`

---

## Step 4 — Connect to Server & Install Dependencies

```bash
# SSH into your server
ssh ubuntu@YOUR_ORACLE_IP

# Update packages
sudo apt update && sudo apt upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Verify
node --version  # should be v18.x.x
npm --version

# Install Python 3 + pip
sudo apt install -y python3 python3-pip

# Install yt-dlp
pip3 install yt-dlp
yt-dlp --version  # verify

# Install PM2 globally
sudo npm install -g pm2

# Verify PM2
pm2 --version
```

---

## Step 5 — Deploy Backend Code

```bash
# On your server
mkdir -p ~/youfy-backend
cd ~/youfy-backend

# Option A: Clone from git (recommended)
git clone https://github.com/yourusername/youfy.git .
cd backend

# Option B: Upload files via SCP from your local machine
# scp -r ./backend ubuntu@YOUR_ORACLE_IP:~/youfy-backend

# Install dependencies
npm install

# Create .env file
nano .env
# Paste your env vars (see below)
```

### .env file content
```
PORT=3000
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="<service-account-private-key-with-escaped-newlines>"
```

> ⚠️ The private key must have `\n` for each newline. Paste exactly as it appears
> in the Firebase service account JSON file.

---

## Step 6 — Start with PM2

```bash
cd ~/youfy-backend

# Start the backend
pm2 start index.js --name youfy

# Confirm it's running
pm2 status
# Should show: youfy | online

# View logs (real-time)
pm2 logs youfy

# Test the health endpoint
curl http://localhost:3000/health
# Expected: {"status":"ok","app":"Youfy Backend"}
```

### Make PM2 survive server reboots

```bash
# Generate startup script
pm2 startup
# Copy and run the command PM2 outputs (starts with "sudo env PATH...")

# Save current process list
pm2 save

# To verify: reboot server and check
sudo reboot
# After reboot:
pm2 status  # youfy should still be "online"
```

### Useful PM2 commands

```bash
pm2 status          # check all processes
pm2 logs youfy      # stream logs
pm2 restart youfy   # restart after code update
pm2 stop youfy      # stop
pm2 delete youfy    # remove from PM2
pm2 monit           # live CPU/memory dashboard
```

---

## Step 7 — SSL Certificate (HTTPS) with Let's Encrypt

### Requirements
- You need a **domain name** pointed to your Oracle IP
- Or use a free domain from https://freenom.com or https://duckdns.org

### Install Nginx + Certbot

```bash
# Install Nginx
sudo apt install -y nginx

# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Create Nginx config for your domain
sudo nano /etc/nginx/sites-available/youfy
```

Paste this Nginx config:

```nginx
server {
    server_name yourdomain.com www.yourdomain.com;

    location / {
        proxy_pass         http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Enable the site
sudo ln -s /etc/nginx/sites-available/youfy /etc/nginx/sites-enabled/
sudo nginx -t          # test config
sudo systemctl reload nginx

# Issue SSL certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Certbot will:
# 1. Verify domain ownership
# 2. Issue certificate
# 3. Auto-configure Nginx for HTTPS
# 4. Set up auto-renewal (via cron)

# Test renewal (dry run)
sudo certbot renew --dry-run
```

After this your API is available at `https://yourdomain.com`

Update Flutter's `api_constants.dart`:
```dart
static const String baseUrl = 'https://yourdomain.com';
```

---

## Step 8 — Auto-Update yt-dlp (Cron Job)

yt-dlp must stay updated or YouTube streams will stop working.
This cron job updates it every Sunday at midnight automatically.

```bash
# Open crontab
crontab -e

# Add this line at the bottom:
0 0 * * 0 pip3 install -U yt-dlp >> /var/log/yt-dlp-update.log 2>&1

# Save and exit (Ctrl+X, Y in nano)

# Verify cron is added
crontab -l
```

To check the update log:
```bash
cat /var/log/yt-dlp-update.log
```

---

## Step 9 — UptimeRobot (Free Monitoring)

UptimeRobot pings your server every 5 minutes and emails you if it goes down.

1. Go to https://uptimerobot.com → Create free account
2. Click **Add New Monitor**:
   - Monitor Type: **HTTP(s)**
   - Friendly Name: `Youfy Backend`
   - URL: `https://yourdomain.com/health` (or `http://YOUR_IP:3000/health`)
   - Monitoring Interval: **5 minutes**
3. Under **Alert Contacts** → add your email
4. Save Monitor

You'll get an email within 5 minutes if the server goes down.

---

## Updating the Backend (Code Changes)

```bash
# On your server
cd ~/youfy-backend

# Pull latest code
git pull origin main

# Install any new dependencies
npm install

# Restart PM2
pm2 restart youfy

# Check it's running
pm2 status
curl http://localhost:3000/health
```

---

## Server Maintenance Cheatsheet

```bash
# Check disk space
df -h

# Check memory
free -h

# Check what's using ports
sudo netstat -tlnp

# View Node.js process
pm2 status

# View all logs
pm2 logs

# View yt-dlp version
yt-dlp --version

# Manually update yt-dlp
pip3 install -U yt-dlp

# Restart Nginx
sudo systemctl restart nginx

# Check Nginx status
sudo systemctl status nginx
```

---

## Environment Variable Checklist

Before going live, verify all these are set in `.env`:

- [ ] `PORT` — set to `3000`
- [ ] `FIREBASE_PROJECT_ID` — from Firebase console
- [ ] `FIREBASE_CLIENT_EMAIL` — from service account JSON
- [ ] `FIREBASE_PRIVATE_KEY` — from service account JSON (with escaped `\n`)
- [ ] `.env` is listed in `.gitignore` — NEVER commit this file
- [ ] `CORS` origin is restricted to your Flutter app's domain in production (optional but recommended)

---

## Deployment Summary

```
Oracle VM (Ubuntu 22.04)
├── Node.js 18
├── yt-dlp (Python) ← auto-updated weekly via cron
├── PM2 ← keeps Node.js alive, restarts on crash/reboot
├── Nginx ← reverse proxy + SSL termination
└── Let's Encrypt SSL ← auto-renews every 90 days

Monitoring:
└── UptimeRobot ← pings /health every 5 min, emails on downtime

Total monthly cost: $0
```
