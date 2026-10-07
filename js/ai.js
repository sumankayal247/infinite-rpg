/**
 * ai.js
 * Phase 3: AI Brain Integration & Graceful Degradation
 */

import { getTelemetry } from "./save.js";
import { sanitizePlayerInput } from "./security.js";

let fallbackData = null;
let prefetchCache = {}; // Cache for Speculative Pre-fetching

// Puter is lazy-loaded on first AI use (see index.html note).
// No static <script> tag: its socket.io client never connects at boot,
// so a dead/blocked network can't spam the console on page load.
let puterLoadPromise = null;

function ensurePuter(timeoutMs = 8000) {
  try {
    if (typeof puter !== "undefined" && puter && puter.ai && puter.ai.chat)
      return Promise.resolve(true);
  } catch {}
  if (!puterLoadPromise) {
    puterLoadPromise = new Promise((resolve) => {
      let settled = false;
      const done = (ok) => {
        if (settled) return;
        settled = true;
        try {
          if (typeof puter !== "undefined" && puter) puter.quiet = true;
        } catch {}
        resolve(ok);
      };
      try {
        const s = document.createElement("script");
        s.src = "https://js.puter.com/v2/";
        s.async = true;
        s.onload = () => done(true);
        s.onerror = () => done(false);
        document.head.appendChild(s);
      } catch {
        done(false);
        return;
      }
      setTimeout(() => {
        let ok = false;
        try {
          ok = typeof puter !== "undefined" && !!(puter && puter.ai);
        } catch {}
        done(ok);
      }, timeoutMs);
    });
  }
  return puterLoadPromise;
}

async function aiReady() {
  try {
    const ok = await ensurePuter();
    if (!ok) return false;
    return typeof puter !== "undefined" && !!(puter && puter.ai && puter.ai.chat);
  } catch {
    return false;
  }
}

// Puter's realtime socket can fail on some networks (adblock, closed WS).
// That failure lives inside puter's own library — the game stays playable
// via fallback. Quiet the banner and cap every AI call with a timeout.
function chatWithTimeout(prompt, ms = 12000) {
  const call = puter.ai.chat(prompt);
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("AI timeout — using fallback")), ms),
  );
  return Promise.race([call, timeout]);
}

export async function loadFallbackData() {
  try {
    const response = await fetch("./assets/data/fallback.json");
    fallbackData = await response.json();
  } catch (e) {
    console.error("Critical: Could not load fallback.json", e);
  }
}

// 1. Structured JSON Prompts & 3. Graceful Degradation
export async function generateEncounter(
  playerHp,
  playerStr,
  playerLevel,
  biome,
) {
  // Only use prefetched nodes if the request is for a general biome, NOT a specific guard or elite, and NOT a prefetch request itself
  if (!biome.includes("guard") && !biome.includes("elite") && biome !== "unknown") {
    const keys = Object.keys(prefetchCache);
    if (keys.length > 0) {
      // Return and consume the first prefetched encounter
      const prefetched = getPrefetchedNode(keys[0]);
      if (prefetched && prefetched.name) return prefetched;
    }
  }

  if (!(await aiReady())) {
    console.warn("Puter.js unavailable (offline/blocked). Using fallback.");
    return getRandomFallback();
  }

  // Phase 6: Prompt Injection Protection
  const safeBiome = sanitizePlayerInput(biome);

  const telemetry = getTelemetry();
  const history = (telemetry.recentEvents || []).join(". ");
  const prompt = `Context: HP:${playerHp}, STR:${playerStr}, Level:${playerLevel}, Biome:${safeBiome}. Recent history: ${history}. Task: Generate an encounter that logically follows the history if relevant. Respond ONLY with the raw JSON object. Do not add conversational text. The 'desc' must be a single concise paragraph. Format: {"name": "string", "desc": "string", "visual_theme": "string", "is_hostile": boolean}`;

  try {
    const response = await chatWithTimeout(prompt);
    // Puter API might return an object with a toString method or a message property
    let responseText =
      typeof response === "string"
        ? response
        : response.message?.content || response.toString();

    // Clean markdown backticks if present
    let cleanJson = responseText
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();
    let parsed = JSON.parse(cleanJson);
        if (!parsed.id) parsed.id = `enc_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        return parsed;
  } catch (e) {
    console.error("AI Generation failed. Falling back.", e);
    return getRandomFallback();
  }
}

function getRandomFallback() {
  if (!fallbackData || !fallbackData.fallback_encounters) {
    return {
      name: "Error Entity",
      desc: "A glitch in the matrix.",
      visual_theme: "glitch",
      is_hostile: false,
    };
  }
  const idx = Math.floor(
    Math.random() * fallbackData.fallback_encounters.length,
  );
  return fallbackData.fallback_encounters[idx];
}

// 4. Speculative Pre-fetching (Zero-Latency AI) & Markov Chain
export async function prefetchNextNodes(playerContext) {
  const telemetry = getTelemetry();

  // Probabilistic Markov Chain: predict likely next move based on history
  const attackBias =
    (telemetry.choices["Attack"] || 0) / (telemetry.totalChoices || 1);

  let predictedType = "Campfire";
  if (Math.random() < attackBias) {
    predictedType = "Combat";
  }

  const cacheKey = `prefetch_${predictedType}_${Date.now()}`;

  // Fire and forget
  generateEncounter(
    playerContext.hp,
    playerContext.str,
    playerContext.level,
    "unknown",
  ).then((result) => {
    prefetchCache[cacheKey] = result;
    manageMemory();
  });

  return cacheKey;
}

export function getPrefetchedNode(cacheKey) {
  const node = prefetchCache[cacheKey];
  delete prefetchCache[cacheKey]; // Consume it
  return node;
}

// 5. Memory Management
export function manageMemory() {
  // Aggressively garbage collect stale JSON pre-fetch objects
  const keys = Object.keys(prefetchCache);
  if (keys.length > 5) {
    // Keep only 5 prefetched items max
    delete prefetchCache[keys[0]];
  }

  // Pruning old chat-log nodes from the DOM to prevent browser crashes
  const chatLog = document.getElementById("chat-log");
  if (chatLog) {
    while (chatLog.children.length > 50) {
      chatLog.removeChild(chatLog.firstChild);
    }
  }
}

export async function generateMysteryEvent(biome, level) {
  if (!(await aiReady())) return getFallbackEvent();
  const safeBiome = sanitizePlayerInput(biome);
  const telemetry = getTelemetry();
  const history = (telemetry.recentEvents || []).join(". ");
  const prompt = `Context: Biome:${safeBiome}, Level:${level}. Recent history: ${history}. Task: Generate a mysterious RPG event that builds upon the recent history if possible. Respond ONLY with raw JSON. No markdown backticks, no conversation. The 'choices' array must have 2-3 items. Format: {"title":"string","desc":"string","choices":[{"id":"c1","text":"string","stat_check":"STR|AGI|INT|CHA|NONE"}]}`;

  try {
    const response = await chatWithTimeout(prompt);
    let responseText =
      typeof response === "string"
        ? response
        : response.message?.content || response.toString();
    let cleanJson = responseText
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();
    let parsed = JSON.parse(cleanJson);
        if (!parsed.id) parsed.id = `enc_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        return parsed;
  } catch (e) {
    console.error("Mystery generation failed.", e);
    return getFallbackEvent();
  }
}

export async function resolveMysteryEvent(eventDesc, choice, rollTotal) {
  if (!(await aiReady()))
    return getFallbackResolution(choice, rollTotal);

  let rollContext =
    rollTotal !== null
      ? `They rolled a D20 stat check and got a total of ${rollTotal}.`
      : `No stat check was required.`;
  const prompt = `Context: Event was "${eventDesc}". Player chose "${choice.text}". ${rollContext} Task: Resolve the event. Respond ONLY with raw JSON. No markdown, no conversation. Consequence fields should be positive or negative numbers (or 0). Format: {"desc":"string","consequence":{"hp_change":number,"gold_change":number,"xp_change":number,"new_quest":"string (optional)"}}`;

  try {
    const response = await chatWithTimeout(prompt);
    let responseText =
      typeof response === "string"
        ? response
        : response.message?.content || response.toString();
    let cleanJson = responseText
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();
    let parsed = JSON.parse(cleanJson);
        if (!parsed.id) parsed.id = `enc_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        return parsed;
  } catch (e) {
    console.error("Mystery resolution failed.", e);
    return getFallbackResolution(choice, rollTotal);
  }
}

const FALLBACK_EVENTS = [
  {
    title: "Mysterious Statue",
    desc: "A weathered weeping angel statue holds a glowing ruby in its outstretched hand. The air smells of rain and old stone.",
    choices: [
      { id: "c1", text: "Snatch the ruby", stat_check: "AGI" },
      { id: "c2", text: "Kneel and pray", stat_check: "CHA" },
      { id: "c3", text: "Leave it alone", stat_check: "NONE" },
    ],
  },
  {
    title: "Wounded Traveler",
    desc: "A cloaked traveler slumps against a mossy rock, clutching a bleeding arm. Behind them, the treeline rustles with something large.",
    choices: [
      { id: "c1", text: "Bind their wounds", stat_check: "INT" },
      { id: "c2", text: "Interrogate them first", stat_check: "CHA" },
      { id: "c3", text: "Draw steel and wait", stat_check: "NONE" },
    ],
  },
  {
    title: "Sunken Cache",
    desc: "Half-buried in the mud glints an iron-bound chest, its lock rusted but intact. Fresh footprints circle it — twice.",
    choices: [
      { id: "c1", text: "Pick the lock", stat_check: "AGI" },
      { id: "c2", text: "Smash it open", stat_check: "STR" },
      { id: "c3", text: "Study the footprints", stat_check: "INT" },
    ],
  },
];
let fallbackEventIdx = 0;

function getFallbackEvent() {
  const ev = FALLBACK_EVENTS[fallbackEventIdx % FALLBACK_EVENTS.length];
  fallbackEventIdx++;
  return JSON.parse(JSON.stringify(ev)); // fresh copy per encounter
}

function getFallbackResolution(choice, rollTotal) {
  if (choice.stat_check !== "NONE") {
    if (rollTotal < 12)
      return {
        desc: "You tripped a trap! The statue crushed your hand.",
        consequence: { hp_change: -10, gold_change: 0, xp_change: 5 },
      };
    else
      return {
        desc: "Swiftly, you snatched the ruby before the trap snapped shut!",
        consequence: { hp_change: 0, gold_change: 50, xp_change: 20 },
      };
  }
  return {
    desc: "You walk away safely, but feel you missed an opportunity.",
    consequence: { hp_change: 0, gold_change: 0, xp_change: 0 },
  };
}
