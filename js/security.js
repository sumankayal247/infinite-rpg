/**
 * security.js
 * Phase 6: Cybersecurity Golden Rules
 */

// 1. XSS Prevention Helper
// While we already use textContent in ui.js, providing a strict sanitization helper
// ensures any future DOM insertions remain safe.
export function safeText(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML; // Returns HTML-escaped string
}

// 2. State Tampering
// Handled inherently by our architecture: all state is encapsulated within 
// ES6 Module closures (e.g., ai.js, engine.js, skills.js). 
// There are no variables exposed to the global `window` object aside from Phaser.

// 3. Prompt Injection Protection
export function sanitizePlayerInput(input) {
    if (!input || typeof input !== 'string') return "";
    
    let sanitized = input.trim();
    
    // List of common prompt injection vectors to strip
    const blacklist = [
        "ignore previous",
        "ignore all",
        "system prompt",
        "forget your instructions",
        "you are now",
        "bypass",
        "new rule"
    ];

    // Filter out blacklisted phrases (case-insensitive)
    blacklist.forEach(phrase => {
        const regex = new RegExp(phrase, "gi");
        sanitized = sanitized.replace(regex, "[REDACTED]");
    });

    // Remove any markdown code blocks or JSON formatting tricks from the player
    sanitized = sanitized.replace(/```/g, '');
    sanitized = sanitized.replace(/[{}]/g, ''); // Strip curly braces to prevent JSON injection

    return sanitized;
}
