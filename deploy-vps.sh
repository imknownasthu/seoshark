#!/usr/bin/env bash
# Trien khai SeoShark len VPS Ubuntu mot cach AN TOAN, KHONG dung cham web/tool khac.
# - Chi CAI THEM Node + PM2 (khong dung he thong san co).
# - Luu tai khoan bang FILE (data/users.json), KHONG cai PostgreSQL.
# - KHONG dong vao nginx o buoc nay (de buoc rieng setup-ssl.sh, dung server_name rieng).
# Cach dung (tu trong thu muc repo):  sudo bash deploy-vps.sh [PORT]
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
PORT="${1:-5173}"
APP_NAME=seoshark

echo "==> 0) Thu muc app: ${APP_DIR}   |   Cong: ${PORT}   |   PM2 name: ${APP_NAME}"

# Canh bao neu cong da bi chiem boi tien trinh khac
if command -v ss >/dev/null 2>&1 && ss -tlnp 2>/dev/null | grep -q ":${PORT} "; then
  echo "    [CANH BAO] Cong ${PORT} dang duoc dung boi tien trinh khac!"
  echo "    -> Chay lai voi cong khac, vi du: sudo bash deploy-vps.sh 5273"
  exit 1
fi

echo "==> 1) Cai goi co ban (chi them, khong go gi): curl, git"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl ca-certificates gnupg git

echo "==> 2) Cai Node.js 20 (chi khi chua co hoac qua cu)"
if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 18 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
echo "    Node $(node -v) | npm $(npm -v)"

echo "==> 3) Cai PM2 (trinh giu app chay nen + tu bat lai khi reboot)"
command -v pm2 >/dev/null 2>&1 || npm install -g pm2

echo "==> 4) npm install (cai thu vien cua app)"
cd "${APP_DIR}"
npm install --omit=dev

echo "==> 5) Tao .env (neu chua co) - luu tai khoan bang FILE, khong dung Postgres"
if [ ! -f .env ]; then
  cat > .env <<EOF
PORT=${PORT}
AUTH_ENABLED=true
MAIL_TO=imknownasthu@gmail.com

# === DIEN CAC KEY (lay tu Render -> Environment) ===
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash
BREVO_API_KEY=
BREVO_SENDER=
BREVO_SENDER_NAME=SeoShark
GOOGLE_CSE_KEY=
GOOGLE_CSE_CX=
# Sau khi co HTTPS (chay setup-ssl.sh xong) hay bo dau # dong duoi de cookie bao mat:
# NODE_ENV=production
EOF
  chmod 600 .env
  echo "    -> Da tao .env. NHO mo .env dien cac KEY roi chay: pm2 restart ${APP_NAME}"
else
  # Bao dam PORT trong .env khop voi cong dang dung
  if grep -q "^PORT=" .env; then
    sed -i "s/^PORT=.*/PORT=${PORT}/" .env
  else
    echo "PORT=${PORT}" >> .env
  fi
  echo "    -> .env da ton tai, giu nguyen (chi cap nhat PORT=${PORT})."
fi

# Thu muc luu du lieu tai khoan
mkdir -p "${APP_DIR}/data"

echo "==> 6) Chay app bang PM2 (chi nghe o 127.0.0.1:${PORT}, chua mo ra ngoai)"
pm2 delete "${APP_NAME}" >/dev/null 2>&1 || true
pm2 start server.js --name "${APP_NAME}"
pm2 save
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true

echo ""
echo "=================================================================="
echo " XONG buoc 1! App SeoShark dang chay nen tai cong ${PORT}."
echo " Kiem tra nhanh tren VPS:  curl -I http://127.0.0.1:${PORT}"
echo ""
echo " Buoc tiep theo:"
echo "  1) Mo .env dien cac KEY:   nano ${APP_DIR}/.env   (xong: Ctrl+O, Enter, Ctrl+X)"
echo "     Roi:                     pm2 restart ${APP_NAME}"
echo "  2) Bat ten mien + HTTPS (KHONG dung web khac):"
echo "     sudo bash setup-ssl.sh seoshark.51.79.84.143.sslip.io ${PORT}"
echo "=================================================================="
