// src/ai-fallback.js
// Chong dut quang khi dung Gemini FREE:
//  - Luon bat dau tu model CAO NHAT & mien phi cua chinh API key.
//  - HET LUOT mien phi (quota/rate limit) -> danh dau model do "nghi" dung bang thoi gian Google
//    yeu cau, TU DONG tut xuong model free ke tiep, va BAO cho nguoi dung (header X-Ai-Notice).
//  - Loi qua tai TAM THOI (503/high demand) -> nghi roi thu lai CUNG model.
//  - Het thoi gian nghi -> lan goi sau tu quay lai model cao nhat (khong can lam gi).

import { AsyncLocalStorage } from "node:async_hooks";
import { listFreeGeminiModels } from "./gemini.js";

// Chuoi du phong khi khong liet ke duoc model that cua key
export const FREE_FLASH = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-2.5-flash", "gemini-2.5-flash-lite"];

// Loi HET QUOTA: retry cung model la vo ich -> phai doi model
export const QUOTA_ERR = /exceeded your current quota|RESOURCE_EXHAUSTED|quota|free_tier|rate.?limit|limit: \d+/i;
// Loi con co the cuu (doi model / thu lai)
export const RECOVERABLE = /quota|exceeded|limit: 0|RESOURCE_EXHAUSTED|429|not found|404|NOT_FOUND|not supported|unavailable|is not found|does not exist|overload|high demand|experiencing high|try again later|temporar|\b503\b|\b500\b|INTERNAL|qua lau|timeout|timed out|aborted|AbortError|ETIMEDOUT|ECONNRESET|fetch failed|network/i;
// Loi QUA TAI TAM THOI -> nen thu lai CUNG model
export const TRANSIENT = /overload|high demand|experiencing high|try again later|temporar|\b503\b|\b500\b|INTERNAL|unavailable/i;

const _sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ====== BAO MODEL DANG DUNG VE CLIENT ======
// Moi request 1 store rieng; geminiWithFallback ghi model THUC SU da dung + ghi chu.
export const aiCtx = new AsyncLocalStorage();
export function noteAiModel(model, notice = "") {
  const st = aiCtx.getStore();
  if (!st) return;
  if (model) st.model = model;
  if (notice) st.notice = notice;
}
// Middleware Express: dan model/ghi chu vao header truoc khi tra JSON
export function aiHeaders() {
  return (req, res, next) => {
    const store = { model: "", notice: "" };
    const _json = res.json.bind(res);
    res.json = (body) => {
      try {
        if (store.model) res.setHeader("X-Ai-Model", store.model);
        if (store.notice) res.setHeader("X-Ai-Notice", encodeURIComponent(store.notice)); // header chi nhan ASCII
      } catch {}
      return _json(body);
    };
    aiCtx.run(store, next);
  };
}

export const prettyModelName = (m) =>
  "Gemini " + String(m || "").replace(/^gemini-/, "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export const waitLabel = (ms) =>
  ms > 90 * 60 * 1000 ? `~${Math.round(ms / 3600000)} giờ`
    : ms > 90 * 1000 ? `~${Math.round(ms / 60000)} phút`
      : `~${Math.max(1, Math.round(ms / 1000))} giây`;

// Google bao "Please retry in 13.185138066s" -> lay dung so giay can cho
export function retryAfterSec(msg) {
  const m = /retry in ([\d.]+)s/i.exec(msg || "");
  if (m) return Math.ceil(parseFloat(m[1]));
  if (/per day|daily|PerDay/i.test(msg || "")) return 60 * 60 * 6; // het luot NGAY -> nghi lau
  return 60;
}

// ====== CHUOI MODEL THAT CUA TUNG API KEY (cache 6 gio) ======
const _chainCache = new Map(); // keyId -> { chain, at }
const CHAIN_TTL = 1000 * 60 * 60 * 6;
export const keyId = (k) => (k || "env").slice(-8);

export function cacheModelChain(apiKey, chain) {
  if (chain && chain.length) _chainCache.set(keyId(apiKey), { chain: chain.slice(), at: Date.now() });
}

export async function resolveModelChain(apiKey, chosenModel, { listModels = listFreeGeminiModels } = {}) {
  const id = keyId(apiKey);
  const c = _chainCache.get(id);
  let chain = c && Date.now() - c.at < CHAIN_TTL ? c.chain : null;
  if (!chain) {
    try {
      chain = await listModels(apiKey);
      if (chain && chain.length) _chainCache.set(id, { chain, at: Date.now() });
    } catch { chain = null; }
  }
  if (!chain || !chain.length) chain = FREE_FLASH.slice();
  const m = (chosenModel || "").trim();
  return m ? [m, ...chain.filter((x) => x !== m)] : chain.slice();
}

// ====== MODEL DANG HET LUOT (co thoi han) ======
const _quotaBlock = new Map(); // `keyId|model` -> thoi diem duoc dung lai (ms)
export function blockedUntil(apiKey, model) { return _quotaBlock.get(`${keyId(apiKey)}|${model}`) || 0; }
export function markQuota(apiKey, model, seconds) {
  const wait = Math.min(Math.max(seconds || 60, 20), 60 * 60 * 24) * 1000;
  _quotaBlock.set(`${keyId(apiKey)}|${model}`, Date.now() + wait);
}
export function clearQuotaState() { _quotaBlock.clear(); _chainCache.clear(); }

// Model dang dung duoc NGAY (cao nhat chua bi khoa) - de UI hien dung trang thai
export function liveModel(apiKey, chain) {
  return (chain || []).find((m) => blockedUntil(apiKey, m) <= Date.now()) || (chain || [])[0] || "";
}

/**
 * Goi Gemini co chong lung. Tra ve { result, model, switched, notice }.
 * Nem loi cuoi cung neu MOI model free deu that bai.
 */
export async function geminiWithFallback(callFn, chosenModel, opts = {}) {
  const {
    attemptsPerModel = 3, backoffMs = 1500, apiKey = "",
    listModels = listFreeGeminiModels, sleep = _sleep,
  } = opts;
  const key = (apiKey || process.env.GEMINI_API_KEY || "").trim();
  const chain = await resolveModelChain(key, chosenModel, { listModels });
  const top = chain[0];
  let lastErr, notice = "";

  for (let i = 0; i < chain.length; i++) {
    const m = chain[i];
    const until = blockedUntil(key, m);
    // Model dang het luot -> bo qua (tru khi la lua chon cuoi cung, luc do cu thu lai)
    if (until > Date.now() && i < chain.length - 1) {
      if (!notice) notice = `${prettyModelName(m)} đã hết lượt miễn phí (chờ ${waitLabel(until - Date.now())})`;
      continue;
    }
    for (let attempt = 1; attempt <= attemptsPerModel; attempt++) {
      try {
        const result = await callFn(m);
        const switched = m !== top;
        if (switched) {
          notice = `${notice || `${prettyModelName(top)} đã hết lượt miễn phí`} → đang dùng ${prettyModelName(m)}`;
          noteAiModel(m, notice);
        } else {
          noteAiModel(m, "");
        }
        return { result, model: m, switched, notice: switched ? notice : "" };
      } catch (e) {
        lastErr = e;
        const msg = e.message || "";
        if (QUOTA_ERR.test(msg)) {
          const sec = retryAfterSec(msg);
          markQuota(key, m, sec);
          notice = `${prettyModelName(m)} đã hết lượt miễn phí (chờ ${waitLabel(sec * 1000)})`;
          break; // -> chuyen model ke tiep NGAY
        }
        if (!RECOVERABLE.test(msg)) throw e; // loi khac (vd sai key) -> nem ngay
        if (TRANSIENT.test(msg) && attempt < attemptsPerModel) { await sleep(backoffMs * attempt); continue; }
        break; // model nay khong dung duoc -> thu model ke tiep
      }
    }
  }
  if (notice) noteAiModel("", `${notice}. Tất cả model miễn phí đều đã hết lượt — tạm dùng engine Local.`);
  throw lastErr || new Error("Gemini không dùng được.");
}
