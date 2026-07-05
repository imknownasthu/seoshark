#!/usr/bin/env bash
# Tao Cloudflare NAMED TUNNEL -> dia chi CO DINH vinh vien (khong doi khi reboot).
# Yeu cau chay TRUOC (1 lan, tuong tac trinh duyet):
#   cloudflared tunnel login      # mo URL hien ra, dang nhap Cloudflare, chon domain cua ban
# Roi chay:  sudo bash setup-named-tunnel.sh <domain> [port]
#   vd:      sudo bash setup-named-tunnel.sh seosharkai.us.kg 5173
set -uo pipefail

DOMAIN="${1:-}"
PORT="${2:-5173}"
NAME=seoshark
CF_DIR=/root/.cloudflared

if [ -z "$DOMAIN" ]; then
  echo "Thieu domain. Vi du: sudo bash setup-named-tunnel.sh seosharkai.us.kg 5173"; exit 1
fi
command -v cloudflared >/dev/null 2>&1 || { echo "[LOI] chua co cloudflared."; exit 1; }

if [ ! -f "${CF_DIR}/cert.pem" ]; then
  echo "=================================================================="
  echo " [!] Ban CHUA dang nhap Cloudflare tren VPS."
  echo " Hay chay lenh nay TRUOC (roi lam theo huong dan mo ra):"
  echo ""
  echo "     cloudflared tunnel login"
  echo ""
  echo " -> No in ra 1 URL. Mo URL do tren trinh duyet, dang nhap Cloudflare,"
  echo "    chon domain '${DOMAIN}' de cap quyen. Xong roi chay lai script nay."
  echo "=================================================================="
  exit 1
fi

echo "==> 1) Tao tunnel '${NAME}' (neu chua co)"
cloudflared tunnel create "${NAME}" 2>/dev/null || echo "    (tunnel da ton tai, dung lai)"
TID="$(cloudflared tunnel list 2>/dev/null | awk -v n="${NAME}" '$2==n{print $1}' | head -1)"
if [ -z "${TID}" ]; then echo "[LOI] Khong lay duoc Tunnel ID."; exit 1; fi
echo "    Tunnel ID: ${TID}"

echo "==> 2) Tro DNS ${DOMAIN} -> tunnel"
cloudflared tunnel route dns "${NAME}" "${DOMAIN}" 2>/dev/null || echo "    (DNS da tro san hoac se ghi de)"

echo "==> 3) Viet config"
cat > "${CF_DIR}/config.yml" <<EOF
tunnel: ${TID}
credentials-file: ${CF_DIR}/${TID}.json
ingress:
  - hostname: ${DOMAIN}
    service: http://localhost:${PORT}
  - service: http_status:404
EOF

echo "==> 4) Thay tunnel-nhanh cu bang NAMED tunnel (PM2, tu chay lai khi reboot)"
pm2 delete seoshark-tunnel >/dev/null 2>&1 || true
pm2 start cloudflared --name seoshark-tunnel -- tunnel run "${NAME}"
pm2 save
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true

echo ""
echo "=================================================================="
echo " XONG! Dia chi CO DINH VINH VIEN:"
echo ""
echo "     https://${DOMAIN}"
echo ""
echo " Doi 1-3 phut cho DNS Cloudflare cap nhat roi mo tren trinh duyet."
echo " Tu nay reboot bao nhieu lan dia chi VAN GIU NGUYEN."
echo "=================================================================="
