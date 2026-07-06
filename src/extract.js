// src/extract.js
// Fetch mot URL, trich xuat noi dung bai viet chinh va tach thanh cac "block"
// (doan van / tieu de / list item) de phuc vu viec chen internal link.

import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36 SeoShark/0.1";

export async function fetchHtml(url, { timeout = 15000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: ctrl.signal,
    });
    if (!res.ok) {
      throw new Error(`Khong tai duoc URL (HTTP ${res.status}) - ${url}`);
    }
    return await res.text();
  } catch (e) {
    if (e.name === "AbortError") throw new Error(`Tai URL qua lau (>${Math.round(timeout / 1000)}s) - ${url}`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// Chuyen inner HTML cua mot block thanh markdown inline (giu lien ket & in dam/nghieng)
function inlineHtmlToMarkdown(html) {
  const dom = new JSDOM(`<div id="r">${html}</div>`);
  const root = dom.window.document.getElementById("r");

  const walk = (node) => {
    let out = "";
    for (const child of node.childNodes) {
      if (child.nodeType === 3) {
        out += child.textContent;
      } else if (child.nodeType === 1) {
        const tag = child.tagName.toLowerCase();
        const inner = walk(child);
        if (tag === "a") {
          const href = child.getAttribute("href") || "";
          out += `[${inner}](${href})`;
        } else if (tag === "strong" || tag === "b") {
          out += `**${inner}**`;
        } else if (tag === "em" || tag === "i") {
          out += `*${inner}*`;
        } else if (tag === "br") {
          out += "\n";
        } else {
          out += inner;
        }
      }
    }
    return out;
  };
  return walk(root).replace(/\s+/g, " ").trim();
}

function blockToMarkdown(block) {
  const md = inlineHtmlToMarkdown(block.html);
  switch (block.tag) {
    case "h1":
      return `# ${md}`;
    case "h2":
      return `## ${md}`;
    case "h3":
      return `### ${md}`;
    case "h4":
      return `#### ${md}`;
    case "h5":
    case "h6":
      return `##### ${md}`;
    case "li":
      return block.ordered ? `1. ${md}` : `- ${md}`;
    case "blockquote":
      return `> ${md}`;
    default:
      return md;
  }
}

// Render mot block ra HTML hoan chinh
export function blockToHtml(block) {
  if (block.tag === "li") {
    return `<li>${block.html}</li>`;
  }
  return `<${block.tag}>${block.html}</${block.tag}>`;
}

// Ghep cac block thanh 1 chuoi HTML (gom <ul>/<ol> cho cac li lien tiep)
export function blocksToHtml(blocks) {
  let out = "";
  let i = 0;
  while (i < blocks.length) {
    const b = blocks[i];
    if (b.tag === "li") {
      const ordered = b.ordered;
      const wrap = ordered ? "ol" : "ul";
      out += `<${wrap}>`;
      while (i < blocks.length && blocks[i].tag === "li" && !!blocks[i].ordered === !!ordered) {
        out += `<li>${blocks[i].html}</li>`;
        i++;
      }
      out += `</${wrap}>`;
    } else {
      out += blockToHtml(b);
      i++;
    }
  }
  return out;
}

export function blocksToMarkdown(blocks) {
  return blocks.map(blockToMarkdown).join("\n\n");
}

// Tu noi dung HTML (da lam sach boi Readability), tach ra mang block.
function extractBlocks(contentHtml, doc) {
  const dom = new JSDOM(`<body>${contentHtml}</body>`);
  const body = dom.window.document.body;
  const blocks = [];
  const SELECTOR = "p, h1, h2, h3, h4, h5, h6, li, blockquote";

  body.querySelectorAll(SELECTOR).forEach((el) => {
    const tag = el.tagName.toLowerCase();
    // Bo qua li chua block long nhau (de tranh trung lap, chi lay li la)
    if (tag === "li" && el.querySelector("p, ul, ol, li")) return;
    const text = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (!text) return;
    const block = {
      i: blocks.length,
      tag,
      html: el.innerHTML.trim(),
      text,
    };
    if (tag === "li") {
      const parent = el.parentElement;
      block.ordered = parent && parent.tagName.toLowerCase() === "ol";
    }
    blocks.push(block);
  });

  return blocks;
}

// Heuristic: danh dau block nao la sapo (mo bai) va doan ket (ket bai)
function markStructure(blocks) {
  const paraIdx = blocks
    .map((b, idx) => (b.tag === "p" ? idx : -1))
    .filter((x) => x >= 0);

  // Sapo = doan van dau tien
  const sapoIndex = paraIdx.length ? paraIdx[0] : -1;

  // Doan ket: cac doan van sau tieu de "ket luan / tong ket / loi ket..."
  const CONCLUSION_RE =
    /^(k[eế]t lu[aậ]n|t[oổ]ng k[eế]t|l[oờ]i k[eế]t|t[oổ]ng h[oợ]p|tóm l[aạ]i|k[eế]t)/i;
  let conclusionStart = -1;
  for (let k = blocks.length - 1; k >= 0; k--) {
    if (/^h[1-6]$/.test(blocks[k].tag) && CONCLUSION_RE.test(blocks[k].text)) {
      conclusionStart = k;
      break;
    }
  }

  // Neu khong tim thay tieu de ket luan -> coi doan van cuoi cung la doan ket
  const conclusionIdx = new Set();
  if (conclusionStart >= 0) {
    for (let k = conclusionStart; k < blocks.length; k++) conclusionIdx.add(k);
  } else if (paraIdx.length) {
    conclusionIdx.add(paraIdx[paraIdx.length - 1]);
  }

  return blocks.map((b) => ({
    ...b,
    isSapo: b.i === sapoIndex,
    isConclusion: conclusionIdx.has(b.i),
  }));
}

export async function extractArticle(url) {
  const html = await fetchHtml(url);
  const dom = new JSDOM(html, { url });
  const doc = dom.window.document;

  const titleTag = (doc.querySelector("title")?.textContent || "").trim();

  const reader = new Readability(doc.cloneNode(true));
  const article = reader.parse();

  if (!article || !article.content) {
    throw new Error(
      "Khong trich xuat duoc noi dung bai viet tu URL nay. URL co the khong phai trang bai viet hoac bi chan."
    );
  }

  let blocks = extractBlocks(article.content);
  blocks = markStructure(blocks);

  const u = new URL(url);
  const wordCount = (article.textContent || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

  return {
    url,
    domain: `${u.protocol}//${u.host}`,
    host: u.host,
    title: (article.title || titleTag || "").trim(),
    excerpt: (article.excerpt || "").trim(),
    siteName: article.siteName || "",
    wordCount,
    blockCount: blocks.length,
    blocks,
    beforeHtml: blocksToHtml(blocks),
    beforeMarkdown: blocksToMarkdown(blocks),
  };
}
