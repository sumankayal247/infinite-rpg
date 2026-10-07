/**
 * ai.js
 * Phase 3: AI Brain Integration & Graceful Degradation
 */

import { getTelemetry } from './save.js';
import { sanitizePlayerInput } from './security.js';

let fallbackData = null;
let prefetchCache = {}; // Cache for Speculative Pre-fetching

export async function loadFallbackData() {
    try {
        const response = await fetch('./assets/data/fallback.json');
        fallbackData = await response.json();
    } catch (e) {
        console.error("Critical: Could not load fallback.json", e);
    }
}

// 1. Structured JSON Prompts & 3. Graceful Degradation
export async function generateEncounter(playerHp, playerStr, playerLevel, biome) {
    if (typeof puter === 'undefined') {
        console.warn("Puter.js not available. Using Graceful Degradation.");
        return getRandomFallback();
    }

    // Phase 6: Prompt Injection Protection
    const safeBiome = sanitizePlayerInput(biome);

    const prompt = `Context: HP:${playerHp}, STR:${playerStr}, Level:${playerLevel}, Biome:${safeBiome}. Task: Generate an encounter. Respond ONLY with the raw JSON object. Do not add any conversational text or prefixes. The 'desc' must be a single concise paragraph. Format: {"name": "string", "desc": "string", "visual_theme": "string", "is_hostile": boolean}`;

    try {
        const response = await puter.ai.chat(prompt);
        // Puter API might return an object with a toString method or a message property
        let responseText = typeof response === 'string' ? response : (response.message?.content || response.toString());
        
        // Clean markdown backticks if present
        let cleanJson = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
        return JSON.parse(cleanJson);
    } catch (e) {
        console.error("AI Generation failed. Falling back.", e);
        return getRandomFallback();
    }
}

function getRandomFallback() {
    if (!fallbackData || !fallbackData.fallback_encounters) {
        return { name: "Error Entity", desc: "A glitch in the matrix.", visual_theme: "glitch", is_hostile: false };
    }
    const idx = Math.floor(Math.random() * fallbackData.fallback_encounters.length);
    return fallbackData.fallback_encounters[idx];
}

// 4. Speculative Pre-fetching (Zero-Latency AI) & Markov Chain
export async function prefetchNextNodes(playerContext) {
    const telemetry = getTelemetry();
    
    // Probabilistic Markov Chain: predict likely next move based on history
    const attackBias = (telemetry.choices["Attack"] || 0) / (telemetry.totalChoices || 1);
    
    let predictedType = "Campfire";
    if (Math.random() < attackBias) {
        predictedType = "Combat";
    }

    const cacheKey = `prefetch_${predictedType}_${Date.now()}`;
    
    // Fire and forget
    generateEncounter(playerContext.hp, playerContext.str, playerContext.level, "unknown")
        .then(result => {
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
    if (keys.length > 5) { // Keep only 5 prefetched items max
        delete prefetchCache[keys[0]];
    }
    
    // Pruning old chat-log nodes from the DOM to prevent browser crashes
    const chatLog = document.getElementById('chat-log');
    if (chatLog) {
        while (chatLog.children.length > 50) {
            chatLog.removeChild(chatLog.firstChild);
        }
    }
}

export async function generateMysteryEvent(biome, level) {
    if (typeof puter === 'undefined') return getFallbackEvent();
    const safeBiome = sanitizePlayerInput(biome);
    const prompt = `Context: Biome:${safeBiome}, Level:${level}. Task: Generate a mysterious RPG event. Respond ONLY with raw JSON. No markdown backticks, no conversation. The 'choices' array must have 2-3 items. Format: {"title":"string","desc":"string","choices":[{"id":"c1","text":"string","stat_check":"STR|AGI|INT|CHA|NONE"}]}`;
    
    try {
        const response = await puter.ai.chat(prompt);
        let responseText = typeof response === 'string' ? response : (response.message?.content || response.toString());
        let cleanJson = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
        return JSON.parse(cleanJson);
    } catch (e) {
        console.error("Mystery generation failed.", e);
        return getFallbackEvent();
    }
}

export async function resolveMysteryEvent(eventDesc, choice, rollTotal) {
    if (typeof puter === 'undefined') return getFallbackResolution(choice, rollTotal);
    
    let rollContext = rollTotal !== null ? `They rolled a D20 stat check and got a total of ${rollTotal}.` : `No stat check was required.`;
    const prompt = `Context: Event was "${eventDesc}". Player chose "${choice.text}". ${rollContext} Task: Resolve the event. Respond ONLY with raw JSON. No markdown, no conversation. Consequence fields should be positive or negative numbers (or 0). Format: {"desc":"string","consequence":{"hp_change":number,"gold_change":number,"xp_change":number}}`;
    
    try {
        const response = await puter.ai.chat(prompt);
        let responseText = typeof response === 'string' ? response : (response.message?.content || response.toString());
        let cleanJson = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
        return JSON.parse(cleanJson);
    } catch (e) {
        console.error("Mystery resolution failed.", e);
        return getFallbackResolution(choice, rollTotal);
    }
}

function getFallbackEvent() {
    return {
        title: "Mysterious Statue",
        desc: "A weathered weeping angel statue holding a glowing ruby in its outstretched hand.",
        choices: [
            { id: "c1", text: "Snatch the ruby", stat_check: "AGI" },
            { id: "c2", text: "Leave it alone", stat_check: "NONE" }
        ]
    };
}

function getFallbackResolution(choice, rollTotal) {
    if (choice.stat_check !== "NONE") {
        if (rollTotal < 12) return { desc: "You tripped a trap! The statue crushed your hand.", consequence: { hp_change: -10, gold_change: 0, xp_change: 5 } };
        else return { desc: "Swiftly, you snatched the ruby before the trap snapped shut!", consequence: { hp_change: 0, gold_change: 50, xp_change: 20 } };
    }
    return { desc: "You walk away safely, but feel you missed an opportunity.", consequence: { hp_change: 0, gold_change: 0, xp_change: 0 } };
}
