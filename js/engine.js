/**
 * engine.js
 * Phase 1: Core Mechanics, Math Engine, & External Data
 * Handles 100% of game math, keeping AI strictly to narrative.
 */

// 1. Stats & Modding Support
export const BaseAttributes = ["STR", "VIT", "AGI", "CHA", "INT"];

export async function fetchGameData(fileName) {
    const response = await fetch(`./assets/data/${fileName}`);
    return await response.json();
}

// 2. Derived Stats Pattern
// Max HP = Base HP + (VIT * 5)
// Attack = STR * 2 + Equipment Attack
// Defense = VIT + Equipment Defense
export function deriveStats(baseStats, equipment = [], statusEffects = []) {
    let derived = {
        maxHp: 100 + (baseStats.VIT * 5),
        attack: baseStats.STR * 2,
        defense: baseStats.VIT,
        critChance: 0.05 + (baseStats.AGI * 0.01) // 5% base + 1% per AGI
    };

    // Apply equipment modifiers and parse special effects
    equipment.forEach(item => {
        if (item.stats) {
            if (item.stats.attack) derived.attack += item.stats.attack;
            if (item.stats.defense) derived.defense += item.stats.defense;
            if (item.stats.hp) derived.maxHp += item.stats.hp;
        }
        
        // Phase 2: Equipment & Potions with Special Effects
        if (item.special_effects) {
            if (!derived.special_effects) derived.special_effects = [];
            derived.special_effects.push(...item.special_effects);
        }
    });

    // Apply status effect modifiers
    statusEffects.forEach(effect => {
        if (effect.modifier) {
            for (let stat in effect.modifier) {
                if (derived[stat] !== undefined) {
                    derived[stat] += effect.modifier[stat];
                }
            }
        }
    });

    return derived;
}

// 3. Leveling System
// Quadratic XP curve: Base * Level^2. Let Base = 100
const BASE_XP = 100;

export function getXpRequiredForLevel(level) {
    return BASE_XP * Math.pow(level, 2);
}

export function checkLevelUp(currentLevel, currentXp) {
    let requiredXp = getXpRequiredForLevel(currentLevel);
    let levelsGained = 0;
    let newXp = currentXp;

    while (newXp >= requiredXp) {
        newXp -= requiredXp;
        levelsGained++;
        currentLevel++;
        requiredXp = getXpRequiredForLevel(currentLevel);
    }

    return { leveledUp: levelsGained > 0, newLevel: currentLevel, remainingXp: newXp, statPointsGained: levelsGained * 3 };
}

// 4. Turn-Based Combat & Initiative
export function rollInitiative(entityAgi) {
    // 1d20 + AGI
    const d20 = Math.floor(Math.random() * 20) + 1;
    return d20 + entityAgi;
}

export function determineTurnOrder(entities) {
    // Entities is an array of { id, agi }
    return entities
        .map(e => ({ ...e, initiative: rollInitiative(e.agi) }))
        .sort((a, b) => b.initiative - a.initiative);
}

// 5. Status Effects Engine
export function tickStatusEffects(statusEffects) {
    // statusEffects is an array of objects: { name, duration, dot, modifier }
    let expired = [];
    let active = [];
    let totalDotDamage = 0;

    statusEffects.forEach(effect => {
        effect.duration -= 1;
        
        if (effect.dot) {
            totalDotDamage += effect.dot;
        }

        if (effect.duration <= 0) {
            expired.push(effect);
        } else {
            active.push(effect);
        }
    });

    return { active, expired, totalDotDamage };
}

// 6. Damage Formula
export function calculateDamage(attackerDerived, defenderDerived) {
    let isCrit = Math.random() < attackerDerived.critChance;
    let baseDamage = attackerDerived.attack - defenderDerived.defense;
    
    if (baseDamage < 1) baseDamage = 1; // Minimum 1 damage if attack hits

    // ± 10% variance
    const variance = (Math.random() * 0.2) - 0.1; // -0.1 to +0.1
    let finalDamage = Math.floor(baseDamage * (1 + variance));

    if (isCrit) {
        finalDamage = Math.floor(finalDamage * 1.5); // 1.5x damage on crit
    }

    return {
        damage: finalDamage,
        isCrit: isCrit
    };
}
// --- GAME STATE & ACTIONS ---
export const gameState = {
    mode: 'MAP', // MAP, COMBAT, SHOP, SMITH
    player: {
        hp: 100, maxHp: 100,
        level: 1, xp: 0, gold: 50,
        baseStats: null,
        derived: null,
        inventory: [],
        equipment: { weapon: null, armor: null, accessory: null }
    },
    enemy: null,
    shopDiscount: 0,
    map: {
        currentNode: null,
        choices: []
    }
};

export function setMode(newMode) {
    gameState.mode = newMode;
}

export function setEnemy(enemyData) {
    gameState.enemy = enemyData;
}

export function awardGold(amount) {
    gameState.player.gold += amount;
}

export function spendGold(amount) {
    if (gameState.player.gold >= amount) {
        gameState.player.gold -= amount;
        return true;
    }
    return false;
}

export function healPlayer(amount) {
    gameState.player.hp = Math.min(gameState.player.maxHp, gameState.player.hp + amount);
}

export function upgradeBaseStat(stat, amount) {
    gameState.player.baseStats[stat] += amount;
    recalculateDerivedStats();
}

export function recalculateDerivedStats() {
    const equipArray = Object.values(gameState.player.equipment).filter(e => e !== null);
    gameState.player.derived = deriveStats(gameState.player.baseStats, equipArray);
    gameState.player.maxHp = gameState.player.derived.maxHp;
    if (gameState.player.hp > gameState.player.maxHp) gameState.player.hp = gameState.player.maxHp;
}

export function damageEnemy(amount) {
    gameState.enemy.hp -= amount;
    return gameState.enemy.hp <= 0; // true if dead
}

export function damagePlayer(amount) {
    gameState.player.hp -= amount;
    return gameState.player.hp <= 0; // true if dead
}

export function processCombatTurn(isPlayerFleeing = false) {
    // Basic turn processor placeholder to abstract from main.js
}

export function awardXP(amount) {
    gameState.player.xp += amount;
    let levelCheck = checkLevelUp(gameState.player.level, gameState.player.xp);
    if (levelCheck.leveledUp) {
        gameState.player.level = levelCheck.newLevel;
        gameState.player.xp = levelCheck.remainingXp;
        // Basic static growth for now
        gameState.player.baseStats.STR += 2;
        gameState.player.baseStats.VIT += 2;
        recalculateDerivedStats();
        // Fully heal on level up
        gameState.player.hp = gameState.player.maxHp;
        return true;
    }
    return false;
}

export function initPlayer(baseStats) {
    gameState.player.baseStats = baseStats;
    recalculateDerivedStats();
    gameState.player.hp = gameState.player.maxHp;
}

export function equipItem(item) {
    if (!item || !item.slot) return;
    
    if (gameState.player.equipment[item.slot]) {
        gameState.player.inventory.push(gameState.player.equipment[item.slot]);
    }
    
    gameState.player.inventory = gameState.player.inventory.filter(i => i.id !== item.id);
    gameState.player.equipment[item.slot] = item;
    recalculateDerivedStats();
}

export function addToInventory(item) {
    gameState.player.inventory.push(item);
}
