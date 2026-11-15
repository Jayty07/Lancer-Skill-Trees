/**
 * LANCER HUD for Bar Brawl
 * Configures Bar Brawl resource bars for LANCER tokens: an HP gauge plus Structure and
 * Stress pips, in a stylized (image) or clean (colored bar) look.
 *
 * Bar Brawl stores bars per token in flags.barbrawl.resourceBars, keyed by bar id.
 */

const MODULE_ID = "lancer-barbrawl-hud";
const BB = "barbrawl";
const ASSETS = `modules/${MODULE_ID}/assets`;
const IDS = { hp: "lhud-hp", structure: "lhud-structure", stress: "lhud-stress" };
const OUR_IDS = new Set(Object.values(IDS));
/** Bar Brawl visibility values: 50 always, 30 hover, 10 controlled, 0 never, -1 inherit. */
const VIS = { always: 50, hover: 30, controlled: 10, never: 0, inherit: -1 };
const FULL_BARS = new Set(["mech", "npc"]); // HP + Structure + Stress
const HP_ONLY = new Set(["pilot", "deployable"]); // no structure/stress in LANCER

/* ------------------------------------------------------------------ */
/*  Settings                                                           */
/* ------------------------------------------------------------------ */

function setting(key) {
  try {
    return game.settings.get(MODULE_ID, key);
  } catch {
    return undefined;
  }
}

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "style", {
    name: "HUD style",
    hint: "Stylized uses LANCER-style gauge and pip art. Clean uses Bar Brawl's colored bars with labels.",
    scope: "world",
    config: true,
    type: String,
    choices: { stylized: "Stylized (gauge + pips)", clean: "Clean (colored bars)" },
    default: "stylized",
    onChange: () => reapplyPrompt()
  });
  game.settings.register(MODULE_ID, "position", {
    name: "Position",
    hint: "Where the HUD sits relative to the token.",
    scope: "world",
    config: true,
    type: String,
    choices: { "bottom-outer": "Below the token", "bottom-inner": "Over the bottom of the token", "top-outer": "Above the token" },
    default: "bottom-outer",
    onChange: () => reapplyPrompt()
  });
  game.settings.register(MODULE_ID, "others", {
    name: "Other players see bars",
    hint: "Visibility for players who don't own the token. Owners and the GM always see their bars.",
    scope: "world",
    config: true,
    type: String,
    choices: { hover: "On hover", always: "Always", never: "Never" },
    default: "hover",
    onChange: () => reapplyPrompt()
  });
  game.settings.register(MODULE_ID, "keepOther", {
    name: "Keep other Bar Brawl bars",
    hint: "When applying the HUD, keep bars you added yourself (Heat, Overshield…). If off, the HUD replaces every Bar Brawl bar on the token.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });
  game.settings.register(MODULE_ID, "autoApply", {
    name: "Apply to new tokens",
    hint: "New mech, NPC, pilot and deployable tokens get the HUD automatically (unless they already have custom Bar Brawl bars).",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });
  game.settings.registerMenu(MODULE_ID, "applyMenu", {
    name: "Apply the HUD",
    label: "Apply to all actors and tokens",
    hint: "Writes the HUD onto every LANCER actor's prototype token, every token on every scene, and Bar Brawl's per-type defaults.",
    icon: "fa-solid fa-gauge-high",
    type: ApplyLauncher,
    restricted: true
  });
});

/* ------------------------------------------------------------------ */
/*  Bar definitions                                                    */
/* ------------------------------------------------------------------ */

function baseBar(id, attribute, extra = {}) {
  return {
    id,
    attribute,
    ownerVisibility: VIS.always,
    otherVisibility: VIS[setting("others")] ?? VIS.hover,
    gmVisibility: VIS.inherit,
    hideCombat: false,
    hideNoCombat: false,
    hideEmpty: false,
    hideFull: false,
    hideHud: false,
    mincolor: "#000000",
    maxcolor: "#ffffff",
    position: setting("position") ?? "bottom-outer",
    indentLeft: 0,
    indentRight: 0,
    shareHeight: false,
    style: "user",
    opacity: 100,
    ignoreMin: false,
    ignoreMax: false,
    invert: false,
    invertDirection: false,
    label: "",
    subdivisions: 0,
    subdivisionsOwner: false,
    fgImage: "",
    bgImage: "",
    max: null,
    ...extra
  };
}

/** Pip art for a maximum of 1-8; a continuous gauge above that. */
function pipArt(kind, max) {
  const n = Math.round(Number(max) || 0);
  const name = n >= 1 && n <= 8 ? `${kind}-${n}` : `${kind}-bar`;
  return { fgImage: `${ASSETS}/${name}-fg.svg`, bgImage: `${ASSETS}/${name}-bg.svg` };
}

function readMax(actor, key, fallback) {
  const v = Number(actor?.system?.[key]?.max);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

/**
 * The HUD bars for an actor type (and, for pip art, the actor's own maxima).
 * Insertion order is draw order, nearest the token first.
 */
export function buildBars(actorType, actor = null) {
  if (!FULL_BARS.has(actorType) && !HP_ONLY.has(actorType)) return null;
  const style = setting("style") ?? "stylized";
  const full = FULL_BARS.has(actorType);
  const bars = {};

  if (style === "clean") {
    bars[IDS.hp] = baseBar(IDS.hp, "hp", { mincolor: "#ff3b3b", maxcolor: "#3dff8a", style: "fraction", label: "HP", opacity: 90 });
    if (full) {
      bars[IDS.structure] = baseBar(IDS.structure, "structure", { mincolor: "#1f9eff", maxcolor: "#1f9eff", style: "fraction", label: "STRUCTURE", opacity: 90 });
      bars[IDS.stress] = baseBar(IDS.stress, "stress", { mincolor: "#ff8a1f", maxcolor: "#ff8a1f", style: "fraction", label: "STRESS", opacity: 90 });
    }
    return bars;
  }

  bars[IDS.hp] = baseBar(IDS.hp, "hp", {
    mincolor: "#ff3b3b",
    maxcolor: "#3dff8a",
    style: "fraction",
    fgImage: `${ASSETS}/hp-fg.svg`,
    bgImage: `${ASSETS}/hp-bg.svg`
  });
  if (full) {
    const defaultMax = actorType === "npc" ? 1 : 4;
    bars[IDS.structure] = baseBar(IDS.structure, "structure", {
      mincolor: "#1f9eff",
      maxcolor: "#1f9eff",
      style: "none",
      indentRight: 52,
      shareHeight: true,
      ...pipArt("structure", readMax(actor, "structure", defaultMax))
    });
    bars[IDS.stress] = baseBar(IDS.stress, "stress", {
      mincolor: "#ff8a1f",
      maxcolor: "#ff8a1f",
      style: "none",
      indentLeft: 52,
      ...pipArt("stress", readMax(actor, "stress", defaultMax))
    });
  }
  return bars;
}

/** Final resourceBars object for a document that currently has `existing` bars. */
function mergedBars(existing, bars) {
  if (!setting("keepOther")) return bars;
  const kept = Object.fromEntries(Object.entries(existing ?? {}).filter(([id]) => !OUR_IDS.has(id)));
  return { ...kept, ...bars };
}

function hasOurBars(resourceBars) {
  return Object.keys(resourceBars ?? {}).some((id) => OUR_IDS.has(id));
}

/* ------------------------------------------------------------------ */
/*  Applying                                                           */
/* ------------------------------------------------------------------ */

/**
 * Replacing a nested flag object needs two steps in Foundry: delete it, then set it.
 * (A plain update merges, which would leave old bars behind.)
 */
async function replaceBars(doc, path, bars) {
  await doc.update({ [`${path}.-=resourceBars`]: null });
  await doc.update({ [`${path}.resourceBars`]: bars });
}

export async function applyToActor(actor) {
  const bars = buildBars(actor.type, actor);
  if (!bars) return false;
  const existing = actor.prototypeToken?.flags?.[BB]?.resourceBars;
  await replaceBars(actor, `prototypeToken.flags.${BB}`, mergedBars(existing, bars));
  return true;
}

export async function applyToToken(tokenDoc) {
  const actor = tokenDoc.actor;
  const bars = actor && buildBars(actor.type, actor);
  if (!bars) return false;
  const existing = tokenDoc.flags?.[BB]?.resourceBars;
  await replaceBars(tokenDoc, `flags.${BB}`, mergedBars(existing, bars));
  return true;
}

/** Bar Brawl's own per-actor-type defaults, used for tokens of actors nobody has configured yet. */
async function applyTypeDefaults() {
  let current = {};
  try {
    current = foundry.utils.deepClone(game.settings.get(BB, "defaultTypeResources") ?? {});
  } catch {
    return false; // this Bar Brawl version has no per-type defaults
  }
  for (const type of [...FULL_BARS, ...HP_ONLY]) current[type] = buildBars(type);
  try {
    await game.settings.set(BB, "defaultTypeResources", current);
    return true;
  } catch (err) {
    console.warn(`${MODULE_ID} | could not save Bar Brawl type defaults`, err);
    return false;
  }
}

export async function applyEverywhere() {
  if (!game.user.isGM) return ui.notifications.warn("LANCER HUD: only the GM can apply the HUD.");
  if (!game.modules.get(BB)?.active) return ui.notifications.error("LANCER HUD: enable the Bar Brawl module first.");
  ui.notifications.info("LANCER HUD: applying…");
  let actors = 0;
  let tokens = 0;
  for (const actor of game.actors) {
    try {
      if (await applyToActor(actor)) actors++;
    } catch (err) {
      console.error(`${MODULE_ID} | ${actor.name}`, err);
    }
  }
  for (const scene of game.scenes) {
    for (const token of scene.tokens) {
      try {
        if (await applyToToken(token)) tokens++;
      } catch (err) {
        console.error(`${MODULE_ID} | token ${token.name} in ${scene.name}`, err);
      }
    }
  }
  const defaults = await applyTypeDefaults();
  ui.notifications.info(`LANCER HUD: applied to ${actors} actors and ${tokens} tokens${defaults ? ", and set Bar Brawl's defaults" : ""}.`);
  return { actors, tokens, defaults };
}

/** Refresh only the pip art on our existing bars (maxima changed). */
function refreshedPips(resourceBars, actor) {
  if (!resourceBars || (setting("style") ?? "stylized") !== "stylized") return null;
  const out = foundry.utils.deepClone(resourceBars);
  let changed = false;
  for (const [id, key] of [[IDS.structure, "structure"], [IDS.stress, "stress"]]) {
    const bar = out[id];
    if (!bar) continue;
    const art = pipArt(key, readMax(actor, key, 1));
    if (bar.fgImage !== art.fgImage || bar.bgImage !== art.bgImage) {
      Object.assign(bar, art);
      changed = true;
    }
  }
  return changed ? out : null;
}

/* ------------------------------------------------------------------ */
/*  Hooks                                                              */
/* ------------------------------------------------------------------ */

// New tokens: add the HUD, or refresh pip art if the prototype already carries it.
Hooks.on("preCreateToken", (tokenDoc, data) => {
  if (!setting("autoApply") || !game.modules.get(BB)?.active) return;
  const actor = tokenDoc.actor;
  if (!actor) return;
  const current = tokenDoc.flags?.[BB]?.resourceBars;
  if (hasOurBars(current)) {
    const refreshed = refreshedPips(current, actor);
    if (refreshed) tokenDoc.updateSource({ [`flags.${BB}.resourceBars`]: refreshed });
    return;
  }
  if (current && Object.keys(current).length) return; // someone set up custom bars: leave them
  const bars = buildBars(actor.type, actor);
  if (bars) tokenDoc.updateSource({ [`flags.${BB}.resourceBars`]: bars });
});

// When a mech's Structure or Stress maximum changes (frame swap, NPC tier, edits), swap in the
// matching pip art. Maxima are derived from items, so watch item changes too.
const refreshTimers = new Map();
function isActiveGM() {
  const active = game.users.activeGM;
  return game.user.isGM && (!active || active.id === game.user.id);
}

export async function refreshActor(actor) {
  if (!actor || !FULL_BARS.has(actor.type)) return;
  const proto = refreshedPips(actor.prototypeToken?.flags?.[BB]?.resourceBars, actor);
  if (proto) await actor.update({ [`prototypeToken.flags.${BB}.resourceBars`]: proto });
  for (const token of actor.getActiveTokens(false, true)) {
    const refreshed = refreshedPips(token.flags?.[BB]?.resourceBars, token.actor ?? actor);
    if (refreshed) await token.update({ [`flags.${BB}.resourceBars`]: refreshed });
  }
}

function queueRefresh(actor) {
  if (!actor || !isActiveGM() || !game.modules.get(BB)?.active) return;
  clearTimeout(refreshTimers.get(actor.uuid));
  refreshTimers.set(actor.uuid, setTimeout(() => {
    refreshTimers.delete(actor.uuid);
    refreshActor(actor).catch((err) => console.error(`${MODULE_ID} | refresh failed`, err));
  }, 600));
}

Hooks.on("updateActor", (actor, changes) => {
  if (foundry.utils.hasProperty(changes, "system")) queueRefresh(actor);
});
for (const hook of ["createItem", "updateItem", "deleteItem"]) {
  Hooks.on(hook, (item) => {
    if (item.parent?.documentName === "Actor") queueRefresh(item.parent);
  });
}

Hooks.once("ready", () => {
  game.modules.get(MODULE_ID).api = { applyEverywhere, applyToActor, applyToToken, refreshActor, buildBars };
  if (game.user.isGM && !game.modules.get(BB)?.active) {
    ui.notifications.warn("LANCER HUD needs the Bar Brawl module. Install and enable it, then use Settings → LANCER HUD → Apply.");
  }
});

/* ------------------------------------------------------------------ */
/*  UI                                                                 */
/* ------------------------------------------------------------------ */

async function confirmApply(reason = "") {
  const { DialogV2 } = foundry.applications.api;
  const ok = await DialogV2.confirm({
    window: { title: "Apply LANCER HUD" },
    content: `${reason ? `<p>${reason}</p>` : ""}<p>Apply the HUD to every LANCER actor's prototype token and every token on every scene?</p>
      <p>${setting("keepOther") ? "Bars you added yourself are kept." : "This replaces existing Bar Brawl bars on those tokens."}</p>`,
    rejectClose: false
  }).catch(() => false);
  if (ok === true) await applyEverywhere();
}

let promptTimer = null;
function reapplyPrompt() {
  if (!game.user?.isGM || !game.ready) return;
  clearTimeout(promptTimer);
  promptTimer = setTimeout(() => confirmApply("HUD settings changed."), 400);
}

class ApplyLauncher extends foundry.applications.api.ApplicationV2 {
  render() {
    confirmApply();
    return this;
  }
}
