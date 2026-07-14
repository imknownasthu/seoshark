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
export async function geminiJson({ apiKey, model, system, user, schema, maxTokens = 8192, timeout = 45000 }) {
  const mdl = model || "gemini-3.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${mdl}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: user }] }],
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

export async function optimizeWithGemini({ apiKey, model, article, mode, count, keywords, targets }) {
  const mdl = model || "gemini-3.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${mdl}:generateContent?key=${encodeURIComponent(
    apiKey
  )}`;

  const userContent = buildUserPrompt({ article, mode, count, keywords, targets });

  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: "user", parts: [{ text: userContent }] }],
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 8192,
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
