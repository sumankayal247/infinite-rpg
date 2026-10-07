/**
 * map.js
 * Phase 2: Node-Based Exploration & Progression Gating
 * Layout math lives here (engine-owned). ascii.js is the
 * deterministic renderer. AI only narrates, never lays out.
 */
import { generateWorldMap, renderAscii, LEGEND } from "./ascii.js";

// 7. Progression Gating
const REGION_TIERS = {
    1: "Whispering Woods",
    5: "Desolate Dunes",
    10: "Crimson Peaks",
    15: "Abyssal Depths"
};

export function getAvailableRegions(playerLevel) {
    let available = [];
    for (const [levelReq, name] of Object.entries(REGION_TIERS)) {
        if (playerLevel >= parseInt(levelReq)) {
            available.push({ tier: parseInt(levelReq), name });
        }
    }
    return available;
}

// 6. Node-Based Exploration
const NODE_TYPES = ["Campfire", "Mystery", "Combat", "Elite Combat", "Shop"];

export function generateNodesForRegion(regionTier, count = 3) {
    let nodes = [];
    for (let i = 0; i < count; i++) {
        // Elite combat is more likely in higher tiers
        const rand = Math.random();
        let type = "Combat";

        if (rand < 0.1) type = "Campfire";
        else if (rand < 0.3) type = "Mystery";
        else if (rand < 0.45) type = "Shop";
        else if (rand > 0.85) type = "Elite Combat";

        nodes.push({
            id: `node_${Date.now()}_${i}`,
            type: type,
            tier: regionTier
        });
    }
    return nodes;
}

// Branching world: deterministic 3-path fork + ASCII art.
// seed = run id (persist per run), level gates region/biome.
export function generateWorld(seed = 1234, playerLevel = 1) {
    const world = generateWorldMap(seed, playerLevel);
    return {
        ...world,
        ascii: renderAscii(world),
        legend: LEGEND,
    };
}
