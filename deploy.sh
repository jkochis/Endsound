#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Endsound Deploy Script
# Builds locally, copies to GCP VM via gcloud, restarts with PM2.
#
# Prerequisites (run once on VM):
#   sudo apt update && sudo apt install -y nginx certbot python3-certbot-nginx
#   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
#   sudo apt install -y nodejs
#   sudo npm install -g pm2
#   sudo certbot --nginx -d endsound.org -d www.endsound.org
#   sudo cp nginx.conf /etc/nginx/sites-available/endsound
#   sudo ln -s /etc/nginx/sites-available/endsound /etc/nginx/sites-enabled/
#   sudo nginx -t && sudo systemctl restart nginx
#   pm2 startup  # follow instructions to enable on boot
#
# GCP VM setup (run once from local machine):
#   gcloud compute instances create endsound \
#     --zone=us-central1-a \
#     --machine-type=e2-micro \
#     --image-family=ubuntu-2204-lts \
#     --image-project=ubuntu-os-cloud \
#     --boot-disk-size=20GB \
#     --tags=http-server,https-server
#
#   gcloud compute addresses create endsound-ip --region=us-central1
#
#   gcloud compute firewall-rules create allow-http \
#     --allow tcp:80 --target-tags http-server
#   gcloud compute firewall-rules create allow-https \
#     --allow tcp:443 --target-tags https-server
#
# DNS (Squarespace):
#   A record: @ → 136.114.0.10
#   A record: www → 136.114.0.10
#
# Production .env (create on VM at ~/endsound/.env):
#   PORT=3000
#   NODE_ENV=production
#   CORS_ORIGIN=https://endsound.org
#   RATE_LIMIT_WINDOW_MS=60000
#   RATE_LIMIT_MAX_REQUESTS=200
# =============================================================================

ZONE="${GCP_ZONE:-us-central1-a}"
VM_NAME="${GCP_VM:-endsound}"
VM_DIR="~/endsound"

echo "==> Building locally..."
npm run build

echo "==> Copying files to ${VM_NAME}..."
gcloud compute scp --recurse dist/* "${VM_NAME}:${VM_DIR}/dist/" --zone="${ZONE}"
gcloud compute scp server.js package.json package-lock.json "${VM_NAME}:${VM_DIR}/" --zone="${ZONE}"
gcloud compute scp public/audio-processor.js "${VM_NAME}:${VM_DIR}/public/" --zone="${ZONE}"

echo "==> Installing production dependencies on VM..."
gcloud compute ssh "${VM_NAME}" --zone="${ZONE}" --command="cd ${VM_DIR} && npm ci --omit=dev"

echo "==> Restarting app with PM2..."
gcloud compute ssh "${VM_NAME}" --zone="${ZONE}" --command="cd ${VM_DIR} && pm2 restart endsound 2>/dev/null || pm2 start server.js --name endsound && pm2 save"

echo "==> Deploy complete!"
echo "    https://endsound.org"
