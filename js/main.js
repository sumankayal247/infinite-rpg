import * as Engine from './engine.js';

// Phaser Game Configuration
const config = {
    type: Phaser.AUTO,
    parent: 'phaser-container',
    width: 800,
    height: 600,
    backgroundColor: '#000000',
    pixelArt: true, // Crucial for 64-bit retro aesthetic
    scene: {
        preload: preload,
        create: create,
        update: update
    },
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
    }
};

const game = new Phaser.Game(config);

function preload() {
    // Preload assets here later (AVIF, SVG, Opus)
    console.log("Phaser Preload: Initialized");
}

async function create() {
    this.add.text(400, 300, 'Infinite RPG Engine Initialized', { 
        fontFamily: 'Courier', 
        fontSize: '24px', 
        color: '#00ff00' 
    }).setOrigin(0.5);
    
    console.log("Phaser Create: Ready");

    // Phase 1 Test: Load data and test engine
    try {
        const playerData = await Engine.fetchGameData('player_base.json');
        console.log("Base Player Data Loaded:", playerData);
        
        const derived = Engine.deriveStats(playerData.base_stats, [{stats: {attack: 5}}]);
        console.log("Derived Stats (with +5 ATK sword):", derived);

        const damageRoll = Engine.calculateDamage(derived, {defense: 10});
        console.log("Test Damage Roll vs 10 DEF:", damageRoll);
    } catch (e) {
        console.error("Engine test failed:", e);
    }
}

function update() {
    // Main game loop logic for animations/rendering
}
