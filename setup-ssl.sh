#!/usr/bin/env bash
# Cau hinh Nginx (+ HTTPS neu duoc) cho SeoShark, dat o conf.d de chac chan duoc nap.
# Dung: bash setup-ssl.sh <domain> [port] [email]
set -uo pipefail

DOMAIN="${1:-}"
PORT="${2:-5173}"
EMAIL="${3:-imknownasthu@gmail.com}"
WEBROOT=/var/www/letsencrypt
CONF=/etc/nginx/conf.d/seoshark.conf

if [ -z "$DOMAIN" ]; then echo "Thieu domain. Vi du: bash setup-ssl.sh seoshark.51.79.84.143.sslip.io"; exit 1; fi

command -v certbot >/dev/null 2>&1 || { apt-get update -y && apt-get install -y certbot; }
mkdir -p "$WEBROOT"
# Don cau hinh cu o sites-enabled (tranh trung)
rm -f /etc/nginx/sites-enabled/seoshark /etc/nginx/sites-available/seoshark

echo "==> 1) Viet cau hinh HTTP + acme vao ${CONF}"
cat > "$CONF" <<EOF
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
nginx -t && systemctl reload nginx

echo "==> 2) KIEM TRA"
if nginx -T 2>/dev/null | grep -q "server_name ${DOMAIN}"; then
  echo "    [OK] Nginx DA nap cau hinh SeoShark."
else
  echo "    [CANH BAO] Nginx CHUA nap conf.d! Gui ket qua nay cho ho tro."
fi
CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "Host: ${DOMAIN}" http://127.0.0.1/ 2>/dev/null || echo "000")
echo "    [HTTP test noi bo] Host=${DOMAIN} -> ${CODE} (200 la app phan hoi tot)"

echo "==> 3) Xin chung chi SSL"
if certbot certonly --webroot -w "$WEBROOT" -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL"; then
  echo "==> 4) Bat HTTPS + chuyen huong"
  cat > "$CONF" <<EOF
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
  echo ""; echo "===== XONG (HTTPS)! Mo: https://${DOMAIN} ====="
else
  echo ""; echo "===== SSL chua lay duoc -> VAN CHAY HTTP: http://${DOMAIN} ====="
  echo "Neu HTTP test o tren = 200 thi app ok, chi la chua co SSL."
fi
