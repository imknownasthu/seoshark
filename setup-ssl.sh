#!/usr/bin/env bash
# Gan ten mien + HTTPS cho SeoShark mot cach AN TOAN, KHONG dung web/tool khac tren VPS.
# Nguyen tac an toan:
#   - Tao 1 file cau hinh RIENG: /etc/nginx/conf.d/seoshark.conf
#   - Dung server_name CHINH XAC theo domain (KHONG dung default_server -> khong chiem cua site khac)
#   - KHONG xoa / sua bat ky cau hinh nginx nao khac
# Dung: sudo bash setup-ssl.sh <domain> [port] [email]
#   vd: sudo bash setup-ssl.sh seoshark.51.79.84.143.sslip.io 5173
set -uo pipefail

DOMAIN="${1:-}"
PORT="${2:-5173}"
EMAIL="${3:-imknownasthu@gmail.com}"
WEBROOT=/var/www/letsencrypt
CONF=/etc/nginx/conf.d/seoshark.conf

if [ -z "$DOMAIN" ]; then
  echo "Thieu domain. Vi du: sudo bash setup-ssl.sh seoshark.51.79.84.143.sslip.io 5173"
  exit 1
fi

echo "==> 0) Cai nginx + certbot neu chua co (chi them, khong dung gi)"
command -v nginx   >/dev/null 2>&1 || { apt-get update -y && apt-get install -y nginx; }
command -v certbot >/dev/null 2>&1 || { apt-get update -y && apt-get install -y certbot; }

# Don file cau hinh CU cua RIENG seoshark (neu lan truoc tao kieu sites-available) - khong dung site khac
rm -f /etc/nginx/sites-enabled/seoshark /etc/nginx/sites-available/seoshark 2>/dev/null || true

mkdir -p "$WEBROOT/.well-known/acme-challenge"
chmod -R 755 /var/www/letsencrypt

echo "==> 1) Viet cau hinh HTTP (chi cho domain nay) + duong xac thuc ACME -> ${CONF}"
cat > "$CONF" <<EOF
server {
    listen 80;
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

echo "==> 2) Tu kiem tra duong dan xac thuc (khong anh huong site khac)"
echo "ping-ok" > "$WEBROOT/.well-known/acme-challenge/selftest"
chmod 644 "$WEBROOT/.well-known/acme-challenge/selftest"
ST=$(curl -s -H "Host: ${DOMAIN}" http://127.0.0.1/.well-known/acme-challenge/selftest)
echo "    [ACME self-test] ket qua = '${ST}'  (mong doi: ping-ok)"
if [ "$ST" != "ping-ok" ]; then
  echo "    [LOI] Duong dan ACME khong phuc vu dung file."
  echo "    -> Co the co web khac dang chiem cong 80 voi default_server. Gui ket qua nay cho ho tro."
  exit 1
fi

echo "==> 3) Xin chung chi SSL (Let's Encrypt mien phi)"
if certbot certonly --webroot -w "$WEBROOT" -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL"; then
  echo "==> 4) Bat HTTPS + tu chuyen HTTP sang HTTPS (chi cho domain nay)"
  cat > "$CONF" <<EOF
server {
    listen 80;
    server_name ${DOMAIN};
    location ^~ /.well-known/acme-challenge/ { root ${WEBROOT}; default_type "text/plain"; try_files \$uri =404; }
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
  echo "===== XONG (HTTPS)! Mo trinh duyet:  https://${DOMAIN} ====="
  echo "Goi y: mo .env bo dau # truoc NODE_ENV=production roi: pm2 restart seoshark"
else
  echo ""
  echo "===== certbot that bai. App van chay HTTP qua: http://${DOMAIN} ====="
  echo "Gui log o tren cho ho tro de kiem tra."
fi
