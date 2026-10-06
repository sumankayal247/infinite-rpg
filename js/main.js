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

function create() {
    // Basic text to confirm Phaser is working
    this.add.text(400, 300, 'Infinite RPG Engine Initialized', { 
        fontFamily: 'Courier', 
        fontSize: '24px', 
        color: '#00ff00' 
    }).setOrigin(0.5);
    
    console.log("Phaser Create: Ready");
}

function update() {
    // Main game loop logic for animations/rendering
}
