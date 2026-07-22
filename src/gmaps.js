// src/gmaps.js
// Doc thong tin co ban tu link Google Maps rut gon (maps.app.goo.gl / goo.gl/maps).
// KHONG dung API tra phi. Dung fetchHtml (co fallback https chiu loi TLS/nen) vi plain fetch
// hay "fetch failed" voi Google. Parse tu HTML: ten (og:title / /place/), toa do, dia chi (og).
// Chi lay muc CO BAN -> nguoi dung xem lai & bo sung.

import { fetchHtml } from "./extract.js";

function ogMeta(html, prop) {
  const re1 = new RegExp(`<meta[^>]+property=["']og:${prop}["'][^>]+content=["']([^"']+)["']`, "i");
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:${prop}["']`, "i");
  const m = re1.exec(html) || re2.exec(html);
  return m ? m[1].replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/\\u0026/g, "&").trim() : "";
}

function fromMapsUrl(u, out) {
  const placeM = /\/place\/([^/@]+)/.exec(u);
  if (placeM && !out.name) { try { out.name = decodeURIComponent(placeM[1].replace(/\+/g, " ")).trim(); } catch { out.name = placeM[1].replace(/\+/g, " "); } }
  const atM = /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(u);
  if (atM && !out.coords) out.coords = `${atM[1]},${atM[2]}`;
}

export async function readMapLink(url) {
  const clean = String(url || "").trim();
  if (!/^https?:\/\//i.test(clean)) throw new Error("Link map không hợp lệ (cần bắt đầu http/https).");

  let html = "";
  try { html = await fetchHtml(clean, { timeout: 15000 }); }
  catch (e) { throw new Error("Không mở được link map: " + (e.message || e)); }

  const out = { name: "", address: "", area: "", coords: "", category: "", finalUrl: clean, raw: "" };

  // 1) URL maps day du nam trong HTML (co /place/<ten>/@lat,lng)
  const mapsUrlM = /https?:\/\/(?:www\.)?google\.com\/maps\/place\/[^"'\\ )<]+/i.exec(html);
  if (mapsUrlM) { const u = mapsUrlM[0].replace(/&amp;/g, "&").replace(/\\u003d/g, "="); out.finalUrl = u; fromMapsUrl(u, out); }

  // 2) og:title -> ten ; og:description -> dia chi
  const title = ogMeta(html, "title");
  const desc = ogMeta(html, "description");
  if (!out.name && title) out.name = title.split("·")[0].split(" - ")[0].trim();

  // 3) Toa do: mau !3d<lat>!4d<lng> (trong data url) hoac @lat,lng
  if (!out.coords) {
    const c = /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/.exec(html) || /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(html);
    if (c) out.coords = `${c[1]},${c[2]}`;
  }

  // 4) Dia chi tu og:description (neu co)
  if (desc && !/find local businesses|google maps/i.test(desc)) {
    out.raw = desc;
    const parts = desc.split(/[·|]/).map((s) => s.trim()).filter(Boolean);
    const addr = parts.find((p) => /\d/.test(p) && /,|đường|phố|street|quận|phường|district|ward/i.test(p));
    if (addr) out.address = addr;
    const cat = parts.find((p) => p && p !== out.name && p !== out.address && !/★|☆|\d{2,}|,/.test(p) && p.length < 40);
    if (cat) out.category = cat;
  }

  if (out.address) {
    const segs = out.address.split(",").map((s) => s.trim());
    if (segs.length >= 2) out.area = segs.slice(-2).join(", ");
  }
  return out;
}
