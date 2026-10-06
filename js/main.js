import * as Engine from './engine.js';
import * as AI from './ai.js';
import * as AudioSys from './audio.js';
import * as UI from './ui.js';

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
    console.log("Phaser Preload: Initialized");
    
    // Load AI graceful degradation fallback data
    AI.loadFallbackData();
    
    // Phase 4: Preload Assets & Audio
    UI.preloadAssets(this);
    AudioSys.preloadAudio(this);
}

async function create() {
    this.add.text(400, 50, 'Infinite RPG Engine Initialized', { 
        fontFamily: 'Courier', 
        fontSize: '24px', 
        color: '#00ff00' 
    }).setOrigin(0.5);
    
    console.log("Phaser Create: Ready");

    // Phase 1 Test: Load data and test engine
    try {
        const playerData = await Engine.fetchGameData('player_base.json');
        
        // Phase 4 Test: Trigger AI and render via UI/Audio
        const encounter = await AI.generateEncounter(100, 15, 1, "ice");
        UI.renderEnemyEncounter(this, encounter);
        AudioSys.playDynamicAudio(this, encounter);
        
    } catch (e) {
        console.error("Engine test failed:", e);
    }
}

function update() {
    // Main game loop logic for animations/rendering
}
