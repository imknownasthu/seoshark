# 🦈 SeoShark

Bộ công cụ hỗ trợ SEO. Hiện có 2 tính năng (2 tab trong giao diện):
- **🔗 Internal Link** — chèn liên kết nội bộ *trong* một bài viết.
- **🔁 Incoming Link** — chèn liên kết từ *các bài khác trỏ về* một URL đích.

## Tính năng Internal Link

1. Nhập **URL bài viết** → công cụ đọc toàn bộ nội dung, tách thành các đoạn, tự nhận diện **sapo** (mở bài) và **đoạn kết** để khóa lại (không chèn link vào đó).
2. Nạp danh sách URL đích từ **sitemap.xml** của site (tự dò, hỗ trợ sitemap index) + cho phép bổ sung URL thủ công.
3. Chọn 1 trong 2 phương án:
   - **Phương án 1 — Tự động:** nhập số lượng link muốn chèn, công cụ tự chọn vị trí phù hợp nhất.
   - **Phương án 2 — Theo từ khóa:** bạn cung cấp từ khóa (và URL đích nếu muốn), công cụ tìm vị trí hợp lý; nếu chưa có chỗ phù hợp sẽ **viết thêm một câu/ý** để triển khai link tự nhiên.
4. Xuất kết quả **2 phiên bản (trước / sau)** ở cả **HTML** và **Markdown**, kèm **bảng đối chiếu** anchor → URL → ngữ cảnh.

### Tiêu chí đảm bảo
- Nội dung sau khi chèn rõ ràng, đúng nghĩa, dễ đọc.
- Không chèn link ở sapo và đoạn kết.
- Link đúng ngữ cảnh; mỗi URL đích chỉ chèn 1 lần; anchor đa dạng, không nhồi nhét.
- Backend kiểm tra lại (defense-in-depth): mọi đề xuất vi phạm sapo/kết bài đều bị loại và báo rõ.

## Tính năng Incoming Link (bài khác trỏ về)

Tăng liên kết *đến* một URL đích bằng cách chèn link từ các bài cùng chủ đề.

1. Nhập **URL đích** (bài muốn nhận incoming link) → công cụ đọc nội dung & nạp sitemap.
2. **Bước 1 — Chọn bài nguồn:** công cụ **gợi ý các bài cùng chủ đề** (xếp hạng theo độ liên quan tiêu đề/slug với URL đích) kèm điểm. Bạn **tick chọn** bài muốn dùng, hoặc **thêm URL thủ công**.
3. Đặt **anchor text** cho từng bài (để trống = dùng *anchor mặc định*). Mỗi bài nguồn chèn 1 link trỏ về URL đích.
4. **Bước 2 — Chèn:** công cụ đọc nội dung từng bài nguồn, chèn link đúng ngữ cảnh (không vào sapo/kết; chưa có chỗ thì viết thêm câu).
5. Kết quả theo **từng URL nguồn**: cho biết **đoạn nào đã chèn** + bản sau (HTML/Markdown) để copy.

> Giới hạn **10 bài/lần** để tránh chậm & dính rate limit của Gemini free.

## Cách chạy

### Cách nhanh (Windows)
Nhấp đúp **`start.bat`** — script tự cài dependencies (lần đầu) và mở trình duyệt.

### Cách thủ công
```bash
npm install
npm start
```
Mở http://localhost:5173

### Engine xử lý (3 lựa chọn — mặc định MIỄN PHÍ)
Vào mục **⚙️ Engine xử lý** trong giao diện để chọn:

| Engine | Chi phí | Cần gì | Chất lượng |
|--------|---------|--------|-----------|
| 🟢 **Local** (mặc định) | **Miễn phí**, offline | Không cần gì | Khá — khớp từ khóa có sẵn trong bài |
| ✨ **Gemini** | **Miễn phí** | Free key (không cần thẻ) | Cao — chèn tự nhiên, tự viết thêm câu |
| 🤖 **Claude** | Trả phí | Key Anthropic | Cao nhất |

- **Local**: mở lên dùng ngay, không cần tài khoản/key.
- **Gemini (free)**: lấy key miễn phí tại https://aistudio.google.com/app/apikey (không cần thẻ, không nạp tiền) → dán vào giao diện. Nếu chọn Gemini mà chưa có key, công cụ **tự fallback về Local**.
- Key có thể dán trong giao diện (lưu ở trình duyệt) hoặc đặt trong file `.env`.

## Cấu trúc

```
seoshark/
├─ server.js            # Express server + API
├─ src/
│  ├─ extract.js        # Đọc & tách nội dung bài viết (Readability), nhận diện sapo/kết
│  ├─ sitemap.js        # Đọc sitemap.xml, xếp hạng URL đích theo độ liên quan
│  ├─ prompt.js         # Prompt + tiêu chí dùng chung cho các engine AI
│  ├─ local.js          # Engine LOCAL (offline, không cần key) — mặc định
│  ├─ gemini.js         # Engine Gemini (free key)
│  └─ claude.js         # Engine Claude (trả phí, tùy chọn)
├─ public/              # Giao diện web (HTML/CSS/JS)
├─ .env.example
└─ start.bat
```

## Đăng nhập & tài khoản
Công cụ yêu cầu đăng nhập (email + mật khẩu) trước khi dùng.

**Cách tạo tài khoản (cơ chế chủ sở hữu duyệt):**
1. Người dùng bấm **Tạo tài khoản**, nhập họ tên + email + mật khẩu.
2. Một **mã xác nhận 6 số** được gửi tới **imknownasthu@gmail.com** (hộp thư chủ sở hữu).
3. Chủ sở hữu xem mã và đưa cho người được phép → người đó nhập mã để hoàn tất tạo tài khoản.

> Tài khoản lưu tại `data/users.json` (mật khẩu được hash scrypt). Phiên đăng nhập giữ 7 ngày qua cookie.

### Chế độ gửi mã
- **TEST (mặc định):** mã hiện ở **console/log của server** và ghi vào `data/outbox.log` (không gửi mail thật). Dùng để chạy thử ngay.
- **Gửi mail thật qua Gmail:**
  1. Bật **xác minh 2 bước (2FA)** cho `imknownasthu@gmail.com`.
  2. Tạo **App Password**: https://myaccount.google.com/apppasswords
  3. Mở `.env`, điền:
     ```
     SMTP_USER=imknownasthu@gmail.com
     SMTP_PASS=<app-password-16-ky-tu>
     ```
  4. Khởi động lại server → mã sẽ gửi thật về hộp thư.

> Muốn tắt đăng nhập (dùng tự do): đặt `AUTH_ENABLED=false` trong `.env`.

## Logo
Giao diện dùng ảnh `public/logo.png`. Hãy lưu logo Shark Dental Clinic của bạn vào đúng đường dẫn **`seoshark/public/logo.png`**. Nếu chưa có file, công cụ tự hiển thị logo SVG dự phòng.

## Đưa lên Internet (dùng từ máy khác)
Xem hướng dẫn chi tiết trong [DEPLOY.md](DEPLOY.md): 2 cách — **Render.com** (host miễn phí, luôn online) và **Cloudflare Tunnel** (nhanh, máy phải bật).

## Lộ trình (các tính năng SEO tiếp theo)
Cấu trúc đã tách module sẵn để bổ sung: audit on-page, gợi ý từ khóa, kiểm tra meta/heading, phân tích đối thủ…
