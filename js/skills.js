/**
 * skills.js
 * Phase 2: Stat-Based Skill Checks, Crime, and Dice Mechanics
 */

import { BaseAttributes } from './engine.js';

// 3. Stat-Based Skill Checks & Dice Throw Mechanics
export function performSkillCheck(statValue, difficulty = 10) {
    // Standard d20 roll
    const d20 = Math.floor(Math.random() * 20) + 1;
    // Modifier is roughly (Stat - 10) / 2 like D&D, but here we can just use the flat stat or a fraction.
    // Let's use a standard RPG modifier: Math.floor((statValue - 10) / 2)
    const modifier = Math.floor((statValue - 10) / 2);
    const total = d20 + modifier;

    return {
        roll: d20,
        modifier: modifier,
        total: total,
        success: total >= difficulty,
        isCriticalSuccess: d20 === 20,
        isCriticalFailure: d20 === 1
    };
}

// 2. Crime System & Stealing
export let wantedLevel = 0;

export function attemptSteal(agiStat, difficulty) {
    // Success is Math.random() + (AGI * 0.1) > Difficulty (from .md)
    const roll = Math.random() + (agiStat * 0.1);
    const success = roll > difficulty;

    if (!success) {
        wantedLevel += 1;
        // Returns failure state so AI can generate "Caught in the Act" scenario
        return { success: false, wantedLevel, message: "Caught in the Act" };
    }

    return { success: true, wantedLevel, message: "Successfully stole item" };
}

export function resetWantedLevel() {
    wantedLevel = 0;
}

// Bargaining (CHA check)
export function attemptBargain(chaStat, difficulty = 12) {
    const check = performSkillCheck(chaStat, difficulty);
    if (check.success) {
        // Return a discount percentage based on how much they beat the DC
        const margin = check.total - difficulty;
        const discount = Math.min(0.5, 0.1 + (margin * 0.05)); // Max 50% discount
        return { success: true, discount: discount, rollDetails: check };
    }
    return { success: false, discount: 0, rollDetails: check };
}
