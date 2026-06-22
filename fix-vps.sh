#!/usr/bin/env bash
# Sua dut diem: lam HTTPS chay cho SeoShark tren domain sslip.io, KHONG dung VoiceSocial.
# Dung: sudo bash fix-vps.sh
set -uo pipefail

DOMAIN="seoshark.51.79.84.143.sslip.io"
PORT=5173
EMAIL="imknownasthu@gmail.com"
CONF=/etc/nginx/conf.d/seoshark.conf

echo "==> 1) Bao dam certbot + plugin nginx da cai"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y >/dev/null 2>&1 || true
apt-get install -y certbot python3-certbot-nginx >/dev/null 2>&1 || true

echo "==> 2) Viet lai ${CONF} (HTTP sach, KHONG default_server)"
cat > "$CONF" <<EOF
server {
    listen 80;
    server_name ${DOMAIN};
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

if ! nginx -t; then
  echo "[LOI] nginx -t that bai. Dung lai, gui ket qua tren cho ho tro."
  exit 1
fi
systemctl reload nginx

echo "==> 3) Kiem tra app qua HTTP (noi bo)"
TITLE=$(curl -s -H "Host: ${DOMAIN}" http://127.0.0.1 | grep -io "<title>[^<]*</title>" | head -1)
echo "    -> HTTP tra ve: ${TITLE:-'(rong - app co the chua chay, chay: pm2 restart seoshark)'}"

echo "==> 4) Xin chung chi SSL + tu cau hinh HTTPS (plugin nginx)"
echo "    (Buoc nay can cong 80 va 443 mo ra Internet)"
if certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos -m "${EMAIL}" --redirect; then
  systemctl reload nginx
  echo ""
  echo "=================================================================="
  echo " THANH CONG! Mo trinh duyet:  https://${DOMAIN}"
  echo " (Dung cua so an danh de tranh cache cu)"
  echo "=================================================================="
else
  echo ""
  echo "=================================================================="
  echo " certbot CHUA lay duoc chung chi (xem dong loi mau o tren)."
  echo " SeoShark VAN dung duoc qua HTTP:  http://${DOMAIN}"
  echo " -> Chup TOAN BO ket qua tu '==> 4' tro xuong gui cho ho tro."
  echo "=================================================================="
fi
