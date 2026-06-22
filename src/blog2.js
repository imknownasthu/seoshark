// src/blog2.js
// Ho tro tinh nang tu dong dang Blog 2.0:
//  - slugify: slug SACH (khong dau, khong so) tu tieu de
//  - mdToHtml: doi Markdown -> HTML don gian (cho WordPress)
//  - pollinationsImage: URL anh AI MIEN PHI (khong can key)
//  - postWordPress / postDevto / postHashnode: dang bai qua API chinh thuc

export function slugify(title) {
  let s = String(title || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
  s = s.replace(/đ/g, "d").replace(/Đ/g, "d").toLowerCase();
  s = s.replace(/[^a-z\s-]/g, " ");          // bo so + ky tu dac biet (khong so)
  s = s.trim().replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return s.slice(0, 80) || "bai-viet";
}

export function pollinationsImage(prompt) {
  const p = encodeURIComponent(String(prompt || "dental clinic blog illustration").slice(0, 300));
  return `https://image.pollinations.ai/prompt/${p}?width=1024&height=576&nologo=true`;
}

export function mdToHtml(md) {
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (t) =>
    esc(t)
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%;height:auto;border-radius:8px" />')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>");
  const lines = String(md || "").split(/\r?\n/);
  let html = "", inList = false;
  const closeList = () => { if (inList) { html += "</ul>"; inList = false; } };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { closeList(); continue; }
    let m;
    if ((m = line.match(/^###\s+(.*)/))) { closeList(); html += `<h3>${inline(m[1])}</h3>`; }
    else if ((m = line.match(/^##\s+(.*)/))) { closeList(); html += `<h2>${inline(m[1])}</h2>`; }
    else if ((m = line.match(/^#\s+(.*)/))) { closeList(); html += `<h2>${inline(m[1])}</h2>`; }
    else if ((m = line.match(/^[-*]\s+(.*)/))) { if (!inList) { html += "<ul>"; inList = true; } html += `<li>${inline(m[1])}</li>`; }
    else { closeList(); html += `<p>${inline(line)}</p>`; }
  }
  closeList();
  return html;
}

// Chen anh (markdown) vao sau doan dau tien
export function insertImage(md, imageUrl, alt) {
  const imgMd = `\n\n![${(alt || "minh hoa").replace(/[\[\]]/g, "")}](${imageUrl})\n\n`;
  const parts = String(md || "").split(/\n\s*\n/);
  if (parts.length <= 1) return (md || "") + imgMd;
  // chen sau doan 1 (hoac sau heading dau + doan 1)
  let idx = 1;
  if (/^#{1,3}\s/.test(parts[0].trim()) && parts.length > 2) idx = 2;
  parts.splice(idx, 0, imgMd.trim());
  return parts.join("\n\n");
}

// ===== Dang bai =====
export async function postWordPress({ site, user, appPassword, title, html, slug }) {
  const base = String(site).replace(/\/+$/, "");
  const auth = Buffer.from(`${user}:${appPassword}`).toString("base64");
  const res = await fetch(`${base}/wp-json/wp/v2/posts`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
    body: JSON.stringify({ title, content: html, status: "publish", slug }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d?.message || `WordPress HTTP ${res.status}`);
  return { link: d.link || `${base}/?p=${d.id}` };
}

export async function postDevto({ apiKey, title, markdown, mainImage }) {
  const article = { title, body_markdown: markdown, published: true };
  if (mainImage) article.main_image = mainImage;
  const res = await fetch("https://dev.to/api/articles", {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": apiKey },
    body: JSON.stringify({ article }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d?.error || (d?.errors ? JSON.stringify(d.errors) : `Dev.to HTTP ${res.status}`));
  return { link: d.url };
}

export async function postHashnode({ token, publicationId, title, markdown, tags }) {
  const query = `mutation Publish($input: PublishPostInput!) { publishPost(input: $input) { post { url } } }`;
  const input = { title, contentMarkdown: markdown, publicationId, tags: Array.isArray(tags) ? tags : [] };
  const res = await fetch("https://gql.hashnode.com/", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: token },
    body: JSON.stringify({ query, variables: { input } }),
  });
  const d = await res.json().catch(() => ({}));
  if (d?.errors) throw new Error(d.errors[0]?.message || "Hashnode error");
  return { link: d?.data?.publishPost?.post?.url };
}
