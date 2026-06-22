// src/autopost.js
// Tu dong dang THAT (0 thao tac) cho cac nen co API khong can app duyet:
//  - Telegra.ph: tao 1 trang chua noi dung + link bai goc (backlink). KHONG can dang nhap.
//  - Telegram: dang vao kenh/nhom qua Bot API (can bot token + chat id).

async function tgphCall(method, params) {
  const body = new URLSearchParams(params);
  const res = await fetch(`https://api.telegra.ph/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const d = await res.json();
  if (!d || !d.ok) throw new Error((d && d.error) || "Telegra.ph lỗi");
  return d.result;
}

export async function telegraphPublish({ title, authorName, caption, url, image }) {
  const acc = await tgphCall("createAccount", { short_name: "SeoShark", author_name: authorName || "SeoShark" });
  const token = acc.access_token;
  const content = [];
  String(caption || "").split(/\n+/).forEach((line) => { if (line.trim()) content.push({ tag: "p", children: [line.trim()] }); });
  if (image) content.push({ tag: "figure", children: [{ tag: "img", attrs: { src: image } }] });
  content.push({ tag: "p", children: [{ tag: "a", attrs: { href: url, target: "_blank" }, children: ["👉 Đọc bài viết gốc: " + url] }] });
  const page = await tgphCall("createPage", {
    access_token: token,
    title: (title || "Bài viết").slice(0, 256),
    author_name: authorName || "SeoShark",
    content: JSON.stringify(content),
    return_content: "false",
  });
  return { url: page.url };
}

export async function telegramPost({ token, chatId, caption, image }) {
  const apiBase = `https://api.telegram.org/bot${String(token).trim()}`;
  const cid = String(chatId).trim();
  let res;
  if (image) {
    res = await fetch(`${apiBase}/sendPhoto`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: cid, photo: image, caption: String(caption || "").slice(0, 1024) }),
    });
  } else {
    res = await fetch(`${apiBase}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: cid, text: String(caption || ""), disable_web_page_preview: false }),
    });
  }
  const d = await res.json();
  if (!d || !d.ok) throw new Error((d && d.description) || "Telegram lỗi");
  const m = d.result || {};
  let link = "";
  if (cid.startsWith("@") && m.message_id) link = `https://t.me/${cid.slice(1)}/${m.message_id}`;
  return { ok: true, link, messageId: m.message_id || null };
}
