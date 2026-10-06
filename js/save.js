/**
 * save.js
 * Phase 3: Save/Load & Cross-Run Telemetry
 */

const SAVE_KEY = 'infinite_rpg_save';
const TELEMETRY_KEY = 'infinite_rpg_telemetry';
const SAVE_VERSION = 1.0;

export function saveGameState(playerData, inventory) {
    const saveData = {
        save_version: SAVE_VERSION,
        timestamp: Date.now(),
        playerData,
        inventory
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
}

export function loadGameState() {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch (e) {
        console.error("Failed to parse save file", e);
        return null;
    }
}

export function trackPlayerChoice(choiceType) {
    // Keep cross-run historical telemetry for Markov chain prefetching
    let telemetry = getTelemetry();
    
    if (!telemetry.choices[choiceType]) {
        telemetry.choices[choiceType] = 0;
    }
    telemetry.choices[choiceType]++;
    telemetry.totalChoices++;
    
    localStorage.setItem(TELEMETRY_KEY, JSON.stringify(telemetry));
}

export function getTelemetry() {
    const raw = localStorage.getItem(TELEMETRY_KEY);
    if (raw) {
        try { return JSON.parse(raw); } catch (e) {}
    }
    return { choices: {}, totalChoices: 0 };
}

export function startNewGame() {
    // On "New Game", confirm via UI (this is the logic layer of it)
    const confirm = window.confirm("Are you sure you want to start a New Game? This will wipe your character data, but retain AI behavior metrics.");
    if (confirm) {
        localStorage.removeItem(SAVE_KEY);
        // Telemetry intentionally NOT removed to allow cross-run optimization!
        return true;
    }
    return false;
}
