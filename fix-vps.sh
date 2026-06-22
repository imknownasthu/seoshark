#!/usr/bin/env bash
# Sua dut diem HTTPS cho SeoShark (sslip.io). Acme tinh uu tien hon proxy + tu kiem tra TU NGOAI.
# Dung: sudo bash fix-vps.sh
set -uo pipefail

DOMAIN="seoshark.51.79.84.143.sslip.io"
PORT=5173
EMAIL="imknownasthu@gmail.com"
CONF=/etc/nginx/conf.d/seoshark.conf
WEBROOT=/var/www/letsencrypt

echo "==> 1) Bao dam certbot + thu muc webroot"
export DEBIAN_FRONTEND=noninteractive
apt-get install -y certbot >/dev/null 2>&1 || true
mkdir -p "$WEBROOT/.well-known/acme-challenge"
chmod -R 755 /var/www/letsencrypt

echo "==> 2) Viet ${CONF}: acme TINH (^~ uu tien hon proxy /)"
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
if ! nginx -t; then echo "[LOI] nginx -t that bai."; exit 1; fi
systemctl reload nginx

echo "==> 3) TU KIEM TRA TU INTERNET (giong het Let's Encrypt se lam)"
echo "ping-ok-token" > "$WEBROOT/.well-known/acme-challenge/selftest"
chmod 644 "$WEBROOT/.well-known/acme-challenge/selftest"
EXT=$(curl -s --max-time 20 "http://${DOMAIN}/.well-known/acme-challenge/selftest" || echo "KHONG-KET-NOI")
echo "    -> Ben ngoai tra ve: '${EXT}'   (mong doi: ping-ok-token)"
if ! echo "$EXT" | grep -q "ping-ok-token"; then
  echo ""
  echo "=================================================================="
  echo " [CHAN DOAN] Duong dan acme KHONG thong tu Internet."
  echo "   Ket qua nhan duoc o tren ('${EXT}') khac 'ping-ok-token'."
  echo "   -> Cong 80 tu ngoai dang bi thu khac tra loi, HOAC firewall dam may (OVH) chan 80/443."
  echo "   -> Khong the cap SSL Let's Encrypt theo cach nay."
  echo " SeoShark VAN chay HTTP. Chup TOAN BO khung nay gui ho tro de chuyen phuong an."
  echo "=================================================================="
  exit 2
fi

echo "==> 4) Duong di THONG. Xin chung chi (webroot)"
if certbot certonly --webroot -w "$WEBROOT" -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL"; then
  echo "==> 5) Bat HTTPS + chuyen huong"
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
  echo "=================================================================="
  echo " THANH CONG! Mo (an danh):  https://${DOMAIN}"
  echo "=================================================================="
else
  echo ""
  echo " certbot van loi du duong da thong - chup gui ho tro. SeoShark van: http://${DOMAIN}"
fi
