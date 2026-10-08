// Input sanitization, XSS prevention and prompt-injection protection.
const INJECTION = [
  /ignore\s+(all\s+)?(the\s+)?(previous|prior|above|earlier)[^.\n]*/gi,
  /disregard\s+(all\s+)?(the\s+)?(previous|prior|above)[^.\n]*/gi,
  /(system|developer)\s*(prompt|message|instruction)s?/gi,
  /you\s+are\s+now\b[^.\n]*/gi,
  /\bact\s+as\b[^.\n]*/gi,
  /\bpretend\s+(to\s+be|you)\b[^.\n]*/gi,
  /\bjailbreak\b/gi,
  /\bDAN\s+mode\b/gi,
  /(set|give|add)\s+(my|the\s+player'?s?)\s+(gold|hp|xp|stats?|level)[^.\n]*/gi,
  /(win|succeed)\s+automatically[^.\n]*/gi,
  /roll\s+(a\s+)?(natural\s+)?(20|twenty)\b[^.\n]*/gi,
];

/** Sanitize free-text player input before it is ever placed in an AI prompt. */
export function sanitizeInput(raw: string, max = 200): string {
  let t = String(raw ?? "");
  // eslint-disable-next-line no-control-regex
  t = t.replace(/[\u0000-\u001f\u007f]/g, " ");
  t = t.replace(/<[^>]*>/g, " ");
  t = t.replace(/[`{}[\]\\]/g, "");
  for (const re of INJECTION) t = t.replace(re, "[removed]");
  t = t.replace(/\s+/g, " ").trim();
  return t.slice(0, max);
}

/** Sanitize AI-generated text before display (always rendered via textContent / React text nodes). */
export function sanitizeAiText(raw: unknown, max = 420): string {
  let t = String(raw ?? "");
  // eslint-disable-next-line no-control-regex
  t = t.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
  t = t.replace(/<[^>]*>/g, "");
  t = t.replace(/\s+/g, " ").trim();
  return t.slice(0, max);
}

export function safeNumber(n: unknown, lo: number, hi: number, def = 0): number {
  const v = typeof n === "number" && isFinite(n) ? n : def;
  return Math.max(lo, Math.min(hi, v));
}

export function setText(el: HTMLElement | null, text: string) {
  if (el) el.textContent = text;
}
