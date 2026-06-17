// src/claude.js
// Engine Claude (Anthropic API) - tuy chon nang cao (can key tra phi).

import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT, buildUserPrompt, EDIT_FIELDS } from "./prompt.js";

const SUBMIT_TOOL = {
  name: "submit_internal_links",
  description: "Nop ket qua chen internal link. Chi tra ve cac block bi chinh sua.",
  input_schema: {
    type: "object",
    properties: {
      edits: {
        type: "array",
        items: {
          type: "object",
          properties: {
            blockIndex: { type: "integer", description: EDIT_FIELDS.blockIndex },
            newHtml: { type: "string", description: EDIT_FIELDS.newHtml },
            anchor: { type: "string", description: EDIT_FIELDS.anchor },
            targetUrl: { type: "string", description: EDIT_FIELDS.targetUrl },
            keyword: { type: "string", description: EDIT_FIELDS.keyword },
            addedContent: { type: "boolean", description: EDIT_FIELDS.addedContent },
            reason: { type: "string", description: EDIT_FIELDS.reason },
          },
          required: ["blockIndex", "newHtml", "anchor", "targetUrl", "addedContent", "reason"],
        },
      },
      notes: { type: "string", description: "Ghi chu tong quan / canh bao." },
    },
    required: ["edits"],
  },
};

export async function optimizeWithClaude({ apiKey, model, article, mode, count, keywords, targets }) {
  const client = new Anthropic({ apiKey });
  const userContent = buildUserPrompt({ article, mode, count, keywords, targets });

  const response = await client.messages.create({
    model: model || "claude-sonnet-4-6",
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    tools: [SUBMIT_TOOL],
    tool_choice: { type: "tool", name: "submit_internal_links" },
    messages: [{ role: "user", content: userContent }],
  });

  const toolUse = response.content.find((c) => c.type === "tool_use");
  if (!toolUse) throw new Error("Claude khong tra ve ket qua hop le.");
  const result = toolUse.input || {};
  return {
    edits: Array.isArray(result.edits) ? result.edits : [],
    notes: result.notes || "",
    usage: response.usage || null,
  };
}
