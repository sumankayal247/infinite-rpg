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
    // Preload placeholder sprites
    scene.load.image('base_enemy', './assets/sprites/base_enemy.avif');
    scene.load.image('default_bg', './assets/backgrounds/default_bg.avif');
}

export function renderEnemyEncounter(scene, aiResponseJSON) {
    // Clear previous children
    scene.children.removeAll();

    // Render background
    scene.add.image(400, 300, 'default_bg');

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

    return sprite;
}

export let isSlowTyping = true;

export function setupUIHooks() {
    // Hamburger Menu
    const menuBtn = document.getElementById('hamburger-menu');
    const statsPanel = document.getElementById('stats-panel');
    if (menuBtn && statsPanel) {
        menuBtn.addEventListener('click', () => {
            statsPanel.classList.toggle('open');
        });
    }

    // Accessibility Toggles
    const crtToggle = document.getElementById('toggle-crt');
    if (crtToggle) {
        crtToggle.addEventListener('change', (e) => {
            document.body.classList.toggle('disable-crt', !e.target.checked);
        });
    }

    const scaleToggle = document.getElementById('toggle-text-scale');
    if (scaleToggle) {
        scaleToggle.addEventListener('change', (e) => {
            document.body.classList.toggle('large-text', e.target.checked);
        });
    }

    const slowTypeToggle = document.getElementById('toggle-slow-type');
    if (slowTypeToggle) {
        slowTypeToggle.addEventListener('change', (e) => {
            isSlowTyping = e.target.checked;
        });
    }

    // Settings Menu Toggle
    const settingsToggle = document.getElementById('settings-toggle');
    if (settingsToggle) {
        settingsToggle.addEventListener('click', () => {
            const cog = document.getElementById('settings-cog');
            const controls = document.getElementById('a11y-controls');
            if (cog) cog.classList.toggle('rotated');
            if (controls) controls.classList.toggle('open');
        });
    }
}

export function updateChatLog(message) {
    const chatLog = document.getElementById('chat-log');
    if (!chatLog) return;

    const entry = document.createElement('p');
    chatLog.appendChild(entry);

    if (isSlowTyping) {
        let i = 0;
        function typeWriter() {
            if (i < message.length) {
                entry.textContent += message.charAt(i);
                i++;
                chatLog.scrollTop = chatLog.scrollHeight;
                setTimeout(typeWriter, 20); // 20ms delay per char
            }
        }
        typeWriter();
    } else {
        entry.textContent = message; // Phase 6: XSS Prevention
        chatLog.scrollTop = chatLog.scrollHeight;
    }
}

// ASCII world map mirror (DOM fallback + screen-reader copy).
// Uses textContent only (XSS-safe). Primary theme color via CSS.
export function renderAsciiMap(asciiString) {
    const pre = document.getElementById('ascii-map');
    if (!pre) return;
    pre.textContent = asciiString;
}

export function clearAsciiMap() {
    const pre = document.getElementById('ascii-map');
    if (pre) pre.textContent = "";
}
