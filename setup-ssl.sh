#!/usr/bin/env bash
# Cau hinh Nginx + HTTPS cho SeoShark (conf.d, webroot, co tu kiem tra).
# Dung: bash setup-ssl.sh <domain> [port] [email]
set -uo pipefail

DOMAIN="${1:-}"
PORT="${2:-5173}"
EMAIL="${3:-imknownasthu@gmail.com}"
WEBROOT=/var/www/letsencrypt
CONF=/etc/nginx/conf.d/seoshark.conf

if [ -z "$DOMAIN" ]; then echo "Thieu domain. Vi du: bash setup-ssl.sh seoshark.51.79.84.143.sslip.io"; exit 1; fi

command -v certbot >/dev/null 2>&1 || { apt-get update -y && apt-get install -y certbot; }
rm -f /etc/nginx/sites-enabled/seoshark /etc/nginx/sites-available/seoshark
mkdir -p "$WEBROOT/.well-known/acme-challenge"
chmod -R 755 /var/www/letsencrypt

echo "==> 1) Viet cau hinh HTTP + acme (${CONF})"
cat > "$CONF" <<EOF
server {
    listen 80 default_server;
    server_name ${DOMAIN};
    client_max_body_size 6m;
    location ^~ /.well-known/acme-challenge/ {
        root ${WEBROOT};
        default_type "text/plain";
        try_files \$uri =404;
    }
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

echo "==> 2) Tu kiem tra duong dan xac thuc"
echo "ping-ok" > "$WEBROOT/.well-known/acme-challenge/selftest"
chmod 644 "$WEBROOT/.well-known/acme-challenge/selftest"
ST=$(curl -s -H "Host: ${DOMAIN}" http://127.0.0.1/.well-known/acme-challenge/selftest)
echo "    [ACME self-test] ket qua = '${ST}'  (mong doi: ping-ok)"
if [ "$ST" != "ping-ok" ]; then
  echo "    [LOI] Duong dan acme khong phuc vu dung file -> dung lai, gui ket qua nay cho ho tro."
  exit 1
fi

echo "==> 3) Xin chung chi SSL"
if certbot certonly --webroot -w "$WEBROOT" -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL"; then
  echo "==> 4) Bat HTTPS + chuyen huong"
  cat > "$CONF" <<EOF
server {
    listen 80 default_server;
    server_name ${DOMAIN};
    location ^~ /.well-known/acme-challenge/ { root ${WEBROOT}; default_type "text/plain"; try_files \$uri =404; }
    location / { return 301 https://\$host\$request_uri; }
}
server {
    listen 443 ssl default_server;
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
  HTTPS_CODE=$(curl -sk -o /dev/null -w "%{http_code}" https://127.0.0.1/ -H "Host: ${DOMAIN}" --resolve "${DOMAIN}:443:127.0.0.1" 2>/dev/null || echo "?")
  echo ""; echo "===== XONG (HTTPS)! Mo: https://${DOMAIN}  (test noi bo: ${HTTPS_CODE}) ====="
else
  echo ""; echo "===== certbot that bai. App van chay HTTP. Gui log cho ho tro. ====="
fi
