/**
 * meta.js
 * Phase 5: Achievements & Meta-Progression
 */

const META_KEY = 'infinite_rpg_meta';

export function getMetaStats() {
    const raw = localStorage.getItem(META_KEY);
    if (raw) {
        try { return JSON.parse(raw); } catch (e) {}
    }
    return {
        totalEnemiesDefeated: 0,
        totalGoldEarned: 0,
        metaCurrency: 0,
        unlockedClasses: ["Warrior"],
        unlockedBorders: ["Default"]
    };
}

export function saveMetaStats(meta) {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
}

export function addMetaCurrency(amount) {
    let meta = getMetaStats();
    meta.metaCurrency += amount;
    saveMetaStats(meta);
}

export function trackEnemyDefeated() {
    let meta = getMetaStats();
    meta.totalEnemiesDefeated += 1;
    
    // Achievement Logic
    if (meta.totalEnemiesDefeated === 10 && !meta.unlockedClasses.includes("Mage")) {
        meta.unlockedClasses.push("Mage");
        meta.metaCurrency += 100;
        alert("Achievement Unlocked: Slayer! (+100 Meta Currency, Unlocked Mage Class)");
    }
    
    saveMetaStats(meta);
}
