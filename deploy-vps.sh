#!/usr/bin/env bash
# Trien khai SeoShark len VPS Ubuntu: Node + PM2 + PostgreSQL (local) + Nginx.
# Cach dung: clone repo roi chay TU TRONG thu muc repo:  sudo bash deploy-vps.sh
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
PORT=5173
DB_NAME=seoshark
DB_USER=seoshark

echo "==> 1) Cai goi he thong (git, nginx, postgresql, certbot)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl ca-certificates gnupg git nginx postgresql postgresql-contrib certbot python3-certbot-nginx openssl

echo "==> 2) Cai Node.js 20 (neu chua co hoac qua cu)"
if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 18 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
echo "    Node $(node -v)"

echo "==> 3) Cai PM2"
npm install -g pm2

echo "==> 4) PostgreSQL: tao DB/user (neu chua co)"
systemctl enable --now postgresql
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1; then
  DB_PASS="$(openssl rand -hex 16)"
  sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}';"
  sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"
  echo "${DB_PASS}" > "${APP_DIR}/.db_pass"
  chmod 600 "${APP_DIR}/.db_pass"
  echo "    -> Da tao DB '${DB_NAME}'."
else
  DB_PASS="$(cat "${APP_DIR}/.db_pass" 2>/dev/null || true)"
  echo "    -> User DB da ton tai (dung mat khau cu trong .db_pass)."
fi
DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}"

echo "==> 5) npm install"
cd "${APP_DIR}"
npm install

echo "==> 6) Tao .env (neu chua co)"
if [ ! -f .env ]; then
  cat > .env <<EOF
PORT=${PORT}
AUTH_ENABLED=true
MAIL_TO=imknownasthu@gmail.com
DATABASE_URL=${DATABASE_URL}

# === DIEN CAC KEY (lay tu Render Environment) ===
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash
BREVO_API_KEY=
BREVO_SENDER=
BREVO_SENDER_NAME=SeoShark
GOOGLE_CSE_KEY=
GOOGLE_CSE_CX=
# Sau khi co domain + SSL hay bo dau # dong duoi (de cookie bao mat):
# NODE_ENV=production
EOF
  chmod 600 .env
  echo "    -> Da tao .env. NHO mo .env dien GEMINI_API_KEY, BREVO_API_KEY, BREVO_SENDER, GOOGLE_CSE_*"
else
  grep -q "^DATABASE_URL=" .env || echo "DATABASE_URL=${DATABASE_URL}" >> .env
  echo "    -> .env da ton tai, giu nguyen."
fi

echo "==> 7) Chay app bang PM2"
pm2 delete seoshark >/dev/null 2>&1 || true
pm2 start server.js --name seoshark
pm2 save
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true

echo "==> 8) Nginx reverse proxy (:80 -> :${PORT})"
cat > /etc/nginx/sites-available/seoshark <<EOF
server {
    listen 80;
    server_name _;
    client_max_body_size 6m;
    location / {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
ln -sf /etc/nginx/sites-available/seoshark /etc/nginx/sites-enabled/seoshark
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# Mo cong 80/443 neu ufw dang bat (khong bat ufw de tranh khoa SSH)
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow 80/tcp || true
  ufw allow 443/tcp || true
fi

IP="$(curl -s ifconfig.me || echo 'IP_VPS')"
echo ""
echo "=================================================================="
echo " XONG! Mo trinh duyet:  http://${IP}"
echo " Buoc cuoi: mo .env dien cac KEY roi chay:  pm2 restart seoshark"
echo " Khi co domain: xem VPS-DEPLOY.md de gan domain + bat HTTPS."
echo "=================================================================="
