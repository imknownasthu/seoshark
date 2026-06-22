# 🖥️ Đưa SeoShark lên VPS — AN TOÀN, không đụng web/tool khác

Cách làm này **chỉ cài thêm** (Node + PM2), **không gỡ/sửa** gì của VPS, đặt app trong **thư mục riêng** `/opt/seoshark`, dùng **tên miền riêng** nên không chiếm cổng của site khác.

- App chạy nền ở `127.0.0.1:5173` (PM2 tên `seoshark`).
- Tài khoản lưu bằng **file** (`data/users.json`) — không cần PostgreSQL.
- Truy cập qua `https://seoshark.51.79.84.143.sslip.io` (tên miền miễn phí + HTTPS).

---

## Bước 1 — Tải code về thư mục riêng & chạy app
SSH vào VPS rồi chạy từng dòng:

```bash
sudo git clone https://github.com/imknownasthu/seoshark.git /opt/seoshark
cd /opt/seoshark
sudo bash deploy-vps.sh
```

Script tự: cài Node 20 + PM2 (nếu chưa có), `npm install`, tạo `.env`, chạy app bằng PM2, bật tự khởi động lại khi reboot. **Không** động vào nginx hay web khác.

Kiểm tra app sống: `curl -I http://127.0.0.1:5173` → thấy `HTTP/1.1 200` hoặc `302`.

## Bước 2 — Điền API key
```bash
sudo nano /opt/seoshark/.env
```
Điền (lấy lại từ Render → Environment): `GEMINI_API_KEY`, `BREVO_API_KEY`, `BREVO_SENDER`, `GOOGLE_CSE_KEY`, `GOOGLE_CSE_CX`.
Lưu: **Ctrl+O → Enter → Ctrl+X**. Rồi:
```bash
pm2 restart seoshark
```

## Bước 3 — Bật tên miền + HTTPS (chỉ thêm 1 khối nginx riêng)
```bash
cd /opt/seoshark
sudo bash setup-ssl.sh seoshark.51.79.84.143.sslip.io 5173
```
Script tự cài nginx/certbot (nếu thiếu), tạo file cấu hình **riêng** `/etc/nginx/conf.d/seoshark.conf` với `server_name` đúng domain (KHÔNG dùng `default_server`), xin chứng chỉ SSL miễn phí. Xong → mở **https://seoshark.51.79.84.143.sslip.io**.

Bật cookie bảo mật cho HTTPS:
```bash
echo "NODE_ENV=production" >> /opt/seoshark/.env
pm2 restart seoshark
```

---

## Cập nhật code sau này
```bash
cd /opt/seoshark && sudo git pull && npm install --omit=dev && pm2 restart seoshark
```

## Lệnh hữu ích
- Xem log app: `pm2 logs seoshark`
- Trạng thái: `pm2 status`
- Khởi động lại: `pm2 restart seoshark`
- Xem các "khối" nginx đang có (để chắc không đụng nhau): `ls /etc/nginx/conf.d/ /etc/nginx/sites-enabled/`
- Sao lưu tài khoản: `cp /opt/seoshark/data/users.json ~/users-backup.json`

## Gỡ bỏ hoàn toàn SeoShark (nếu cần) — không ảnh hưởng web khác
```bash
pm2 delete seoshark && pm2 save
sudo rm -f /etc/nginx/conf.d/seoshark.conf && sudo systemctl reload nginx
sudo rm -rf /opt/seoshark
```
