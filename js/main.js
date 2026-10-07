import * as Engine from "./engine.js";
import * as AI from "./ai.js";
import * as AudioSys from "./audio.js";
import * as SaveSys from "./save.js";
import * as UI from "./ui.js";
import * as MapSys from "./map.js";
import * as Skills from "./skills.js";
import * as Economy from "./economy.js";
import * as Meta from "./meta.js";
import BootScene from "./scenes/BootScene.js";
import MainMenuScene from "./scenes/MainMenuScene.js";
import MapScene from "./scenes/MapScene.js";
import CombatScene from "./scenes/CombatScene.js";
import ShopScene from "./scenes/ShopScene.js";
import EventScene from "./scenes/EventScene.js";

function getActiveScene() {
  if (!Engine.gameState.phaserGame) return null;
  return Engine.gameState.phaserGame.scene.scenes.find((s) =>
    s.scene.isActive(),
  );
}

function switchScene(key) {
  const current = getActiveScene();
  if (current && current.scene.key !== key) {
    current.scene.switch(key);
  } else if (!current) {
    Engine.gameState.phaserGame.scene.start(key);
  }
  return Engine.gameState.phaserGame.scene.getScene(key);
}
// Game State

// DOM Elements
const btns = {
  explore: document.getElementById("btn-explore"),
  attack: document.getElementById("btn-attack"),
  bribe: document.getElementById("btn-bribe"),
  steal: document.getElementById("btn-steal"),
  flee: document.getElementById("btn-flee"),
  buy: document.getElementById("btn-shop-buy"),
  gear: document.getElementById("btn-shop-gear"),
  haggle: document.getElementById("btn-shop-haggle"),
  upgrade: document.getElementById("btn-smith-upgrade"),
  leave: document.getElementById("btn-leave"),
};

const stats = {
  hp: document.getElementById("stat-hp"),
  maxHp: document.getElementById("stat-maxhp"),
  lvl: document.getElementById("stat-lvl"),
  xp: document.getElementById("stat-xp"),
  gold: document.getElementById("stat-gold"),
};

function updateUIDOM() {
  stats.hp.innerText = Engine.gameState.player.hp;
  stats.maxHp.innerText = Engine.gameState.player.maxHp;
  stats.lvl.innerText = Engine.gameState.player.level;
  stats.xp.innerText = Engine.gameState.player.xp;
  stats.gold.innerText = Engine.gameState.player.gold;

  // Update equipment
  const eq = Engine.gameState.player.equipment;
  const wpnSpan = document.getElementById("eq-weapon");
  const amrSpan = document.getElementById("eq-armor");
  const accSpan = document.getElementById("eq-accessory");
  if (wpnSpan)
    wpnSpan.innerText = eq.weapon
      ? `${eq.weapon.name} ${eq.weapon.broken ? "(BROKEN)" : `(${eq.weapon.durability}/${eq.weapon.maxDurability})`}`
      : "None";
  if (amrSpan) amrSpan.innerText = eq.armor ? eq.armor.name : "None";
  if (accSpan) accSpan.innerText = eq.accessory ? eq.accessory.name : "None";

  // Update inventory
  const invList = document.getElementById("inv-list");
  if (invList) {
    invList.innerHTML = "";
    Engine.gameState.player.inventory.forEach((item) => {
      const li = document.createElement("li");
      li.innerText = item.name + (item.broken ? " (BROKEN)" : "");
      invList.appendChild(li);
    });
  }

  // Hide and reset disabled state for all
  const isDead = Engine.gameState.player.hp <= 0;
  Object.values(btns).forEach((b) => {
    b.style.display = "none";
    b.disabled = isDead;
  });

  // Check if we are showing map choices
  const mapChoicesVisible =
    document.querySelectorAll(".map-node-btn").length > 0;

  // Show based on mode
  if (Engine.gameState.mode === "MAP") {
    if (!mapChoicesVisible) btns.explore.style.display = "block";
  } else if (Engine.gameState.mode === "COMBAT") {
    btns.attack.style.display = "block";
    btns.bribe.style.display = "block";
    btns.flee.style.display = "block";
    if (Engine.gameState.enemy && Engine.gameState.enemy.name !== "City Guard")
      btns.steal.style.display = "block";
  } else if (Engine.gameState.mode === "SHOP") {
    btns.buy.style.display = "block";
    btns.gear.style.display = "block";
    btns.haggle.style.display = "block";
    btns.steal.style.display = "block";
    btns.gear.innerText = `Buy Gear (${Math.floor(75 * (1 - Engine.gameState.shopDiscount))}g)`;
    btns.leave.style.display = "block";
    btns.buy.innerText = `Buy Potion (${Math.floor(25 * (1 - Engine.gameState.shopDiscount))}g)`;
  } else if (Engine.gameState.mode === "SMITH") {
    btns.upgrade.style.display = "block";
    btns.leave.style.display = "block";
  } else if (Engine.gameState.mode === "MYSTERY") {
    // DOM choice buttons (.map-node-btn) handle themselves.
    // Fail-safe: if canvas choices never rendered, offer Leave.
    if (document.querySelectorAll(".map-node-btn").length === 0) {
      btns.leave.style.display = "block";
    }
  }

  // GLOBAL FAIL-SAFE: the loop must never strand the player with no
  // visible action. If alive and nothing is shown, force MAP + Explore.
  const anyVisible = Object.values(btns).some(
    (b) => b.style.display !== "none",
  );
  const anyChoice = document.querySelectorAll(".map-node-btn").length > 0;
  if (!anyVisible && !anyChoice && !isDead) {
    Engine.setMode("MAP");
    btns.explore.style.display = "block";
  }
}

// ----------------------------------------------------
// NEVER-STOP LOOP HELPERS
// Every handler funnels errors here instead of softlocking.
// ----------------------------------------------------
function clearDomChoices() {
  document.querySelectorAll(".map-node-btn").forEach((b) => b.remove());
}

function recover(err, where) {
  console.error(`[recover:${where}]`, err);
  try {
    UI.updateChatLog("The path twists... you press onward.");
  } catch {}
  clearDomChoices();
  returnToMap();
}

function safe(where, fn) {
  return (...args) => {
    try {
      const r = fn(...args);
      if (r && typeof r.catch === "function") r.catch((e) => recover(e, where));
    } catch (e) {
      recover(e, where);
    }
  };
}

// D20 roll that never crashes on a missing scene (skips animation)
function safeRoll(text) {
  const sc = getActiveScene();
  if (!sc || !sc.tweens) return Promise.resolve();
  return new Promise((resolve) => rollD20Animation(sc, text, resolve));
}

// Guarantees playable stats before any loop step (fixes null derived)
async function ensureReadyOrWarn() {
  const ok = await Engine.ensurePlayerReady();
  if (!ok) UI.updateChatLog("Your spirit falters... (stats failed to load)");
  updateUIDOM();
  return ok;
}

// ----------------------------------------------------
// DICE ANIMATION (Phase 2 Requirement)
// ----------------------------------------------------
function rollD20Animation(scene, resultText, onComplete) {
  try {
    if (!scene || !scene.add) throw new Error("no scene");
    const hasDie = scene.textures && scene.textures.exists("d20");
    const dice = hasDie
      ? scene.add.image(400, 300, "d20").setScale(2)
      : scene.add.rectangle(400, 300, 90, 90, 0x0f380f).setOrigin(0.5);

  // Spin animation
  scene.tweens.add({
    targets: dice,
    angle: 720,
    scale: 4,
    duration: 1000,
    ease: "Cubic.easeOut",
    onComplete: () => {
      const text = scene.add
        .text(400, 300, resultText, {
          fontFamily: "Courier",
          fontSize: "32px",
          color: "#00ff00",
          backgroundColor: "#000",
        })
        .setOrigin(0.5);

      scene.time.delayedCall(1500, () => {
        dice.destroy();
        text.destroy();
        if (onComplete) onComplete();
      });
    },
  });
  } catch (e) {
    console.warn("[dice] animation skipped:", e);
    if (onComplete) onComplete();
  }
}

// ----------------------------------------------------
// MAP LOGIC
// ----------------------------------------------------
async function onExplore() {
  if (!(await ensureReadyOrWarn())) return;
  UI.updateChatLog("Scouting the area ahead...");
  Object.values(btns).forEach((b) => (b.style.display = "none"));

  // Pre-fetch AI content for likely next actions to minimize latency
  try {
    AI.prefetchNextNodes({
      hp: Engine.gameState.player.hp,
      str: Engine.gameState.player.derived.attack,
      level: Engine.gameState.player.level,
    });
  } catch (e) {
    console.warn("[prefetch] skipped:", e);
  }

  // Generate Map Nodes from the deterministic ASCII world fork
  const world =
    Engine.gameState.map.currentWorld ||
    MapSys.generateWorld(Engine.gameState.runSeed || 1234, Engine.gameState.player.level);
  Engine.gameState.map.currentWorld = world;
  const nodes = world.nodes;

  const s = switchScene("MapScene");
  s.renderMap(nodes, onNodeSelected);
}

function onNodeSelected(node) {
  UI.clearAsciiMap();
  if (node.type === "Shop") {
    Engine.setMode("SHOP");
    Engine.gameState.shopDiscount = 0;
    UI.updateChatLog("You entered a local Shop.");
    const s = switchScene("ShopScene");
    s.renderShop("shop");
    updateUIDOM();
  } else if (node.type === "Campfire") {
    Engine.setMode("SMITH");
    UI.updateChatLog("You found a traveling Blacksmith.");
    const s = switchScene("ShopScene");
    s.renderShop("blacksmith");
    updateUIDOM();
  } else if (node.type === "Mystery") {
    triggerMystery();
  } else {
    triggerCombat(node.type === "Elite Combat");
  }
}

async function triggerCombat(isElite = false, isGuard = false) {
  Engine.setMode("COMBAT");
  Object.values(btns).forEach((b) => (b.disabled = true));

  try {
    const regionNames = MapSys.getAvailableRegions(
      Engine.gameState.player.level,
    );
    const currentRegion = regionNames[regionNames.length - 1].name;

    let promptTheme = isGuard
      ? "guard"
      : isElite
        ? "elite boss in " + currentRegion
        : currentRegion;

    const encounter = await AI.generateEncounter(
      Engine.gameState.player.hp,
      Engine.gameState.player.derived.attack,
      Engine.gameState.player.level,
      promptTheme,
    );

    let eName = isGuard ? "City Guard" : encounter.name;
    if (isElite && !isGuard) eName = "Elite " + eName;
    UI.updateChatLog(`Enemy Appeared! ${eName} - ${encounter.desc}`);

    const multiplier = isElite ? 2 : 1;
    Engine.setEnemy({
      name: eName,
      hp: 20 * Engine.gameState.player.level * multiplier,
      maxHp: 20 * Engine.gameState.player.level * multiplier,
      agi: (5 + Math.floor(Engine.gameState.player.level / 2)) * multiplier,
      statusEffects: [],
      derived: {
        attack: (5 + Engine.gameState.player.level) * multiplier,
        defense: 2 * multiplier,
        critChance: 0.05,
      },
    });
    Engine.gameState.player.statusEffects = []; // Clear player status on new combat

    // Determine Initiative Turn Order
    const turnOrder = Engine.determineTurnOrder([
      { id: "player", name: "You", agi: Engine.gameState.player.baseStats.AGI },
      { id: "enemy", name: eName, agi: Engine.gameState.enemy.agi },
    ]);
    Engine.gameState.combat = { turnOrder, turnIndex: 0 };

    UI.updateChatLog(
      `Turn Order: ${turnOrder.map((t) => t.name).join(" -> ")}`,
    );

    const s = switchScene("CombatScene");
    s.renderEncounter(encounter);

    processTurnQueue();
  } catch (e) {
    UI.updateChatLog("Error generating enemy.");
    returnToMap();
  }
}

// ----------------------------------------------------
// MYSTERY EVENT LOGIC
// ----------------------------------------------------
async function triggerMystery() {
  Engine.setMode("MYSTERY");
  UI.clearAsciiMap();
  updateUIDOM();
  UI.updateChatLog("Approaching a point of interest...");

  const regionNames = MapSys.getAvailableRegions(Engine.gameState.player.level);
  const currentRegion = regionNames[regionNames.length - 1].name;

  try {
    const eventData = await AI.generateMysteryEvent(
      currentRegion,
      Engine.gameState.player.level,
    );
    UI.updateChatLog(`--- ${eventData.title} ---`);
    UI.updateChatLog(eventData.desc);

    const s = switchScene("EventScene");
    try {
      s.renderEvent(eventData, (choice) => onMysteryChoice(eventData, choice));
    } catch (e) {
      console.warn("[event] canvas render failed, DOM fallback:", e);
    }
    // DOM choice buttons: playable even if the canvas render fails.
    // updateUIDOM leaves these alone (it only manages the fixed buttons).
    renderDomChoices(eventData, (choice) =>
      onMysteryChoice(eventData, choice),
    );
    updateUIDOM();
  } catch (e) {
    UI.updateChatLog("The mystery vanishes before your eyes...");
    SaveSys.saveGameState(Engine.gameState);
    returnToMap();
  }
}

// DOM mirror of event choices — guarantees forward progress.
function renderDomChoices(eventData, onPick) {
  clearDomChoices();
  const container = document.getElementById("action-buttons");
  if (!container || !eventData.choices) return;
  eventData.choices.forEach((choice) => {
    const b = document.createElement("button");
    b.className = "action-btn map-node-btn";
    b.textContent =
      choice.text +
      (choice.stat_check && choice.stat_check !== "NONE"
        ? ` [${choice.stat_check}]`
        : "");
    b.addEventListener(
      "click",
      () => {
        clearDomChoices();
        onPick(choice);
      },
      { once: true },
    );
    container.appendChild(b);
  });
}

async function onMysteryChoice(eventData, choice) {
  clearDomChoices();
  try {
    await resolveMystery(eventData, choice);
  } catch (e) {
    console.error("[mystery] choice failed, recovering:", e);
    UI.updateChatLog("Fate intervenes... you move on.");
  }
  updateUIDOM();

  // The loop always continues — never strand the player on an event.
  setTimeout(() => returnToMap(), 2000);
}

async function resolveMystery(eventData, choice) {
  let rollTotal = null;
  let isSuccess = null;

  if (
    choice.stat_check !== "NONE" &&
    Engine.gameState.player.baseStats[choice.stat_check]
  ) {
    const statVal = Engine.gameState.player.baseStats[choice.stat_check];
    const check = Skills.performSkillCheck(
      statVal,
      10 + Engine.gameState.player.level,
    );
    rollTotal = check.total;
    isSuccess = check.success;
    UI.updateChatLog(
      `Rolling ${choice.stat_check}... Rolled a ${check.roll} + ${statVal} = ${rollTotal}.`,
    );

    await safeRoll(`D20: ${rollTotal}`);
  } else {
    UI.updateChatLog(`You chose: ${choice.text}`);
  }

  UI.updateChatLog("Resolving outcome...");

  const outcome = await AI.resolveMysteryEvent(
    eventData.desc,
    choice,
    rollTotal,
  );
  UI.updateChatLog(outcome.desc);
  SaveSys.logWorldEvent(`Event: ${eventData.title}. Outcome: ${outcome.desc}`);

  if (outcome.consequence) {
    if (outcome.consequence.hp_change) {
      if (outcome.consequence.hp_change > 0)
        Engine.healPlayer(outcome.consequence.hp_change);
      else {
        const died = Engine.damagePlayer(
          Math.abs(outcome.consequence.hp_change),
        );
        if (died) {
          UI.updateChatLog(
            "YOU DIED from the event! Game Over. Refresh to restart.",
          );
          updateUIDOM();
          return;
        }
      }
    }
    if (outcome.consequence.gold_change) {
      if (outcome.consequence.gold_change > 0)
        Engine.awardGold(outcome.consequence.gold_change);
      else Engine.spendGold(Math.abs(outcome.consequence.gold_change));
    }
    if (outcome.consequence.xp_change && outcome.consequence.xp_change > 0) {
      if (Engine.awardXP(outcome.consequence.xp_change)) {
        UI.updateChatLog(
          `LEVEL UP! You are now Level ${Engine.gameState.player.level}!`,
        );
      }
    }
    if (
      outcome.consequence.new_quest &&
      typeof outcome.consequence.new_quest === "string" &&
      outcome.consequence.new_quest.length > 3
    ) {
      if (!Engine.gameState.quests) Engine.gameState.quests = [];
      Engine.gameState.quests.push({ title: outcome.consequence.new_quest });
      UI.updateChatLog(`NEW QUEST: ${outcome.consequence.new_quest}`);
    }
  }
}

function returnToMap() {
  clearDomChoices();
  Engine.setMode("MAP");
  Engine.gameState.enemy = null;
  const s = switchScene("MapScene");
  if (s && s.resetMap) s.resetMap();
  AudioSys.playDynamicAudio(s, { is_hostile: false, visual_theme: "default" });
  updateUIDOM();
  SaveSys.saveGameState(Engine.gameState);
}

// ----------------------------------------------------
// COMBAT & SKILLS LOGIC
// ----------------------------------------------------
function processTurnQueue() {
  if (!Engine.gameState.enemy || Engine.gameState.mode !== "COMBAT") return;

  let currentEntity =
    Engine.gameState.combat.turnOrder[Engine.gameState.combat.turnIndex];

  // Process DOT and Status Expiry
  const statusResults = Engine.processStatusEffects(currentEntity.id);
  statusResults.log.forEach((msg) => UI.updateChatLog(msg));

  if (statusResults.isDead) {
    handleDeath(currentEntity.id);
    return;
  }

  if (currentEntity.id === "enemy") {
    Object.values(btns).forEach((b) => (b.disabled = true));
    setTimeout(() => enemyTurn(), 1000);
  } else {
    Object.values(btns).forEach((b) => (b.disabled = false));
    updateUIDOM();
  }
}

function advanceTurn() {
  Engine.gameState.combat.turnIndex =
    (Engine.gameState.combat.turnIndex + 1) %
    Engine.gameState.combat.turnOrder.length;
  processTurnQueue();
}

function handleDeath(entityId) {
  if (entityId === "player") {
    UI.updateChatLog("YOU DIED. Game Over. Refresh to restart.");
    Object.values(btns).forEach((b) => (b.disabled = true));
    updateUIDOM();
  } else {
    UI.updateChatLog(`You defeated the ${Engine.gameState.enemy.name}!`);
    SaveSys.logWorldEvent(`Player defeated ${Engine.gameState.enemy.name}.`);
    Engine.awardGold(15);
    Meta.trackEnemyDefeated();
    if (Engine.awardXP(50)) {
      UI.updateChatLog(
        `LEVEL UP! You are now Level ${Engine.gameState.player.level}!`,
      );
    }
    SaveSys.saveGameState(Engine.gameState);
    returnToMap();
  }
}

function enemyTurn() {
  if (!Engine.gameState.enemy) return;

  let eDmgRoll = Engine.calculateDamage(
    Engine.gameState.enemy.derived,
    Engine.gameState.player.derived,
  );
  Engine.damagePlayer(eDmgRoll.damage);
  UI.updateChatLog(
    `${Engine.gameState.enemy.name} hit you for ${eDmgRoll.damage} damage!`,
  );

  // 25% chance for enemy to poison
  if (Math.random() < 0.25) {
    Engine.applyStatusEffect("player", { name: "Poison", duration: 3, dot: 5 });
    UI.updateChatLog(`You were poisoned by ${Engine.gameState.enemy.name}!`);
  }

  if (Engine.gameState.player.hp <= 0) {
    handleDeath("player");
    return;
  }
  advanceTurn();
}

function onAttack() {
  SaveSys.trackPlayerChoice("Attack");
  if (!Engine.gameState.enemy) return;

  let wpn = Engine.gameState.player.equipment.weapon;
  if (wpn) {
    if (wpn.broken) {
      UI.updateChatLog("Your weapon is broken! You punch for 1 damage.");
      Engine.damageEnemy(1);
      if (Engine.gameState.enemy.hp <= 0) {
        handleDeath("enemy");
        return;
      }
      Object.values(btns).forEach((b) => (b.disabled = true));
      advanceTurn();
      return;
    } else {
      Economy.degradeWeapon(wpn);
      if (wpn.broken) {
        UI.updateChatLog(`CRACK! Your ${wpn.name} broke!`);
        Engine.recalculateDerivedStats();
      }
    }
  }

  let dmgRoll = Engine.calculateDamage(
    Engine.gameState.player.derived,
    Engine.gameState.enemy.derived,
  );

  // Process special weapon effects
  if (Engine.gameState.player.derived.special_effects) {
    Engine.gameState.player.derived.special_effects.forEach((effect) => {
      if (effect.name === "Burn" && Math.random() < 0.3) {
        Engine.applyStatusEffect("enemy", effect);
        UI.updateChatLog(`Your weapon ignited ${Engine.gameState.enemy.name}!`);
      }
      if (effect.name === "Cleave") {
        dmgRoll.damage = Math.floor(dmgRoll.damage * 1.2);
      }
    });
  }

  Engine.damageEnemy(dmgRoll.damage);
  UI.updateChatLog(
    `You attacked ${Engine.gameState.enemy.name} for ${dmgRoll.damage} damage! ${dmgRoll.isCrit ? "(CRIT!)" : ""}`,
  );

  // Default 15% chance for player to cause bleed if no special effects
  if (
    !Engine.gameState.player.derived.special_effects &&
    Math.random() < 0.15
  ) {
    Engine.applyStatusEffect("enemy", { name: "Bleed", duration: 3, dot: 5 });
    UI.updateChatLog(`${Engine.gameState.enemy.name} is bleeding!`);
  }

  if (Engine.gameState.enemy.hp <= 0) {
    handleDeath("enemy");
    return;
  }
  Object.values(btns).forEach((b) => (b.disabled = true));
  advanceTurn();
}

function onFlee() {
  SaveSys.trackPlayerChoice("Flee");
  const check = Skills.performSkillCheck(
    Engine.gameState.player.baseStats.AGI,
    10,
  );
  Object.values(btns).forEach((b) => (b.disabled = true));
  safeRoll(`FLEE D20: ${check.total}`).then(() => {
    if (check.success) {
      UI.updateChatLog("You successfully fled!");
      SaveSys.logWorldEvent(`Player fled from ${Engine.gameState.enemy.name}.`);
      SaveSys.saveGameState(Engine.gameState);
      returnToMap();
    } else {
      UI.updateChatLog("Failed to flee!");
      advanceTurn();
    }
  });
}

function onSteal() {
  SaveSys.trackPlayerChoice("Steal");
  // Use the actual attemptSteal mechanic from skills.js
  const result = Skills.attemptSteal(
    Engine.gameState.player.baseStats.AGI,
    0.8,
  );
  Object.values(btns).forEach((b) => (b.disabled = true));
  safeRoll(`STEAL AGI: ${Engine.gameState.player.baseStats.AGI}`).then(
    () => {
      if (result.success) {
        UI.updateChatLog("Successfully pickpocketed 30 Gold!");
        Engine.awardGold(30);
        if (Engine.gameState.mode !== "COMBAT") {
          SaveSys.saveGameState(Engine.gameState);
          returnToMap();
        } else {
          advanceTurn();
        }
      } else {
        UI.updateChatLog(
          `Caught stealing! ${result.message}! Wanted Level: ${result.wantedLevel}`,
        );
        triggerCombat(false, true);
      }
    },
  );
}

function onBribe() {
  SaveSys.trackPlayerChoice("Bribe");
  if (Engine.spendGold(10)) {
    const success = Economy.attemptBribe(10, Engine.gameState.enemy.greed);
    if (success) {
      UI.updateChatLog(
        `${Engine.gameState.enemy.name} accepted your bribe and left!`,
      );
      SaveSys.logWorldEvent(`Player bribed ${Engine.gameState.enemy.name}.`);
      SaveSys.saveGameState(Engine.gameState);
      returnToMap();
    } else {
      UI.updateChatLog(
        `${Engine.gameState.enemy.name} scoffed at your meager bribe!`,
      );
      Object.values(btns).forEach((b) => (b.disabled = true));
      advanceTurn();
    }
  } else {
    UI.updateChatLog("Not enough gold to bribe.");
  }
}

// ----------------------------------------------------
// SHOP & BLACKSMITH LOGIC
// ----------------------------------------------------
function onHaggle() {
  const check = Skills.performSkillCheck(
    Engine.gameState.player.baseStats.CHA,
    12,
  );
  safeRoll(`HAGGLE D20: ${check.total}`).then(() => {
    if (check.success) {
      Engine.gameState.shopDiscount = 0.5; // 50% off
      UI.updateChatLog("The merchant liked your charm! 50% discount.");
    } else {
      UI.updateChatLog("The merchant was insulted by your lowball offer.");
      btns.haggle.disabled = true;
    }
    updateUIDOM();
  });
}

function onBuy() {
  SaveSys.trackPlayerChoice("Buy");
  // Using Economy module for proper pricing
  const baseVal = 16;
  let price = Economy.calculateItemPrice(
    baseVal,
    true,
    Engine.gameState.player.baseStats.CHA,
    Engine.gameState.shopDiscount > 0,
  );
  price = Math.floor(price * (1 - Engine.gameState.shopDiscount)); // apply additional explicit haggle discount
  if (Engine.spendGold(price)) {
    const potion = { id: `pot_${Date.now()}`, name: "Health Potion", heal: 50 };
    Engine.addToInventory(potion);
    Engine.healPlayer(50);
    UI.updateChatLog(`Bought Potion! Healed 50 HP.`);
    updateUIDOM();
  } else {
    UI.updateChatLog("Not enough gold.");
  }
}

async function onBuyGear() {
  SaveSys.trackPlayerChoice("BuyGear");
  const baseVal = 50;
  let price = Economy.calculateItemPrice(
    baseVal,
    true,
    Engine.gameState.player.baseStats.CHA,
    Engine.gameState.shopDiscount > 0,
  );
  price = Math.floor(price * (1 - Engine.gameState.shopDiscount));
  if (Engine.spendGold(price)) {
    const eqData = await Engine.fetchGameData("equipment.json");
    const types = ["weapons", "armors", "accessories"];
    const t = types[Math.floor(Math.random() * types.length)];
    const list = eqData[t];
    const item = Object.assign(
      {},
      list[Math.floor(Math.random() * list.length)],
    ); // clone
    item.id = `${item.id}_${Date.now()}`;
    item.durability = item.maxDurability;
    Engine.equipItem(item);
    UI.updateChatLog(`Bought and equipped ${item.name}!`);
    updateUIDOM();
  } else {
    UI.updateChatLog("Not enough gold.");
  }
}

function onUpgrade() {
  SaveSys.trackPlayerChoice("Upgrade");
  const wpn = Engine.gameState.player.equipment.weapon;

  if (!wpn) {
    UI.updateChatLog("You don't have a weapon to work on.");
    return;
  }

  if (wpn.broken || wpn.durability < wpn.maxDurability) {
    if (Engine.spendGold(20)) {
      Economy.repairItem(wpn, 20, 0, 20, 0);
      Engine.recalculateDerivedStats();
      UI.updateChatLog(
        `Repaired your ${wpn.name} to full durability for 20 gold.`,
      );
      updateUIDOM();
    } else {
      UI.updateChatLog("Not enough gold to repair (20g).");
    }
  } else {
    if (Engine.spendGold(50)) {
      Economy.upgradeItem(wpn, 50, 0, 50, 0);
      Engine.recalculateDerivedStats();
      UI.updateChatLog(`Upgraded your weapon to ${wpn.name} for 50 gold!`);
      updateUIDOM();
    } else {
      UI.updateChatLog("Not enough gold to upgrade (50g).");
    }
  }
}

// Bind Buttons — every handler is safe-wrapped: an exception mid-flow
// recovers to MAP instead of leaving the UI dead.
btns.explore.addEventListener("click", safe("explore", onExplore));
btns.attack.addEventListener("click", safe("attack", onAttack));
btns.flee.addEventListener("click", safe("flee", onFlee));
btns.steal.addEventListener("click", safe("steal", onSteal));
btns.bribe.addEventListener("click", safe("bribe", onBribe));
btns.buy.addEventListener("click", safe("buy", onBuy));
btns.gear.addEventListener("click", safe("buygear", onBuyGear));
btns.haggle.addEventListener("click", safe("haggle", onHaggle));
btns.upgrade.addEventListener("click", safe("upgrade", onUpgrade));
btns.leave.addEventListener(
  "click",
  safe("leave", () => {
    clearDomChoices();
    returnToMap();
  }),
);

// Phaser Configuration
const config = {
  type: Phaser.AUTO,
  parent: "phaser-container",
  width: 800,
  height: 600,
  backgroundColor: "#000000",
  pixelArt: true,
  scene: [
    BootScene,
    MainMenuScene,
    MapScene,
    CombatScene,
    ShopScene,
    EventScene,
  ],
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
};

UI.setupUIHooks();
Engine.gameState.phaserGame = new Phaser.Game(config);

window.addEventListener("gameLoaded", () => {
  updateUIDOM();
  SaveSys.saveGameState(Engine.gameState);
});
