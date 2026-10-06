// Game State
const gameState = {
    player: {
        hp: 100,
        maxHp: 100,
        level: 1,
        xp: 0
    }
};

// DOM Elements
const logElement = document.getElementById('log');
const btnExplore = document.getElementById('btn-explore');
const hpVal = document.getElementById('hp-val');

function appendLog(message) {
    const p = document.createElement('div');
    p.innerText = message;
    logElement.appendChild(p);
    
    // Auto-scroll to bottom
    const gameView = document.getElementById('game-view');
    gameView.scrollTop = gameView.scrollHeight;
}

function updateUI() {
    hpVal.innerText = gameState.player.hp;
}

// Event Listeners
btnExplore.addEventListener('click', () => {
    appendLog("You venture further into the unknown...");
    // Phase 2 logic will connect here
});

// Init
updateUI();
