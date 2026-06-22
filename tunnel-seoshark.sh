#!/usr/bin/env bash
# Mo SeoShark ra Internet qua Cloudflare Tunnel.
# Hop voi VPS NAT (khong can port forwarding, khong dung VoiceSocial). Tu chay lai khi reboot.
# Dung: sudo bash tunnel-seoshark.sh
set -uo pipefail
PORT=5173

echo "==> 1) Tai cloudflared (neu chua co)"
if ! command -v cloudflared >/dev/null 2>&1; then
  ARCH=$(uname -m)
  case "$ARCH" in
    x86_64)        CF=amd64;;
    aarch64|arm64) CF=arm64;;
    *)             CF=amd64;;
  esac
  curl -L -o /usr/local/bin/cloudflared \
    "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${CF}"
  chmod +x /usr/local/bin/cloudflared
fi
echo "    $(cloudflared --version 2>/dev/null | head -1)"

echo "==> 2) Kiem tra SeoShark dang chay o cong ${PORT}"
if ! curl -s -m 5 "http://127.0.0.1:${PORT}" | grep -qi "SeoShark"; then
  echo "    [CANH BAO] Khong thay SeoShark o 127.0.0.1:${PORT}. Chay: pm2 restart seoshark"
fi

echo "==> 3) Khoi dong tunnel bang PM2 (tu chay lai khi reboot)"
pm2 delete seoshark-tunnel >/dev/null 2>&1 || true
pm2 start cloudflared --name seoshark-tunnel -- tunnel --url "http://localhost:${PORT}"
pm2 save >/dev/null 2>&1 || true
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true

echo "==> 4) Doi Cloudflare cap dia chi (khoang 20 giay)..."
sleep 20
URL=$(pm2 logs seoshark-tunnel --lines 80 --nostream 2>/dev/null \
      | grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" | tail -1)
echo ""
echo "=================================================================="
if [ -n "${URL}" ]; then
  echo " XONG! DIA CHI WEB CONG KHAI CUA SEOSHARK:"
  echo ""
  echo "     ${URL}"
  echo ""
  echo " Mo dia chi nay tren trinh duyet (may nao cung vao duoc) -> dung SeoShark."
else
  echo " Tunnel dang khoi dong, chua kip lay dia chi. Doi them 10 giay roi chay:"
  echo "   pm2 logs seoshark-tunnel --lines 80 --nostream | grep trycloudflare"
fi
echo "=================================================================="
