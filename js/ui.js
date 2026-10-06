/**
 * ui.js
 * Phase 4: Asset Generation & Phaser UI Rendering
 */

const THEME_COLORS = {
    "ice": 0x00ffff,
    "fire": 0xff3300,
    "forest": 0x33ff33,
    "void": 0x9900ff,
    "stone": 0x888888,
    "default": 0xffffff
};

export function preloadAssets(scene) {
    // Preload base AVIF template
    scene.load.image('base_enemy', './assets/sprites/base_enemy.avif');
}

export function renderEnemyEncounter(scene, aiResponseJSON) {
    // Determine color based on AI visual_theme
    const themeColor = THEME_COLORS[aiResponseJSON.visual_theme] || THEME_COLORS["default"];

    // Render the base AVIF sprite to the Phaser Canvas
    const sprite = scene.add.image(400, 200, 'base_enemy');
    sprite.setScale(4); // Scale up for blocky 64-bit feel

    // Procedural 64-bit Assets: Use Phaser's tint pipeline to hue-shift the base AVIF template
    sprite.setTint(themeColor);

    // Render the name
    scene.add.text(400, 320, aiResponseJSON.name, {
        fontFamily: 'Courier',
        fontSize: '20px',
        color: '#ffffff',
        backgroundColor: '#000000'
    }).setOrigin(0.5);

    // Update DOM Chat Log
    updateChatLog(`Encountered: ${aiResponseJSON.name} - ${aiResponseJSON.desc}`);

    return sprite;
}

export function updateChatLog(message) {
    const chatLog = document.getElementById('chat-log');
    if (!chatLog) return;

    const entry = document.createElement('p');
    entry.textContent = message; // Phase 6: XSS Prevention (using textContent)
    chatLog.appendChild(entry);
    
    // Auto-scroll
    chatLog.scrollTop = chatLog.scrollHeight;
}
