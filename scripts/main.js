import { MODULE_ID } from "./constants.js";
import { state } from "./state.js";
import { buildApi } from "./api.js";
import { initSocket } from "./socket.js";
import { registerFlowSteps, readyRegistry, initCombatEvents } from "./registry.js";
import { invalidateTreeCache, hasProgress } from "./data.js";
import { syncAllDebounced, syncActorDebounced } from "./effects.js";
import { runWorldScripts, reportWorldScriptErrors } from "./world-scripts.js";
import {
  openTree, openEditor, refreshViewers, refreshAllViewers, closeViewersFor, EditorLauncher, ScriptsLauncher
} from "./apps/index.js";
import { setting } from "./util.js";
import "./custom-skills.js";

const ICON = "fa-solid fa-diagram-project";
const SHEET_TYPES = new Set(["pilot", "mech", "npc"]);
const WATCHED = ["system.level", "system.grit", "system.hull", "system.agi", "system.sys", "system.eng", "system.tier"];

// The LANCER system calls this while building its roll/attack flows.
Hooks.once("lancer.registerFlows", (flowSteps, flows) => registerFlowSteps(flowSteps, flows));

Hooks.once("init", () => {
  registerSettings();
  const api = buildApi();
  state.api = api;
  game.modules.get(MODULE_ID).api = api;
  globalThis.LancerSkillTrees = api;
});

Hooks.once("setup", () => runWorldScripts());

Hooks.once("ready", () => {
  initSocket();
  initCombatEvents();
  readyRegistry();
  reportWorldScriptErrors();
  if (game.system.id !== "lancer") {
    ui.notifications.warn("LANCER Skill Trees is built for the LANCER system; stat modifiers will not work here.");
  }
  syncAllDebounced(2500);
  Hooks.callAll("lancerSkillTrees.ready", state.api);
});

function registerSettings() {
  game.settings.register(MODULE_ID, "trees", {
    scope: "world",
    config: false,
    type: Object,
    default: {},
    onChange: () => {
      invalidateTreeCache();
      refreshAllViewers();
      syncAllDebounced();
    }
  });

  game.settings.registerMenu(MODULE_ID, "editorMenu", {
    name: "Skill Tree Editor",
    label: "Open Editor",
    hint: "Create skill trees, place skills, set prerequisites, passive modifiers, custom effects and per-tree styles.",
    icon: ICON,
    type: EditorLauncher,
    restricted: true
  });

  game.settings.registerMenu(MODULE_ID, "scriptMenu", {
    name: "Custom Skill Scripts",
    label: "Edit Scripts",
    hint: "Advanced: JavaScript that registers custom skill effects without editing the module.",
    icon: "fa-solid fa-code",
    type: ScriptsLauncher,
    restricted: true
  });

  game.settings.register(MODULE_ID, "pointsPerLevel", {
    name: "Skill points per License Level",
    hint: "Points a pilot earns for each License Level (NPCs use their tier).",
    scope: "world",
    config: true,
    type: Number,
    default: 1,
    onChange: () => refreshAllViewers()
  });

  game.settings.register(MODULE_ID, "startingPoints", {
    name: "Starting skill points",
    hint: "Points every character has before License Levels. GMs can add per-character bonus points in the skill tree window.",
    scope: "world",
    config: true,
    type: Number,
    default: 0,
    onChange: () => refreshAllViewers()
  });

  game.settings.register(MODULE_ID, "playersCanUnlock", {
    name: "Players can unlock skills",
    hint: "If off, only the GM can spend points.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => refreshAllViewers()
  });

  game.settings.register(MODULE_ID, "playersCanRefund", {
    name: "Players can refund skills",
    hint: "If off, only the GM can take points back out of a skill.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: () => refreshAllViewers()
  });

  game.settings.register(MODULE_ID, "announceUnlocks", {
    name: "Announce unlocks in chat",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "sheetButton", {
    name: "Skill Tree button on character sheets",
    hint: "Adds a Skill Tree button to pilot, mech and NPC sheet headers.",
    scope: "client",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "viewerLayout", {
    scope: "client",
    config: false,
    type: String,
    default: "tabs"
  });

  game.settings.register(MODULE_ID, "customScript", {
    scope: "world",
    config: false,
    type: String,
    default: ""
  });
}

/* ------------------------------------------------------------------ */
/*  Keep effects and windows current                                   */
/* ------------------------------------------------------------------ */

Hooks.on("updateActor", (actor, changes, options, userId) => {
  const has = foundry.utils.hasProperty;
  const flagChanged = has(changes, `flags.${MODULE_ID}`);
  const statChanged = WATCHED.some((k) => has(changes, k));
  if (statChanged && userId === game.user.id && hasProgress(actor)) syncActorDebounced(actor);
  if (flagChanged || statChanged || "name" in changes || "img" in changes) refreshViewers(actor);
});

Hooks.on("deleteActor", (actor) => closeViewersFor(actor));

/* ------------------------------------------------------------------ */
/*  Buttons                                                            */
/* ------------------------------------------------------------------ */

function sheetActor(app) {
  const doc = app?.document ?? app?.actor ?? app?.object;
  return doc?.documentName === "Actor" ? doc : null;
}

function wantsButton(actor) {
  return !!actor && SHEET_TYPES.has(actor.type) && setting("sheetButton") !== false;
}

// Application V1 sheets
Hooks.on("getActorSheetHeaderButtons", (sheet, buttons) => {
  const actor = sheetActor(sheet);
  if (!wantsButton(actor)) return;
  buttons.unshift({ label: "Skill Tree", class: "lst-open-tree", icon: ICON, onclick: () => openTree(actor) });
});

// Application V2 sheets
Hooks.on("getHeaderControlsActorSheetV2", (app, controls) => {
  const actor = sheetActor(app);
  if (!wantsButton(actor)) return;
  try {
    app.options.actions.lstOpenSkillTree ??= () => openTree(sheetActor(app));
  } catch { /* actions not extendable; onClick below still works */ }
  controls.unshift({ icon: ICON, label: "Skill Tree", action: "lstOpenSkillTree", visible: true, onClick: () => openTree(actor) });
});

// Actors sidebar: a GM button
Hooks.on("renderActorDirectory", (app, html) => {
  if (!game.user.isGM) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  const actions = root?.querySelector(".header-actions");
  if (!actions || actions.querySelector(".lst-dir-btn")) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "lst-dir-btn";
  btn.innerHTML = `<i class="${ICON}"></i> Skill Trees`;
  btn.addEventListener("click", () => openEditor());
  actions.append(btn);
});

// Actors sidebar: right-click entry
function contextEntry() {
  const idOf = (li) => {
    const el = li instanceof HTMLElement ? li : li?.[0];
    return el?.dataset?.entryId ?? el?.dataset?.documentId;
  };
  return {
    name: "Open Skill Tree",
    icon: `<i class="${ICON}"></i>`,
    condition: (li) => {
      const actor = game.actors.get(idOf(li));
      return !!actor && actor.testUserPermission(game.user, "OBSERVER");
    },
    callback: (li) => openTree(game.actors.get(idOf(li)))
  };
}
function addContextEntry(options) {
  if (Array.isArray(options) && !options.some((o) => o?.name === "Open Skill Tree")) options.push(contextEntry());
}
Hooks.on("getActorContextOptions", (app, options) => addContextEntry(options));
Hooks.on("getActorDirectoryEntryContext", (html, options) => addContextEntry(options));
