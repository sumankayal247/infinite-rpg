import * as Engine from './engine.js';
import * as AI from './ai.js';
import * as AudioSys from './audio.js';
import * as UI from './ui.js';
import * as Map from './map.js';

// Game State
let gameState = {
    mode: 'MAP', // MAP or COMBAT
    player: {
        hp: 100, maxHp: 100,
        level: 1, xp: 0, gold: 0,
        baseStats: null,
        derived: null
    },
    enemy: null,
    phaserScene: null
};

// DOM
const btnExplore = document.getElementById('btn-explore');
const btnAttack = document.getElementById('btn-attack');
const btnFlee = document.getElementById('btn-flee');

const statHp = document.getElementById('stat-hp');
const statMaxHp = document.getElementById('stat-maxhp');
const statLvl = document.getElementById('stat-lvl');
const statXp = document.getElementById('stat-xp');
const statGold = document.getElementById('stat-gold');

function updateUIDOM() {
    statHp.innerText = gameState.player.hp;
    statMaxHp.innerText = gameState.player.maxHp;
    statLvl.innerText = gameState.player.level;
    statXp.innerText = gameState.player.xp;
    statGold.innerText = gameState.player.gold;

    if (gameState.mode === 'MAP') {
        btnExplore.style.display = 'block';
        btnAttack.style.display = 'none';
        btnFlee.style.display = 'none';
    } else {
        btnExplore.style.display = 'none';
        btnAttack.style.display = 'block';
        btnFlee.style.display = 'block';
    }
}

// Actions
async function onExplore() {
    if (gameState.mode !== 'MAP') return;
    
    UI.updateChatLog("Exploring...");
    btnExplore.disabled = true;

    try {
        const encounter = await AI.generateEncounter(
            gameState.player.hp, 
            gameState.player.derived.attack, 
            gameState.player.level, 
            "random"
        );

        if (encounter.is_hostile) {
            UI.updateChatLog(`Enemy Appeared! ${encounter.name} - ${encounter.desc}`);
            
            // Set Enemy State
            gameState.enemy = {
                name: encounter.name,
                hp: 20 * gameState.player.level,
                maxHp: 20 * gameState.player.level,
                derived: { attack: 5 + gameState.player.level, defense: 2, critChance: 0.05 }
            };
            
            gameState.mode = 'COMBAT';
            UI.renderEnemyEncounter(gameState.phaserScene, encounter);
            AudioSys.playDynamicAudio(gameState.phaserScene, encounter);
        } else {
            UI.updateChatLog(`Peaceful Encounter: ${encounter.name} - ${encounter.desc}`);
            gameState.player.gold += 10;
            UI.updateChatLog("You found 10 Gold!");
        }
    } catch (e) {
        UI.updateChatLog("The path is blocked right now.");
    }

    btnExplore.disabled = false;
    updateUIDOM();
}

function onAttack() {
    if (gameState.mode !== 'COMBAT' || !gameState.enemy) return;

    // Player attacks
    let dmgRoll = Engine.calculateDamage(gameState.player.derived, gameState.enemy.derived);
    gameState.enemy.hp -= dmgRoll.damage;
    UI.updateChatLog(`You attacked ${gameState.enemy.name} for ${dmgRoll.damage} damage! ${dmgRoll.isCrit ? '(CRITICAL!)' : ''}`);

    if (gameState.enemy.hp <= 0) {
        // Victory
        UI.updateChatLog(`You defeated the ${gameState.enemy.name}!`);
        gameState.player.xp += 50;
        gameState.player.gold += 15;
        
        let levelCheck = Engine.checkLevelUp(gameState.player.level, gameState.player.xp);
        if (levelCheck.leveledUp) {
            gameState.player.level = levelCheck.newLevel;
            gameState.player.xp = levelCheck.remainingXp;
            gameState.player.baseStats.STR += 2;
            gameState.player.baseStats.VIT += 2;
            gameState.player.derived = Engine.deriveStats(gameState.player.baseStats);
            gameState.player.maxHp = gameState.player.derived.maxHp;
            gameState.player.hp = gameState.player.maxHp; // Heal on level up
            UI.updateChatLog(`LEVEL UP! You are now Level ${gameState.player.level}!`);
        }

        gameState.mode = 'MAP';
        gameState.enemy = null;
        gameState.phaserScene.children.removeAll(); // Clear enemy
        AudioSys.playDynamicAudio(gameState.phaserScene, { is_hostile: false, visual_theme: "default" });
        updateUIDOM();
        return;
    }

    // Enemy attacks back
    let eDmgRoll = Engine.calculateDamage(gameState.enemy.derived, gameState.player.derived);
    gameState.player.hp -= eDmgRoll.damage;
    UI.updateChatLog(`${gameState.enemy.name} hit you for ${eDmgRoll.damage} damage!`);

    if (gameState.player.hp <= 0) {
        // Game Over
        UI.updateChatLog("YOU DIED. Game Over. Refresh to restart.");
        gameState.player.hp = 0;
        btnAttack.disabled = true;
        btnFlee.disabled = true;
    }

    updateUIDOM();
}

function onFlee() {
    if (gameState.mode !== 'COMBAT') return;
    
    // 50% chance to flee
    if (Math.random() > 0.5) {
        UI.updateChatLog("You successfully fled the battle!");
        gameState.mode = 'MAP';
        gameState.enemy = null;
        gameState.phaserScene.children.removeAll(); // Clear enemy
        AudioSys.playDynamicAudio(gameState.phaserScene, { is_hostile: false, visual_theme: "default" });
    } else {
        UI.updateChatLog("Failed to flee!");
        // Enemy attacks
        let eDmgRoll = Engine.calculateDamage(gameState.enemy.derived, gameState.player.derived);
        gameState.player.hp -= eDmgRoll.damage;
        UI.updateChatLog(`${gameState.enemy.name} hit you for ${eDmgRoll.damage} damage!`);
        if (gameState.player.hp <= 0) {
            UI.updateChatLog("YOU DIED while trying to flee. Game Over.");
            gameState.player.hp = 0;
            btnAttack.disabled = true;
            btnFlee.disabled = true;
        }
    }
    updateUIDOM();
}

// Bind Buttons
btnExplore.addEventListener('click', onExplore);
btnAttack.addEventListener('click', onAttack);
btnFlee.addEventListener('click', onFlee);

// Phaser Configuration
const config = {
    type: Phaser.AUTO,
    parent: 'phaser-container',
    width: 800,
    height: 600,
    backgroundColor: '#000000',
    pixelArt: true,
    scene: {
        preload: preload,
        create: create
    },
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
    }
};

new Phaser.Game(config);

function preload() {
    AI.loadFallbackData();
    UI.preloadAssets(this);
    AudioSys.preloadAudio(this);
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

    UI.updateChatLog("Welcome to Infinite RPG. Press Explore to begin.");
    updateUIDOM();
}
