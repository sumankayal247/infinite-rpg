import * as Engine from './engine.js';
import * as AI from './ai.js';
import * as AudioSys from './audio.js';
import * as UI from './ui.js';
import * as MapSys from './map.js';
import * as Skills from './skills.js';
import * as Economy from './economy.js';
import * as Meta from './meta.js';

// Game State
let gameState = {
    mode: 'MAP', // MAP, COMBAT, SHOP, SMITH
    player: {
        hp: 100, maxHp: 100,
        level: 1, xp: 0, gold: 50,
        baseStats: null,
        derived: null
    },
    enemy: null,
    phaserScene: null,
    shopDiscount: 0
};

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
    stats.hp.innerText = gameState.player.hp;
    stats.maxHp.innerText = gameState.player.maxHp;
    stats.lvl.innerText = gameState.player.level;
    stats.xp.innerText = gameState.player.xp;
    stats.gold.innerText = gameState.player.gold;

    // Hide all
    Object.values(btns).forEach(b => b.style.display = 'none');

    // Show based on mode
    if (gameState.mode === 'MAP') {
        btns.explore.style.display = 'block';
    } else if (gameState.mode === 'COMBAT') {
        btns.attack.style.display = 'block';
        btns.bribe.style.display = 'block';
        btns.flee.style.display = 'block';
        if (gameState.enemy.name !== "Guard") btns.steal.style.display = 'block';
    } else if (gameState.mode === 'SHOP') {
        btns.buy.style.display = 'block';
        btns.haggle.style.display = 'block';
        btns.steal.style.display = 'block';
        btns.leave.style.display = 'block';
        btns.buy.innerText = `Buy Potion (${Math.floor(25 * (1 - gameState.shopDiscount))}g)`;
    } else if (gameState.mode === 'SMITH') {
        btns.upgrade.style.display = 'block';
        btns.leave.style.display = 'block';
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
    UI.updateChatLog("Exploring the nodes...");
    btns.explore.disabled = true;

    // Generate Map Nodes
    const nodes = MapSys.generateNodesForRegion(1, 1); // just pick 1 for immediate play
    const node = nodes[0];

    if (node.type === "Shop") {
        gameState.mode = 'SHOP';
        gameState.shopDiscount = 0;
        UI.updateChatLog("You entered a local Shop.");
        gameState.phaserScene.children.removeAll();
        gameState.phaserScene.add.image(400, 300, 'shop').setScale(4);
        updateUIDOM();
        btns.explore.disabled = false;
    } else if (node.type === "Campfire") {
        gameState.mode = 'SMITH';
        UI.updateChatLog("You found a traveling Blacksmith.");
        gameState.phaserScene.children.removeAll();
        gameState.phaserScene.add.image(400, 300, 'blacksmith').setScale(4);
        updateUIDOM();
        btns.explore.disabled = false;
    } else {
        triggerCombat();
    }
}

async function triggerCombat(wanted = false) {
    gameState.mode = 'COMBAT';
    
    try {
        let promptTheme = wanted ? "guard" : "random";
        const encounter = await AI.generateEncounter(
            gameState.player.hp, 
            gameState.player.derived.attack, 
            gameState.player.level, 
            promptTheme
        );

        const eName = wanted ? "City Guard" : encounter.name;
        UI.updateChatLog(`Enemy Appeared! ${eName} - ${encounter.desc}`);
        
        gameState.enemy = {
            name: eName,
            hp: 20 * gameState.player.level,
            maxHp: 20 * gameState.player.level,
            derived: { attack: 5 + gameState.player.level, defense: 2, critChance: 0.05 },
            greed: 10 + Math.floor(Math.random() * 20) // Random greed stat
        };
        
        UI.renderEnemyEncounter(gameState.phaserScene, encounter);
        AudioSys.playDynamicAudio(gameState.phaserScene, encounter);
    } catch (e) {
        UI.updateChatLog("Error generating enemy.");
    }
    btns.explore.disabled = false;
    updateUIDOM();
}

function returnToMap() {
    gameState.mode = 'MAP';
    gameState.enemy = null;
    gameState.phaserScene.children.removeAll();
    AudioSys.playDynamicAudio(gameState.phaserScene, { is_hostile: false, visual_theme: "default" });
    updateUIDOM();
}

// ----------------------------------------------------
// COMBAT & SKILLS LOGIC
// ----------------------------------------------------
function onAttack() {
    if (!gameState.enemy) return;

    let dmgRoll = Engine.calculateDamage(gameState.player.derived, gameState.enemy.derived);
    gameState.enemy.hp -= dmgRoll.damage;
    UI.updateChatLog(`You attacked ${gameState.enemy.name} for ${dmgRoll.damage} damage! ${dmgRoll.isCrit ? '(CRIT!)' : ''}`);

    if (gameState.enemy.hp <= 0) {
        UI.updateChatLog(`You defeated the ${gameState.enemy.name}!`);
        gameState.player.xp += 50;
        gameState.player.gold += 15;
        Meta.trackEnemyDefeated();
        checkLevelUp();
        returnToMap();
        return;
    }
    enemyTurn();
}

function onFlee() {
    // AGI Check to flee
    const check = Skills.performSkillCheck(gameState.player.baseStats.AGI, 10);
    rollD20Animation(gameState.phaserScene, `FLEE D20: ${check.total}`, () => {
        if (check.success) {
            UI.updateChatLog("You successfully fled!");
            returnToMap();
        } else {
            UI.updateChatLog("Failed to flee!");
            enemyTurn();
        }
    });
}

function onSteal() {
    // AGI Check to Steal
    const check = Skills.performSkillCheck(gameState.player.baseStats.AGI, 15);
    rollD20Animation(gameState.phaserScene, `STEAL D20: ${check.total}`, () => {
        if (check.success) {
            UI.updateChatLog("Successfully pickpocketed 30 Gold!");
            gameState.player.gold += 30;
            if (gameState.mode !== 'COMBAT') returnToMap(); // Evaded detection in shop
            else updateUIDOM();
        } else {
            UI.updateChatLog("Caught stealing! The guards have been alerted!");
            Skills.wantedLevel++;
            triggerCombat(true);
        }
    });
}

function onBribe() {
    if (gameState.player.gold >= 10) {
        gameState.player.gold -= 10;
        const success = Economy.attemptBribe(10, gameState.enemy.greed);
        if (success) {
            UI.updateChatLog(`${gameState.enemy.name} accepted your bribe and left!`);
            returnToMap();
        } else {
            UI.updateChatLog(`${gameState.enemy.name} scoffed at your meager bribe!`);
            enemyTurn();
        }
    } else {
        UI.updateChatLog("Not enough gold to bribe.");
    }
}

function enemyTurn() {
    let eDmgRoll = Engine.calculateDamage(gameState.enemy.derived, gameState.player.derived);
    gameState.player.hp -= eDmgRoll.damage;
    UI.updateChatLog(`${gameState.enemy.name} hit you for ${eDmgRoll.damage} damage!`);

    if (gameState.player.hp <= 0) {
        UI.updateChatLog("YOU DIED. Game Over. Refresh to restart.");
        Object.values(btns).forEach(b => b.disabled = true);
    }
    updateUIDOM();
}

// ----------------------------------------------------
// SHOP & BLACKSMITH LOGIC
// ----------------------------------------------------
function onHaggle() {
    const check = Skills.performSkillCheck(gameState.player.baseStats.CHA, 12);
    rollD20Animation(gameState.phaserScene, `HAGGLE D20: ${check.total}`, () => {
        if (check.success) {
            gameState.shopDiscount = 0.5; // 50% off
            UI.updateChatLog("The merchant liked your charm! 50% discount.");
        } else {
            UI.updateChatLog("The merchant was insulted by your lowball offer.");
            btns.haggle.disabled = true;
        }
        updateUIDOM();
    });
}

function onBuy() {
    const price = Math.floor(25 * (1 - gameState.shopDiscount));
    if (gameState.player.gold >= price) {
        gameState.player.gold -= price;
        gameState.player.hp = Math.min(gameState.player.maxHp, gameState.player.hp + 50);
        UI.updateChatLog(`Bought Potion and healed 50 HP!`);
        updateUIDOM();
    } else {
        UI.updateChatLog("Not enough gold.");
    }
}

function onUpgrade() {
    if (gameState.player.gold >= 50) {
        gameState.player.gold -= 50;
        gameState.player.baseStats.STR += 2;
        gameState.player.derived = Engine.deriveStats(gameState.player.baseStats);
        UI.updateChatLog("Weapon upgraded! (+2 STR)");
        updateUIDOM();
    } else {
        UI.updateChatLog("Not enough gold.");
    }
}

function checkLevelUp() {
    let levelCheck = Engine.checkLevelUp(gameState.player.level, gameState.player.xp);
    if (levelCheck.leveledUp) {
        gameState.player.level = levelCheck.newLevel;
        gameState.player.xp = levelCheck.remainingXp;
        gameState.player.baseStats.STR += 2;
        gameState.player.baseStats.VIT += 2;
        gameState.player.derived = Engine.deriveStats(gameState.player.baseStats);
        gameState.player.maxHp = gameState.player.derived.maxHp;
        gameState.player.hp = gameState.player.maxHp;
        UI.updateChatLog(`LEVEL UP! You are now Level ${gameState.player.level}!`);
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
    gameState.phaserScene = this;
    UI.setupUIHooks();

    // Init Player
    const pData = await Engine.fetchGameData('player_base.json');
    gameState.player.baseStats = pData.base_stats;
    gameState.player.derived = Engine.deriveStats(pData.base_stats);
    gameState.player.maxHp = gameState.player.derived.maxHp;
    gameState.player.hp = gameState.player.maxHp;

    UI.updateChatLog("Welcome to Infinite RPG. Press Explore Map to begin.");
    updateUIDOM();
}
