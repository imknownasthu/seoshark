# 🚀 Đưa SeoShark lên Internet

Có 2 cách. Chọn cách phù hợp với nhu cầu:

| | **Cách A — Render.com** | **Cách B — Cloudflare Tunnel** |
|---|---|---|
| Luôn online (máy bạn tắt vẫn chạy) | ✅ Có | ❌ Không — máy bạn phải bật |
| URL cố định | ✅ `seoshark.onrender.com` | ⚠️ Đổi mỗi lần chạy (bản free) |
| Cần tài khoản | GitHub + Render (free) | Không |
| Thời gian setup | ~15 phút (1 lần) | ~3 phút mỗi lần |
| Dùng cho | Lâu dài, chia sẻ nhiều người | Test nhanh, dùng tạm |

---

## CÁCH A — Render.com (khuyên dùng cho lâu dài)

### Bước 1: Đưa code lên GitHub
1. Tạo tài khoản tại https://github.com (miễn phí).
2. Bấm **New repository** → đặt tên `seoshark` → **Create**.
3. Trong repo trống, bấm **uploading an existing file** (hoặc **Add file → Upload files**).
4. Mở thư mục `seoshark` trên máy, **kéo thả TẤT CẢ file & thư mục** vào — **TRỪ thư mục `node_modules`** (không cần, Render tự cài).
   - Cần đẩy: `server.js`, `package.json`, `package-lock.json`, thư mục `src/`, `public/`, `render.yaml`, `.gitignore`.
5. Bấm **Commit changes**.

### Bước 2: Deploy trên Render
1. Tạo tài khoản tại https://render.com → đăng nhập bằng GitHub (không cần thẻ).
2. Bấm **New +** → **Web Service**.
3. Chọn repo `seoshark` vừa tạo → **Connect**.
4. Render tự đọc `render.yaml`. Kiểm tra:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** **Free**
5. Bấm **Create Web Service** → chờ vài phút (xem log đến khi thấy "SeoShark dang chay").
6. Xong! URL của bạn dạng: **`https://seoshark.onrender.com`** — mở từ máy nào cũng được.

### Bước 3 (tùy chọn): Bật gửi mail thật + key Gemini
Trong Render → tab **Environment** → **Add Environment Variable**, thêm:
- `SMTP_USER` = `imknownasthu@gmail.com`
- `SMTP_PASS` = App Password Gmail (xem README mục Đăng nhập)
- (tùy chọn) `GEMINI_API_KEY` = key Gemini free

> ✅ **Giữ tài khoản vĩnh viễn:** đặt biến `DATABASE_URL` (Postgres free từ Neon/Supabase) trong Environment → tài khoản lưu vào DB, **không mất khi deploy lại**. Nếu KHÔNG đặt, tài khoản lưu file `data/users.json` và sẽ bị Render Free xóa mỗi lần deploy. Xem hướng dẫn tạo DB free bên dưới.

### Tạo Postgres free (giữ tài khoản) — Neon
1. Vào https://neon.tech → **Sign up** (bằng Google/GitHub, miễn phí, không cần thẻ).
2. **Create project** (để mặc định) → Neon tạo database.
3. Ở trang dự án, bấm **Connect** → copy **Connection string** (dạng `postgresql://...:...@....neon.tech/...?sslmode=require`).
4. Trong Render → **Environment** → thêm biến `DATABASE_URL` = chuỗi vừa copy → **Save**.
5. Bảng `users` sẽ tự tạo khi server khởi động. Xong — tài khoản lưu vĩnh viễn.

### Bước 3b (tùy chọn): Đặt key Gemini dùng chung
- Trong Render → tab **Environment** → **Add Environment Variable**
- Key: `GEMINI_API_KEY`, Value: key `AIza...` của bạn → **Save**.
- (Nếu bỏ qua, mỗi người tự nhập key trong giao diện, hoặc dùng engine Local miễn phí.)

> ⚠️ **Lưu ý bản Free của Render:** sau ~15 phút không ai dùng, server "ngủ". Lần mở lại đầu tiên chờ ~30 giây để khởi động — sau đó chạy bình thường.

### Cập nhật code sau này
Mỗi khi sửa code: upload lại file lên GitHub (hoặc dùng GitHub Desktop) → Render **tự động deploy lại**.

---

## CÁCH B — Cloudflare Tunnel (nhanh, không cần tài khoản)

Tạo 1 link public trỏ thẳng về server đang chạy trên máy bạn. Máy bạn phải **bật & giữ server chạy**.

### Bước 1: Cài cloudflared (1 lần)
Mở **PowerShell** và chạy:
```powershell
winget install --id Cloudflare.cloudflared
```

### Bước 2: Chạy SeoShark
Mở thư mục `seoshark`, chạy:
```powershell
npm start
```
(hoặc nhấp đúp `start.bat`). Server chạy ở `http://localhost:5173`.

### Bước 3: Mở tunnel
Mở **một cửa sổ PowerShell khác**, chạy:
```powershell
cloudflared tunnel --url http://localhost:5173
```
Sau vài giây sẽ hiện một dòng dạng:
```
https://random-words-1234.trycloudflare.com
```
👉 Đó là link công khai — gửi cho ai cũng mở được (khi máy bạn còn bật).

> Mỗi lần chạy lại lệnh sẽ tạo link mới (bản miễn phí). Muốn link cố định cần đăng ký domain với Cloudflare (nâng cao).

### Cách khác tương tự: ngrok
```powershell
winget install --id ngrok.ngrok
ngrok http 5173
```
(ngrok cần đăng ký tài khoản free để lấy token.)

---

## ⚠️ Bảo mật khi public
Khi đưa lên internet, **bất kỳ ai có link đều dùng được** công cụ. Vì:
- Engine **Local** miễn phí (chỉ tốn CPU server) — an toàn.
- Nếu bạn đặt sẵn `GEMINI_API_KEY` trên server, người khác dùng sẽ tiêu hạn mức key của bạn. Muốn riêng tư, **đừng đặt key trên server** — để mỗi người tự nhập key của họ trong giao diện.
- Cần giới hạn truy cập (mật khẩu)? Báo tôi, sẽ thêm lớp đăng nhập đơn giản.
