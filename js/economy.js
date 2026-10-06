/**
 * economy.js
 * Phase 2: Economy, Shops, Blacksmiths & Upgrades
 */

import { attemptBargain } from './skills.js';

// 1. Economy, Shops & Merchants
export function calculateItemPrice(baseValue, isBuying, chaStat = null, isBargaining = false) {
    let finalPrice = baseValue;
    let discount = 0;

    if (isBuying) {
        finalPrice = baseValue * 1.5; // Buy markup
        if (isBargaining && chaStat) {
            const bargainResult = attemptBargain(chaStat);
            if (bargainResult.success) {
                discount = bargainResult.discount;
                finalPrice = finalPrice * (1 - discount);
            }
        }
    } else {
        finalPrice = baseValue * 0.5; // Sell markdown
    }

    return Math.floor(Math.max(1, finalPrice));
}

// Bribes
export function attemptBribe(goldOffered, aiHiddenGreedStat) {
    // The engine compares the gold amount to a hidden "greed" stat
    return goldOffered >= aiHiddenGreedStat;
}

// 4. Blacksmiths, Upgrades, & Durability
export function degradeWeapon(weapon) {
    if (weapon.durability !== undefined) {
        weapon.durability -= 1;
        if (weapon.durability <= 0) {
            weapon.broken = true;
        }
    }
    return weapon;
}

export function repairItem(item, playerGold, playerMaterials, repairCostGold, repairCostMats) {
    if (playerGold >= repairCostGold && playerMaterials >= repairCostMats) {
        item.durability = item.maxDurability || 100;
        item.broken = false;
        return { success: true, remainingGold: playerGold - repairCostGold, remainingMats: playerMaterials - repairCostMats };
    }
    return { success: false, reason: "Insufficient resources" };
}

export function upgradeItem(item, playerGold, playerMaterials, upgradeCostGold, upgradeCostMats) {
    if (playerGold >= upgradeCostGold && playerMaterials >= upgradeCostMats) {
        // Permanently increasing its flat stat modifier
        if (item.stats && item.stats.attack) {
            item.stats.attack += 2;
        } else if (item.stats && item.stats.defense) {
            item.stats.defense += 2;
        }
        item.name = item.name.includes('+') 
            ? item.name.replace(/\+(\d+)/, (match, p1) => `+${parseInt(p1) + 1}`) 
            : `${item.name} +1`;
            
        return { success: true, upgradedItem: item, remainingGold: playerGold - upgradeCostGold, remainingMats: playerMaterials - upgradeCostMats };
    }
    return { success: false, reason: "Insufficient resources" };
}
