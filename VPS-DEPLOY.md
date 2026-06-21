# 🖥️ Triển khai SeoShark lên VPS (Ubuntu)

VPS chạy mượt hơn Render free (không "ngủ"). Hướng dẫn: Node + PM2 + PostgreSQL (local) + Nginx, gắn domain + HTTPS sau.

## Bước 1 — Cài & chạy (1 lần)
SSH vào VPS rồi chạy:

```bash
cd /root
git clone https://github.com/imknownasthu/seoshark.git
cd seoshark
sudo bash deploy-vps.sh
```

Script tự: cài Node 20, PM2, PostgreSQL (tạo DB `seoshark`), Nginx (proxy cổng 80 → 5173), khởi động app, bật tự chạy lại khi reboot.

## Bước 2 — Điền API key
```bash
nano /root/seoshark/.env
```
Điền (lấy lại từ Render → Environment):
- `GEMINI_API_KEY`, `BREVO_API_KEY`, `BREVO_SENDER`, `GOOGLE_CSE_KEY`, `GOOGLE_CSE_CX`
- `DATABASE_URL` đã tự điền (Postgres local) — không cần sửa.

Lưu (Ctrl+O, Enter, Ctrl+X) rồi:
```bash
pm2 restart seoshark
```
Mở **http://IP_VPS** → công cụ chạy.

## Bước 3 — Gắn domain (khi đã mua)
1. Tại nơi quản lý DNS của domain, thêm **bản ghi A**:
   - `@`  →  `51.79.84.143` (IP VPS)
   - `www` → `51.79.84.143`
2. Chờ DNS cập nhật (vài phút–vài giờ). Kiểm tra: `ping yourdomain.com` ra IP VPS.
3. Trên VPS, bật HTTPS (Let's Encrypt miễn phí):
```bash
certbot --nginx -d yourdomain.com -d www.yourdomain.com
```
4. Bật cookie bảo mật cho HTTPS:
```bash
echo "NODE_ENV=production" >> /root/seoshark/.env
pm2 restart seoshark
```
Xong — mở **https://yourdomain.com**.

## Cập nhật code sau này
```bash
cd /root/seoshark && git pull && npm install && pm2 restart seoshark
```

## Lệnh hữu ích
- Xem log: `pm2 logs seoshark`
- Trạng thái: `pm2 status`
- Khởi động lại: `pm2 restart seoshark`
- Sao lưu DB: `sudo -u postgres pg_dump seoshark > backup.sql`
