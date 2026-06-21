#!/usr/bin/env bash
# Cau hinh Nginx + HTTPS (Let's Encrypt webroot) cho SeoShark, KHONG dung den app khac.
# Dung: bash setup-ssl.sh <domain> [port] [email]
#   vd: bash setup-ssl.sh seoshark.51.79.84.143.sslip.io
set -euo pipefail

DOMAIN="${1:-}"
PORT="${2:-5173}"
EMAIL="${3:-imknownasthu@gmail.com}"
WEBROOT=/var/www/letsencrypt

if [ -z "$DOMAIN" ]; then
  echo "Thieu domain. Vi du: bash setup-ssl.sh seoshark.51.79.84.143.sslip.io"
  exit 1
fi

echo "==> 0) Dam bao certbot da cai"
command -v certbot >/dev/null 2>&1 || { apt-get update -y && apt-get install -y certbot python3-certbot-nginx; }
mkdir -p "$WEBROOT"

echo "==> 1) Cau hinh HTTP + acme cho ${DOMAIN}"
cat > /etc/nginx/sites-available/seoshark <<EOF
server {
    listen 80;
    server_name ${DOMAIN};
    client_max_body_size 6m;
    location /.well-known/acme-challenge/ { root ${WEBROOT}; }
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
nginx -t && systemctl reload nginx

echo "==> 2) Xin chung chi SSL (webroot)"
certbot certonly --webroot -w "$WEBROOT" -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL"

echo "==> 3) Cau hinh HTTPS + chuyen huong http->https"
cat > /etc/nginx/sites-available/seoshark <<EOF
server {
    listen 80;
    server_name ${DOMAIN};
    location /.well-known/acme-challenge/ { root ${WEBROOT}; }
    location / { return 301 https://\$host\$request_uri; }
}
server {
    listen 443 ssl;
    server_name ${DOMAIN};
    ssl_certificate /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
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
nginx -t && systemctl reload nginx

echo ""
echo "================================================="
echo " XONG! Mo: https://${DOMAIN}"
echo "================================================="
