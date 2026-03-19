#!/bin/bash
# ============================================
# MediTrack Deploy Script for Contabo VPS
# Ubuntu 24.04 LTS
# ============================================
# Usage: 
#   1. Save to Github from Emergent
#   2. SSH into your server as root
#   3. Run: bash deploy.sh YOUR_GITHUB_REPO_URL YOUR_DOMAIN_OR_IP
#
# Example: bash deploy.sh https://github.com/user/meditrack.git 123.45.67.89
# ============================================

set -e

REPO_URL=$1
DOMAIN=$2

if [ -z "$REPO_URL" ]; then
    echo "Usage: bash deploy.sh GITHUB_REPO_URL [DOMAIN_OR_IP]"
    echo "Example: bash deploy.sh https://github.com/user/meditrack.git meditrack.dk"
    exit 1
fi

if [ -z "$DOMAIN" ]; then
    DOMAIN=$(curl -s ifconfig.me)
    echo "No domain specified, using server IP: $DOMAIN"
fi

echo "============================================"
echo "  MediTrack Deployment"
echo "  Repo: $REPO_URL"
echo "  Domain/IP: $DOMAIN"
echo "============================================"

# --- 1. System Update ---
echo "[1/8] Updating system..."
apt update && apt upgrade -y

# --- 2. Install Dependencies ---
echo "[2/8] Installing dependencies..."
apt install -y python3 python3-pip python3-venv nodejs npm nginx certbot python3-certbot-nginx git curl gnupg

# Install yarn
npm install -g yarn

# Install MongoDB 7
echo "[2b/8] Installing MongoDB..."
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | gpg --dearmor -o /usr/share/keyrings/mongodb-server-7.0.gpg
echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | tee /etc/apt/sources.list.d/mongodb-org-7.0.list
apt update
apt install -y mongodb-org
systemctl start mongod
systemctl enable mongod

# --- 3. Clone Repository ---
echo "[3/8] Cloning repository..."
mkdir -p /opt
cd /opt
if [ -d "meditrack" ]; then
    cd meditrack && git pull
else
    git clone "$REPO_URL" meditrack
    cd meditrack
fi

# --- 4. Setup Backend ---
echo "[4/8] Setting up backend..."
cd /opt/meditrack/backend
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
deactivate

# Create backend .env
cat > /opt/meditrack/backend/.env << EOF
MONGO_URL=mongodb://localhost:27017
DB_NAME=meditrack
RESEND_API_KEY=
SENDER_EMAIL=onboarding@resend.dev
EOF

# --- 5. Build Frontend ---
echo "[5/8] Building frontend..."
cd /opt/meditrack/frontend
yarn install
cat > /opt/meditrack/frontend/.env << EOF
REACT_APP_BACKEND_URL=http://$DOMAIN
EOF
yarn build

# --- 6. Setup Systemd Service for Backend ---
echo "[6/8] Creating backend service..."
cat > /etc/systemd/system/meditrack.service << EOF
[Unit]
Description=MediTrack Backend
After=network.target mongod.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/meditrack/backend
ExecStart=/opt/meditrack/backend/venv/bin/uvicorn server:app --host 0.0.0.0 --port 8001
Restart=always
RestartSec=5
EnvironmentFile=/opt/meditrack/backend/.env

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable meditrack
systemctl start meditrack

# --- 7. Configure Nginx ---
echo "[7/8] Configuring Nginx..."
cat > /etc/nginx/sites-available/meditrack << EOF
server {
    listen 80;
    server_name $DOMAIN;

    # Frontend (React build)
    root /opt/meditrack/frontend/build;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Backend API proxy
    location /api/ {
        proxy_pass http://127.0.0.1:8001/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300;
    }
}
EOF

ln -sf /etc/nginx/sites-available/meditrack /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx

# --- 8. Firewall ---
echo "[8/8] Configuring firewall..."
ufw allow 22
ufw allow 80
ufw allow 443
ufw --force enable

echo ""
echo "============================================"
echo "  DEPLOYMENT COMPLETE!"
echo "============================================"
echo ""
echo "  Your app is running at: http://$DOMAIN"
echo ""
echo "  Useful commands:"
echo "    View backend logs:  journalctl -u meditrack -f"
echo "    Restart backend:    systemctl restart meditrack"
echo "    Restart nginx:      systemctl restart nginx"
echo "    MongoDB shell:      mongosh"
echo ""
echo "  To add HTTPS (free SSL):"
echo "    certbot --nginx -d $DOMAIN"
echo ""
echo "============================================"
