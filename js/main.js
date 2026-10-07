import * as Engine from './engine.js';
import * as AI from './ai.js';
import * as AudioSys from './audio.js';
import * as SaveSys from './save.js';
import * as UI from './ui.js';
import * as MapSys from './map.js';
import * as Skills from './skills.js';
import * as Economy from './economy.js';
import * as Meta from './meta.js';

// Game State

// DOM Elements
const btns = {
    explore: document.getElementById('btn-explore'),
    attack: document.getElementById('btn-attack'),
    bribe: document.getElementById('btn-bribe'),
    steal: document.getElementById('btn-steal'),
    flee: document.getElementById('btn-flee'),
    buy: document.getElementById('btn-shop-buy'),
    haggle: document.getElementById('btn-shop-haggle'),
    upgrade: document.getElementById('btn-smith-upgrade'),
    leave: document.getElementById('btn-leave')
};

const stats = {
    hp: document.getElementById('stat-hp'),
    maxHp: document.getElementById('stat-maxhp'),
    lvl: document.getElementById('stat-lvl'),
    xp: document.getElementById('stat-xp'),
    gold: document.getElementById('stat-gold')
};

function updateUIDOM() {
    stats.hp.innerText = Engine.gameState.player.hp;
    stats.maxHp.innerText = Engine.gameState.player.maxHp;
    stats.lvl.innerText = Engine.gameState.player.level;
    stats.xp.innerText = Engine.gameState.player.xp;
    stats.gold.innerText = Engine.gameState.player.gold;

    // Hide all
    Object.values(btns).forEach(b => b.style.display = 'none');
    
    // Check if we are showing map choices
    const mapChoicesVisible = document.querySelectorAll('.map-node-btn').length > 0;

    // Show based on mode
    if (Engine.gameState.mode === 'MAP') {
        if (!mapChoicesVisible) btns.explore.style.display = 'block';
    } else if (Engine.gameState.mode === 'COMBAT') {
        btns.attack.style.display = 'block';
        btns.bribe.style.display = 'block';
        btns.flee.style.display = 'block';
        if (Engine.gameState.enemy && Engine.gameState.enemy.name !== "City Guard") btns.steal.style.display = 'block';
    } else if (Engine.gameState.mode === 'SHOP') {
        btns.buy.style.display = 'block';
        btns.haggle.style.display = 'block';
        btns.steal.style.display = 'block';
        btns.leave.style.display = 'block';
        btns.buy.innerText = `Buy Potion (${Math.floor(25 * (1 - Engine.gameState.shopDiscount))}g)`;
    } else if (Engine.gameState.mode === 'SMITH') {
        btns.upgrade.style.display = 'block';
        btns.leave.style.display = 'block';
    } else if (Engine.gameState.mode === 'MYSTERY') {
        // dynamic .map-node-btn handle themselves
    }
}

// ----------------------------------------------------
// DICE ANIMATION (Phase 2 Requirement)
// ----------------------------------------------------
function rollD20Animation(scene, resultText, onComplete) {
    const dice = scene.add.image(400, 300, 'd20').setScale(2);
    
    // Spin animation
    scene.tweens.add({
        targets: dice,
        angle: 720,
        scale: 4,
        duration: 1000,
        ease: 'Cubic.easeOut',
        onComplete: () => {
            const text = scene.add.text(400, 300, resultText, { 
                fontFamily: 'Courier', fontSize: '32px', color: '#00ff00', backgroundColor: '#000' 
            }).setOrigin(0.5);
            
            scene.time.delayedCall(1500, () => {
                dice.destroy();
                text.destroy();
                if (onComplete) onComplete();
            });
        }
    });
}

// ----------------------------------------------------
// MAP LOGIC
// ----------------------------------------------------
function onExplore() {
    UI.updateChatLog("Scouting the area ahead...");
    Object.values(btns).forEach(b => b.style.display = 'none');

    // Generate Map Nodes
    const nodes = MapSys.generateNodesForRegion(1, 3);
    const container = document.getElementById('action-buttons');
    
    document.querySelectorAll('.map-node-btn').forEach(b => b.remove());

    nodes.forEach((node, idx) => {
        const btn = document.createElement('button');
        btn.className = 'action-btn map-node-btn';
        btn.innerText = `Path ${idx + 1}: ${node.type}`;
        btn.onclick = () => onNodeSelected(node);
        container.appendChild(btn);
    });
}

function onNodeSelected(node) {
    document.querySelectorAll('.map-node-btn').forEach(b => b.remove());
    
    if (node.type === "Shop") {
        Engine.setMode('SHOP');
        Engine.gameState.shopDiscount = 0;
        UI.updateChatLog("You entered a local Shop.");
        Engine.gameState.phaserScene.children.removeAll();
        Engine.gameState.phaserScene.add.image(400, 300, 'shop').setScale(4);
        updateUIDOM();
    } else if (node.type === "Campfire") {
        Engine.setMode('SMITH');
        UI.updateChatLog("You found a traveling Blacksmith.");
        Engine.gameState.phaserScene.children.removeAll();
        Engine.gameState.phaserScene.add.image(400, 300, 'blacksmith').setScale(4);
        updateUIDOM();
    } else if (node.type === "Mystery") {
        triggerMystery();
    } else {
        triggerCombat(node.type === "Elite Combat");
    }
}

async function triggerCombat(isElite = false, isGuard = false) {
    Engine.setMode('COMBAT');
    Object.values(btns).forEach(b => b.disabled = true);
    
    try {
        const regionNames = MapSys.getAvailableRegions(Engine.gameState.player.level);
        const currentRegion = regionNames[regionNames.length - 1].name;
        
        let promptTheme = isGuard ? "guard" : (isElite ? "elite boss in " + currentRegion : currentRegion);
        
        const encounter = await AI.generateEncounter(
            Engine.gameState.player.hp, 
            Engine.gameState.player.derived.attack, 
            Engine.gameState.player.level, 
            promptTheme
        );

        let eName = isGuard ? "City Guard" : encounter.name;
        if (isElite && !isGuard) eName = "Elite " + eName;
        UI.updateChatLog(`Enemy Appeared! ${eName} - ${encounter.desc}`);
        
        const multiplier = isElite ? 2 : 1;
        Engine.setEnemy({
            name: eName,
            hp: 20 * Engine.gameState.player.level * multiplier,
            maxHp: 20 * Engine.gameState.player.level * multiplier,
            agi: (5 + Math.floor(Engine.gameState.player.level / 2)) * multiplier,
            statusEffects: [],
            derived: { 
                attack: (5 + Engine.gameState.player.level) * multiplier, 
                defense: 2 * multiplier, 
                critChance: 0.05 
            },
            greed: 10 + Math.floor(Math.random() * 20)
        });
        Engine.gameState.player.statusEffects = []; // Clear player status on new combat
        
        // Determine Initiative Turn Order
        const turnOrder = Engine.determineTurnOrder([
            { id: 'player', name: 'You', agi: Engine.gameState.player.baseStats.AGI },
            { id: 'enemy', name: eName, agi: Engine.gameState.enemy.agi }
        ]);
        Engine.gameState.combat = { turnOrder, turnIndex: 0 };
        
        UI.updateChatLog(`Turn Order: ${turnOrder.map(t => t.name).join(" -> ")}`);
        
        UI.renderEnemyEncounter(Engine.gameState.phaserScene, encounter);
        AudioSys.playDynamicAudio(Engine.gameState.phaserScene, encounter);
        
        processTurnQueue();
    } catch (e) {
        UI.updateChatLog("Error generating enemy.");
        updateUIDOM();
    }
}


// ----------------------------------------------------
// MYSTERY EVENT LOGIC
// ----------------------------------------------------
async function triggerMystery() {
    Engine.setMode('MYSTERY');
    updateUIDOM();
    UI.updateChatLog("Approaching a point of interest...");

    const regionNames = MapSys.getAvailableRegions(Engine.gameState.player.level);
    const currentRegion = regionNames[regionNames.length - 1].name;

    try {
        const eventData = await AI.generateMysteryEvent(currentRegion, Engine.gameState.player.level);
        UI.updateChatLog(`--- ${eventData.title} ---`);
        UI.updateChatLog(eventData.desc);

        const container = document.getElementById('action-buttons');
        document.querySelectorAll('.map-node-btn').forEach(b => b.remove());

        eventData.choices.forEach((choice) => {
            const btn = document.createElement('button');
            btn.className = 'action-btn map-node-btn';
            btn.innerText = choice.text + (choice.stat_check !== 'NONE' ? ` [${choice.stat_check}]` : '');
            btn.onclick = () => onMysteryChoice(eventData, choice);
            container.appendChild(btn);
        });
    } catch(e) {
        UI.updateChatLog("The mystery vanishes before your eyes...");
        returnToMap();
    }
}

async function onMysteryChoice(eventData, choice) {
    document.querySelectorAll('.map-node-btn').forEach(b => b.disabled = true);
    
    let rollTotal = null;
    let isSuccess = null;

    if (choice.stat_check !== 'NONE' && Engine.gameState.player.baseStats[choice.stat_check]) {
        const statVal = Engine.gameState.player.baseStats[choice.stat_check];
        const check = Skills.performSkillCheck(statVal, 10 + Engine.gameState.player.level);
        rollTotal = check.total;
        isSuccess = check.success;
        UI.updateChatLog(`Rolling ${choice.stat_check}... Rolled a ${check.roll} + ${statVal} = ${rollTotal}.`);
        
        await new Promise(resolve => rollD20Animation(Engine.gameState.phaserScene, `D20: ${rollTotal}`, resolve));
    } else {
        UI.updateChatLog(`You chose: ${choice.text}`);
    }

    UI.updateChatLog("Resolving outcome...");

    const outcome = await AI.resolveMysteryEvent(eventData.desc, choice, rollTotal);
    UI.updateChatLog(outcome.desc);

    if (outcome.consequence) {
        if (outcome.consequence.hp_change) {
            if (outcome.consequence.hp_change > 0) Engine.healPlayer(outcome.consequence.hp_change);
            else {
                const died = Engine.damagePlayer(Math.abs(outcome.consequence.hp_change));
                if (died) {
                    UI.updateChatLog("YOU DIED from the event! Game Over. Refresh to restart.");
                    updateUIDOM();
                    return;
                }
            }
        }
        if (outcome.consequence.gold_change) {
            if (outcome.consequence.gold_change > 0) Engine.awardGold(outcome.consequence.gold_change);
            else Engine.spendGold(Math.abs(outcome.consequence.gold_change));
        }
        if (outcome.consequence.xp_change && outcome.consequence.xp_change > 0) {
            if (Engine.awardXP(outcome.consequence.xp_change)) {
                UI.updateChatLog(`LEVEL UP! You are now Level ${Engine.gameState.player.level}!`);
            }
        }
    }

    updateUIDOM();
    
    // Continue Button
    const container = document.getElementById('action-buttons');
    document.querySelectorAll('.map-node-btn').forEach(b => b.remove());
    const btn = document.createElement('button');
    btn.className = 'action-btn map-node-btn';
    btn.innerText = "Continue Adventure";
    btn.onclick = () => {
        document.querySelectorAll('.map-node-btn').forEach(b => b.remove());
        returnToMap();
    };
    container.appendChild(btn);
}

function returnToMap() {
    Engine.setMode('MAP');
    Engine.gameState.enemy = null;
    Engine.gameState.phaserScene.children.removeAll();
    AudioSys.playDynamicAudio(Engine.gameState.phaserScene, { is_hostile: false, visual_theme: "default" });
    updateUIDOM();
}

// ----------------------------------------------------
// COMBAT & SKILLS LOGIC
// ----------------------------------------------------
function processTurnQueue() {
    if (!Engine.gameState.enemy || Engine.gameState.mode !== 'COMBAT') return;
    
    let currentEntity = Engine.gameState.combat.turnOrder[Engine.gameState.combat.turnIndex];
    
    // Process DOT and Status Expiry
    const statusResults = Engine.processStatusEffects(currentEntity.id);
    statusResults.log.forEach(msg => UI.updateChatLog(msg));
    
    if (statusResults.isDead) {
        handleDeath(currentEntity.id);
        return;
    }
    
    if (currentEntity.id === 'enemy') {
        Object.values(btns).forEach(b => b.disabled = true);
        setTimeout(() => enemyTurn(), 1000);
    } else {
        Object.values(btns).forEach(b => b.disabled = false);
        updateUIDOM();
    }
}

function advanceTurn() {
    Engine.gameState.combat.turnIndex = (Engine.gameState.combat.turnIndex + 1) % Engine.gameState.combat.turnOrder.length;
    processTurnQueue();
}

function handleDeath(entityId) {
    if (entityId === 'player') {
        UI.updateChatLog("YOU DIED. Game Over. Refresh to restart.");
        Object.values(btns).forEach(b => b.disabled = true);
        updateUIDOM();
    } else {
        UI.updateChatLog(`You defeated the ${Engine.gameState.enemy.name}!`);
        Engine.awardGold(15);
        Meta.trackEnemyDefeated();
        if (Engine.awardXP(50)) {
            UI.updateChatLog(`LEVEL UP! You are now Level ${Engine.gameState.player.level}!`);
        }
        returnToMap();
    }
}

function enemyTurn() {
    if (!Engine.gameState.enemy) return;

    let eDmgRoll = Engine.calculateDamage(Engine.gameState.enemy.derived, Engine.gameState.player.derived);
    Engine.damagePlayer(eDmgRoll.damage);
    UI.updateChatLog(`${Engine.gameState.enemy.name} hit you for ${eDmgRoll.damage} damage!`);

    // 25% chance for enemy to poison
    if (Math.random() < 0.25) {
        Engine.applyStatusEffect('player', { name: "Poison", duration: 3, dot: 5 });
        UI.updateChatLog(`You were poisoned by ${Engine.gameState.enemy.name}!`);
    }

    if (Engine.gameState.player.hp <= 0) {
        handleDeath('player');
        return;
    }
    advanceTurn();
}

function onAttack() {
    SaveSys.trackPlayerChoice("Attack");
    if (!Engine.gameState.enemy) return;

    let dmgRoll = Engine.calculateDamage(Engine.gameState.player.derived, Engine.gameState.enemy.derived);
    Engine.damageEnemy(dmgRoll.damage);
    UI.updateChatLog(`You attacked ${Engine.gameState.enemy.name} for ${dmgRoll.damage} damage! ${dmgRoll.isCrit ? '(CRIT!)' : ''}`);

    // 25% chance for player to cause bleed
    if (Math.random() < 0.25) {
        Engine.applyStatusEffect('enemy', { name: "Bleed", duration: 3, dot: 5 });
        UI.updateChatLog(`${Engine.gameState.enemy.name} is bleeding!`);
    }

    if (Engine.gameState.enemy.hp <= 0) {
        handleDeath('enemy');
        return;
    }
    Object.values(btns).forEach(b => b.disabled = true);
    advanceTurn();
}

function onFlee() {
    SaveSys.trackPlayerChoice("Flee");
    const check = Skills.performSkillCheck(Engine.gameState.player.baseStats.AGI, 10);
    Object.values(btns).forEach(b => b.disabled = true);
    rollD20Animation(Engine.gameState.phaserScene, `FLEE D20: ${check.total}`, () => {
        if (check.success) {
            UI.updateChatLog("You successfully fled!");
            returnToMap();
        } else {
            UI.updateChatLog("Failed to flee!");
            advanceTurn();
        }
    });
}

function onSteal() {
    SaveSys.trackPlayerChoice("Steal");
    const check = Skills.performSkillCheck(Engine.gameState.player.baseStats.AGI, 15);
    Object.values(btns).forEach(b => b.disabled = true);
    rollD20Animation(Engine.gameState.phaserScene, `STEAL D20: ${check.total}`, () => {
        if (check.success) {
            UI.updateChatLog("Successfully pickpocketed 30 Gold!");
            Engine.awardGold(30);
            if (Engine.gameState.mode !== 'COMBAT') returnToMap(); 
            else advanceTurn();
        } else {
            UI.updateChatLog("Caught stealing! The guards have been alerted!");
            Skills.wantedLevel++;
            triggerCombat(false, true);
        }
    });
}

function onBribe() {
    SaveSys.trackPlayerChoice("Bribe");
    if (Engine.spendGold(10)) {
        const success = Economy.attemptBribe(10, Engine.gameState.enemy.greed);
        if (success) {
            UI.updateChatLog(`${Engine.gameState.enemy.name} accepted your bribe and left!`);
            returnToMap();
        } else {
            UI.updateChatLog(`${Engine.gameState.enemy.name} scoffed at your meager bribe!`);
            Object.values(btns).forEach(b => b.disabled = true);
            advanceTurn();
        }
    } else {
        UI.updateChatLog("Not enough gold to bribe.");
    }
}

// ----------------------------------------------------
// SHOP & BLACKSMITH LOGIC
// ----------------------------------------------------
function onHaggle() {
    const check = Skills.performSkillCheck(Engine.gameState.player.baseStats.CHA, 12);
    rollD20Animation(Engine.gameState.phaserScene, `HAGGLE D20: ${check.total}`, () => {
        if (check.success) {
            Engine.gameState.shopDiscount = 0.5; // 50% off
            UI.updateChatLog("The merchant liked your charm! 50% discount.");
        } else {
            UI.updateChatLog("The merchant was insulted by your lowball offer.");
            btns.haggle.disabled = true;
        }
        updateUIDOM();
    });
}

function onBuy() {
    SaveSys.trackPlayerChoice("Buy");
    const price = Math.floor(25 * (1 - Engine.gameState.shopDiscount));
    if (Engine.spendGold(price)) {
        const potion = { id: `pot_${Date.now()}`, name: "Health Potion", heal: 50 };
        Engine.addToInventory(potion);
        // Auto-consume for now since there's no inventory UI
        Engine.healPlayer(50);
        UI.updateChatLog(`Bought Potion! Healed 50 HP.`);
        updateUIDOM();
    } else {
        UI.updateChatLog("Not enough gold.");
    }
}

function onUpgrade() {
    SaveSys.trackPlayerChoice("Upgrade");
    if (Engine.spendGold(50)) {
        const weapon = { 
            id: `wpn_${Date.now()}`, 
            slot: 'weapon',
            name: `Iron Sword +${Engine.gameState.player.level}`,
            stats: { attack: 2 * Engine.gameState.player.level }
        };
        Engine.addToInventory(weapon);
        Engine.equipItem(weapon);
        
        UI.updateChatLog(`Forged and equipped ${weapon.name}!`);
        updateUIDOM();
    } else {
        UI.updateChatLog("Not enough gold.");
    }
}


// Bind Buttons
btns.explore.addEventListener('click', onExplore);
btns.attack.addEventListener('click', onAttack);
btns.flee.addEventListener('click', onFlee);
btns.steal.addEventListener('click', onSteal);
btns.bribe.addEventListener('click', onBribe);
btns.buy.addEventListener('click', onBuy);
btns.haggle.addEventListener('click', onHaggle);
btns.upgrade.addEventListener('click', onUpgrade);
btns.leave.addEventListener('click', returnToMap);

// Phaser Configuration
const config = {
    type: Phaser.AUTO,
    parent: 'phaser-container',
    width: 800,
    height: 600,
    backgroundColor: '#000000',
    pixelArt: true,
    scene: { preload: preload, create: create },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }
};

new Phaser.Game(config);

function preload() {
    AI.loadFallbackData();
    UI.preloadAssets(this);
    AudioSys.preloadAudio(this);
    
    // Load new generated images
    this.load.image('shop', './assets/sprites/shop.png');
    this.load.image('blacksmith', './assets/sprites/blacksmith.png');
    this.load.image('d20', './assets/sprites/d20.png');
}

async function create() {
    Engine.gameState.phaserScene = this;
    UI.setupUIHooks();

    const saved = SaveSys.loadGameState();
    if (saved && saved.state) {
        Object.assign(Engine.gameState, saved.state);
        Engine.gameState.phaserScene = this;
        Engine.recalculateDerivedStats();
        UI.updateChatLog("Game loaded from previous save!");
    } else {
        const pData = await Engine.fetchGameData('player_base.json');
        Engine.initPlayer(pData.base_stats);
        UI.updateChatLog("Welcome to Infinite RPG. Press Explore Map to begin.");
    }

    updateUIDOM();
}
