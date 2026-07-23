// src/gemini.js
// Engine Gemini (Google AI Studio) - API key MIEN PHI, khong can the/credit.
// Lay key: https://aistudio.google.com/app/apikey

import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt.js";

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    edits: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          blockIndex: { type: "INTEGER" },
          newHtml: { type: "STRING" },
          anchor: { type: "STRING" },
          targetUrl: { type: "STRING" },
          keyword: { type: "STRING" },
          addedContent: { type: "BOOLEAN" },
          reason: { type: "STRING" },
        },
        required: ["blockIndex", "newHtml", "anchor", "targetUrl", "addedContent", "reason"],
      },
    },
    notes: { type: "STRING" },
  },
  required: ["edits"],
};

// Kiem tra key Gemini con dung khong (nhe, khong ton quota generate)
export async function geminiPing(apiKey) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`);
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new Error(d?.error?.message || `HTTP ${r.status}`);
  }
  return true;
}

// Liet ke TOAN BO model Gemini flash MIEN PHI cua chinh API key, xep hang CAO -> THAP.
// Dung lam "chuoi tut model": het luot free o model cao thi tu chuyen xuong model ke tiep.
export async function listFreeGeminiModels(apiKey) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`);
  if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d?.error?.message || `HTTP ${r.status}`); }
  const d = await r.json();
  const cands = (d.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
    .map((m) => String(m.name || "").replace(/^models\//, ""))
    // Chi lay Gemini *flash* (free). Loai pro (can billing) + cac ban dac biet/nho.
    .filter((n) => /^gemini-\d/.test(n) && /flash/.test(n) && !/pro|thinking|exp\b|vision|embedding|aqa|imagen|-tts|learnlm|gemma|-8b/i.test(n));
  const score = (n) => {
    const vm = /gemini-(\d+)\.(\d+)/.exec(n);
    const ver = vm ? parseInt(vm[1]) * 100 + parseInt(vm[2]) : 0;   // 3.6 -> 306, 3.5 -> 305
    const stable = /preview|latest/i.test(n) ? 0 : 40;              // uu tien ban on dinh
    const full = /flash-lite/i.test(n) ? 0 : 20;                    // uu tien flash day du hon flash-lite
    const base = /^gemini-\d+\.\d+-flash(-lite)?$/i.test(n) ? 10 : 0; // ten goc (alias -> luon tro ban moi nhat)
    return ver * 1000 + stable + full + base;
  };
  // Loai trung + bo alias "-latest" khi da co ban goc (tranh tut xuong dung 1 model 2 lan)
  const uniq = [...new Set(cands)];
  uniq.sort((a, b) => score(b) - score(a));
  return uniq;
}

// Tu dong chon model Gemini CAO NHAT & MIEN PHI (flash) tu danh sach model cua chinh API key.
// Khi Google ra model moi (vd 3.6-flash) -> tu dong dung, khong can sua code. Fallback 3.5-flash.
export async function pickBestGeminiModel(apiKey) {
  const list = await listFreeGeminiModels(apiKey);
  return list[0] || "gemini-3.5-flash";
}

// "Va" JSON bi cat cut (do dung gioi han output): dong lai cac object/array con dang mo
// sau phan tu HOAN CHINH cuoi cung, de van lay duoc ket qua mot phan thay vi crash ca lo.
export function closeTruncatedJson(text) {
  let inStr = false, esc = false, lastClose = -1;
  const st = [];
  const snapshots = {};
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") st.push("}");
    else if (c === "[") st.push("]");
    else if (c === "}" || c === "]") {
      st.pop();
      if (c === "}") { lastClose = i; snapshots[i] = st.slice(); } // moc: 1 object vua dong tron ven
    }
  }
  if (lastClose < 0) return null;
  const closers = (snapshots[lastClose] || []).slice().reverse().join("");
  return text.slice(0, lastClose + 1) + closers;
}

// Parse JSON, tu dong va neu bi cat cut
function parseJsonResilient(text, finishReason) {
  try { return JSON.parse(text); } catch (e) {
    const repaired = closeTruncatedJson(text);
    if (repaired) { try { return JSON.parse(repaired); } catch {} }
    if (finishReason === "MAX_TOKENS")
      throw new Error("Gemini bi cat do vuot gioi han do dai (thu giam so tu moi lo).");
    throw e;
  }
}

// Chuyen JSON Schema (type chu thuong) -> Gemini schema (type CHU HOA)
function toGeminiSchema(s) {
  if (!s || typeof s !== "object") return s;
  const out = {};
  for (const [k, v] of Object.entries(s)) {
    if (k === "type" && typeof v === "string") out[k] = v.toUpperCase();
    else if (k === "properties") {
      out.properties = {};
      for (const [pk, pv] of Object.entries(v)) out.properties[pk] = toGeminiSchema(pv);
    } else if (k === "items") out.items = toGeminiSchema(v);
    else out[k] = v;
  }
  return out;
}

// Goi Gemini tra ve JSON theo schema (dung cho On-page va cac tac vu khac)
export async function geminiJson({ apiKey, model, system, user, schema, maxTokens = 16384, timeout = 60000, image = null }) {
  const mdl = model || "gemini-3.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${mdl}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const parts = [{ text: user }];
  // Gemini multimodal: dinh kem anh (Vision) neu co -> dung cho mo ta hinh anh GBP
  if (image && image.data) parts.push({ inlineData: { mimeType: image.mimeType || "image/jpeg", data: image.data } });
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts }],
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: maxTokens,
      responseMimeType: "application/json",
      responseSchema: toGeminiSchema(schema),
    },
  };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  let data;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    data = await res.json();
    if (!res.ok) throw new Error(`Gemini loi: ${data?.error?.message || res.status}`);
  } catch (e) {
    if (e.name === "AbortError") throw new Error(`Gemini qua lau (>${Math.round(timeout / 1000)}s).`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
  const cand = data?.candidates?.[0];
  const text = cand?.content?.parts?.map((p) => p.text).join("") || "";
  if (!text) throw new Error(`Gemini khong tra ve noi dung (${cand?.finishReason || "?"}).`);
  return parseJsonResilient(text, cand?.finishReason);
}

export async function optimizeWithGemini({ apiKey, model, article, mode, count, keywords, targets, targetContexts }) {
  const mdl = model || "gemini-3.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${mdl}:generateContent?key=${encodeURIComponent(
    apiKey
  )}`;

  const userContent = buildUserPrompt({ article, mode, count, keywords, targets, targetContexts });

  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: "user", parts: [{ text: userContent }] }],
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 16384,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) {
    const msg = data?.error?.message || `HTTP ${res.status}`;
    throw new Error(`Gemini loi: ${msg}`);
  }

  const cand = data?.candidates?.[0];
  const text = cand?.content?.parts?.map((p) => p.text).join("") || "";
  if (!text) {
    const reason = cand?.finishReason || data?.promptFeedback?.blockReason || "khong ro";
    throw new Error(`Gemini khong tra ve noi dung (ly do: ${reason}).`);
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Gemini tra ve JSON khong hop le.");
  }

  return {
    edits: Array.isArray(parsed.edits) ? parsed.edits : [],
    notes: parsed.notes || "",
    usage: data?.usageMetadata
      ? {
          input_tokens: data.usageMetadata.promptTokenCount,
          output_tokens: data.usageMetadata.candidatesTokenCount,
        }
      : null,
  };
}
