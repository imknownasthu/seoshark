// src/social-auto.js
// Tu dong LUU/DANG link tran qua API (khong OAuth) cho:
//  - Diigo  (bookmark, can user+password+apiKey)
//  - Instapaper (read-later, can email+password)
// Telegram dung telegramPost trong autopost.js.

export async function diigoSave({ user, password, apiKey, url, title, desc }) {
  const auth = Buffer.from(`${user}:${password}`).toString("base64");
  const params = new URLSearchParams({
    key: apiKey, url, title: title || "", shared: "yes", desc: (desc || "").slice(0, 250),
  });
  const res = await fetch("https://secure.diigo.com/api/v2/bookmarks", {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const txt = await res.text();
  if (res.status === 401) throw new Error("Diigo: sai username/password.");
  if (res.status === 403) throw new Error("Diigo: API key chưa được duyệt hoặc sai (xin tại diigo.com/api_keys).");
  if (!res.ok) throw new Error(`Diigo HTTP ${res.status}: ${txt.slice(0, 120)}`);
  return { ok: true, link: `https://www.diigo.com/user/${encodeURIComponent(user)}` };
}

export async function instapaperSave({ user, password, url, title }) {
  const auth = Buffer.from(`${user}:${password}`).toString("base64");
  const params = new URLSearchParams({ url, title: title || "" });
  const res = await fetch("https://www.instapaper.com/api/add", {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  if (res.status === 403) throw new Error("Instapaper: sai email hoặc mật khẩu.");
  if (res.status !== 201 && !res.ok) throw new Error(`Instapaper HTTP ${res.status}`);
  return { ok: true, link: "https://www.instapaper.com/u" };
}
