# Deploying Endsound to GCP Compute Engine

This guide walks through deploying Endsound on a GCP Compute Engine e2-micro VM (always-free tier) with nginx, HTTPS via Let's Encrypt, and PM2 process management.

## Architecture

```
Internet → endsound.org (DNS A record → GCP static IP)
         → Nginx (port 80/443, SSL termination)
           → Node.js (port 3000, Express + Socket.IO)
              serves dist/ static files + WebSocket
```

## Prerequisites

- [Google Cloud CLI](https://cloud.google.com/sdk/docs/install) (`gcloud`) installed and authenticated
- A registered domain (this guide uses endsound.org on Squarespace)
- Node.js >= 18 installed locally

## Step 1: Create a GCP Project

```bash
gcloud projects create endsound --name="Endsound"
gcloud config set project endsound
```

Link a billing account (required even for free-tier resources):

```bash
# List available billing accounts
gcloud billing accounts list

# Link billing to the project
gcloud billing projects link endsound --billing-account=YOUR_BILLING_ACCOUNT_ID
```

Enable the Compute Engine API:

```bash
gcloud services enable compute.googleapis.com
```

## Step 2: Create the VM

```bash
gcloud compute instances create endsound \
  --zone=us-central1-a \
  --machine-type=e2-micro \
  --image-family=ubuntu-2204-lts \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=20GB \
  --tags=http-server,https-server
```

## Step 3: Reserve a Static IP

Reserve an IP and assign it to the VM:

```bash
# Reserve a static IP
gcloud compute addresses create endsound-ip --region=us-central1

# Note the IP address
gcloud compute addresses describe endsound-ip --region=us-central1 --format='get(address)'

# Remove the ephemeral IP from the VM
gcloud compute instances delete-access-config endsound \
  --zone=us-central1-a \
  --access-config-name="external-nat"

# Assign the static IP
gcloud compute instances add-access-config endsound \
  --zone=us-central1-a \
  --address=YOUR_STATIC_IP
```

## Step 4: Open Firewall Ports

```bash
gcloud compute firewall-rules create allow-http \
  --allow tcp:80 --target-tags http-server

gcloud compute firewall-rules create allow-https \
  --allow tcp:443 --target-tags https-server
```

## Step 5: Point DNS to the Static IP

In your domain registrar's DNS settings, add two A records:

| Type | Host | Value |
|------|------|-------|
| A | @ | YOUR_STATIC_IP |
| A | www | YOUR_STATIC_IP |

DNS propagation can take a few minutes. Verify with:

```bash
dig +short endsound.org A @8.8.8.8
```

## Step 6: Install Software on the VM

SSH into the VM:

```bash
gcloud compute ssh endsound --zone=us-central1-a
```

Install nginx and certbot:

```bash
sudo apt update && sudo apt install -y nginx certbot python3-certbot-nginx
```

Install Node.js 18 and PM2:

```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

Create the app directory:

```bash
mkdir -p ~/endsound/dist ~/endsound/public
```

Exit the SSH session when done:

```bash
exit
```

## Step 7: Configure Nginx

Copy the nginx config to the VM:

```bash
gcloud compute scp nginx.conf endsound:~/nginx.conf --zone=us-central1-a
```

SSH in and install it:

```bash
gcloud compute ssh endsound --zone=us-central1-a
```

```bash
# Start with a minimal HTTP-only config (needed for certbot to verify the domain)
sudo tee /etc/nginx/sites-available/endsound > /dev/null <<'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name endsound.org www.endsound.org;
    location / {
        proxy_pass http://127.0.0.1:3000;
    }
}
EOF

# Enable the site and disable the default
sudo ln -sf /etc/nginx/sites-available/endsound /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl restart nginx
```

## Step 8: Obtain SSL Certificate

Still on the VM, run certbot:

```bash
sudo certbot --nginx \
  -d endsound.org \
  -d www.endsound.org \
  --non-interactive \
  --agree-tos \
  --email your-email@example.com \
  --redirect
```

Certbot will obtain the certificate and configure auto-renewal. Now replace the nginx config with the full version that includes WebSocket support:

```bash
sudo tee /etc/nginx/sites-available/endsound > /dev/null <<'EOF'
# Redirect HTTP to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name endsound.org www.endsound.org;
    return 301 https://$host$request_uri;
}

# HTTPS server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name endsound.org www.endsound.org;

    # SSL certificates (managed by Certbot)
    ssl_certificate /etc/letsencrypt/live/endsound.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/endsound.org/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript;
    gzip_min_length 256;

    # Proxy to Node.js app
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # WebSocket support (required for Socket.IO)
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # Forward real client info
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Long timeouts for WebSocket connections
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
EOF

sudo nginx -t && sudo systemctl restart nginx
```

## Step 9: Create the Production Environment File

Still on the VM:

```bash
cat > ~/endsound/.env <<'EOF'
PORT=3000
NODE_ENV=production
CORS_ORIGIN=https://endsound.org
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=200
EOF
```

## Step 10: Configure PM2 Auto-Start

```bash
pm2 startup systemd
```

Follow the instructions it prints (copy-paste the `sudo` command it gives you). Then exit:

```bash
exit
```

## Step 11: Deploy the App

From your local machine, build and copy files to the VM:

```bash
# Build
npm run build

# Copy dist, server, and dependencies
gcloud compute scp --recurse dist/* endsound:~/endsound/dist/ --zone=us-central1-a
gcloud compute scp server.js package.json package-lock.json endsound:~/endsound/ --zone=us-central1-a
gcloud compute scp public/audio-processor.js endsound:~/endsound/public/ --zone=us-central1-a

# Install production dependencies on the VM
gcloud compute ssh endsound --zone=us-central1-a \
  --command="cd ~/endsound && npm ci --omit=dev"

# Start the app
gcloud compute ssh endsound --zone=us-central1-a \
  --command="cd ~/endsound && pm2 start server.js --name endsound && pm2 save"
```

Or use the included deploy script which does all of the above:

```bash
./deploy.sh
```

## Step 12: Verify

```bash
# Health check
curl https://endsound.org/health
# → {"status":"ok","uptime":...}

# Check HTTPS headers
curl -I https://endsound.org
# → HTTP/2 200, valid SSL, security headers present
```

Open https://endsound.org in a browser and confirm the keyboard and audio work.

## Subsequent Deploys

After making code changes, just run:

```bash
./deploy.sh
```

This builds locally, copies files to the VM, installs dependencies, and restarts PM2.

## Maintenance

**SSH into the VM:**

```bash
gcloud compute ssh endsound --zone=us-central1-a
```

**View app logs:**

```bash
pm2 logs endsound
```

**Restart the app:**

```bash
pm2 restart endsound
```

**SSL certificate renewal** is automatic via a certbot systemd timer. Verify with:

```bash
sudo certbot renew --dry-run
```

## server.js Change

One change was made to `server.js` for production: `app.set('trust proxy', 1)` was added after creating the Express app. This tells Express it's behind a reverse proxy (nginx) so that `express-rate-limit` sees the real client IP from the `X-Forwarded-For` header instead of `127.0.0.1` for every request.
