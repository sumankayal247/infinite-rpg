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

    const prompt = `Context: HP:${playerHp}, STR:${playerStr}, Level:${playerLevel}, Biome:${safeBiome}. Task: Generate an encounter. Respond ONLY in valid JSON format: {"name": "string", "desc": "string", "visual_theme": "string", "is_hostile": boolean}`;

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
