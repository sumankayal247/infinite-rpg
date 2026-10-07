/**
 * audio.js
 * Phase 4: Dynamic Audio System (Strictly Opus format)
 */

let currentBGM = null;
let currentTheme = null;

// Mock Opus tracks registry (pointing to placeholder wav for now to be playable)
const AUDIO_REGISTRY = {
    "hostile": "./assets/audio/default_bgm.opus",
    "forest": "./assets/audio/default_bgm.opus",
    "stone": "./assets/audio/default_bgm.opus",
    "default": "./assets/audio/default_bgm.opus"
};

export function preloadAudio(scene) {
    // Preload Opus tracks into the Phaser scene
    for (const [key, path] of Object.entries(AUDIO_REGISTRY)) {
        scene.load.audio(key, path);
    }
}

export function playDynamicAudio(scene, aiResponseJSON) {
    let targetTheme = "default";

    // Map AI JSON responses to Opus tracks
    if (aiResponseJSON.is_hostile) {
        targetTheme = "hostile";
    } else if (aiResponseJSON.visual_theme) {
        if (AUDIO_REGISTRY[aiResponseJSON.visual_theme]) {
            targetTheme = aiResponseJSON.visual_theme;
        }
    }

    if (currentTheme === targetTheme) return; // Already playing

    const newBGM = scene.sound.add(targetTheme, { loop: true, volume: 0 });
    newBGM.play();

    // Crossfade Logic
    if (currentBGM) {
        scene.tweens.add({
            targets: currentBGM,
            volume: 0,
            duration: 1000,
            onComplete: (tween, targets) => {
                targets[0].stop();
                targets[0].destroy();
            }
        });
    }

    scene.tweens.add({
        targets: newBGM,
        volume: 0.5, // Target volume
        duration: 1000
    });

    currentBGM = newBGM;
    currentTheme = targetTheme;
}

export function playSFX(scene, sfxName) {
    // Expected to be preloaded Opus file
    scene.sound.play(sfxName);
}
