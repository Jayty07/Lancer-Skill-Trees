import { MODULE_ID, SCOPES, MODE_INFO, AE_MODES } from "./constants.js";
import { getTrees, getRanks, formulaVars, hasProgress } from "./data.js";
import { getCustomSkill, skillContext } from "./registry.js";
import { onSocket, emit } from "./socket.js";
import { esc, isActiveGM, hasActiveGM } from "./util.js";

/* ------------------------------------------------------------------ */
/*  Formulas                                                           */
/* ------------------------------------------------------------------ */

const FN_NAMES = ["floor", "ceil", "round", "min", "max", "abs"];
const FN_IMPLS = [Math.floor, Math.ceil, Math.round, Math.min, Math.max, Math.abs];

/**
 * Evaluate "2", "-1", "floor(@ll/2)", "1 + {grit}" etc. Returns a number, or null when the
 * text is not a valid formula. Only numbers, + - * / % ( ) , and floor/ceil/round/min/max/abs.
 */
export function evaluateFormula(input, vars = {}) {
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  if (typeof input !== "string") return null;
  let expr = input.trim();
  if (!expr) return null;
  let unknown = false;
  const sub = (_m, name) => {
    const v = Number(vars[name.toLowerCase()]);
    if (!Number.isFinite(v)) {
      unknown = true;
      return "0";
    }
    return `(${v})`;
  };
  expr = expr.replace(/@([a-z_][a-z0-9_]*)/gi, sub).replace(/\{([a-z_][a-z0-9_]*)\}/gi, sub);
  if (unknown) return null;
  const stripped = expr.replace(/\b(?:floor|ceil|round|min|max|abs)\b/g, "");
  if (!/^[\d\s+\-*/%().,]*$/.test(stripped) || !/\d/.test(stripped)) return null;
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(...FN_NAMES, `"use strict"; return (${expr});`);
    const result = fn(...FN_IMPLS);
    return typeof result === "number" && Number.isFinite(result) ? result : null;
  } catch {
    return null;
  }
}

export function isFormula(value) {
  return /[@{a-z]/i.test(String(value ?? ""));
}

/**
 * The value a modifier contributes at a given rank.
 * Add: multiplied by rank unless the formula uses @rank. Other numeric modes: evaluated as-is.
 * Override / custom / JSON: evaluated if numeric, otherwise passed through as text.
 */
export function resolveModifierValue(mod, rank, vars = {}) {
  const raw = String(mod.value ?? "").trim();
  const usesRank = /[@{]rank\b/i.test(raw);
  const num = evaluateFormula(raw, { ...vars, rank });
  switch (mod.mode) {
    case AE_MODES.ADD:
      if (num === null) return null;
      return usesRank ? num : num * rank;
    case AE_MODES.MULTIPLY:
    case AE_MODES.UPGRADE:
    case AE_MODES.DOWNGRADE:
      return num;
    default:
      return num ?? (raw === "" ? null : raw);
  }
}

/* ------------------------------------------------------------------ */
/*  Desired effects                                                    */
/* ------------------------------------------------------------------ */

function effectName(node, rank, scope) {
  let name = node.name;
  if (node.maxRank > 1) name += ` (Rank ${rank})`;
  return `${name} · ${SCOPES[scope].short}`;
}

/**
 * Build the Active Effects an actor should carry: one per unlocked node per scope.
 * Returns Map<key, effectData>, key = "treeId.nodeId.scope".
 */
export function buildDesiredEffects(actor, { trees = getTrees(), systemId = globalThis.game?.system?.id ?? "lancer" } = {}) {
  const desired = new Map();
  const vars = formulaVars(actor);
  for (const [treeId, nodeRanks] of Object.entries(getRanks(actor))) {
    const tree = trees[treeId];
    if (!tree) continue;
    for (const [nodeId, rawRank] of Object.entries(nodeRanks)) {
      const node = tree.nodes[nodeId];
      if (!node) continue;
      const rank = Math.min(rawRank, node.maxRank);
      if (rank <= 0) continue;

      const byScope = {};
      const push = (scope, change) => (byScope[scope] ??= []).push(change);

      for (const mod of node.modifiers) {
        if (!mod.key || !SCOPES[mod.scope]) continue;
        const value = resolveModifierValue(mod, rank, vars);
        if (value === null || value === undefined) continue;
        push(mod.scope, {
          key: mod.key,
          mode: mod.mode,
          value: String(value),
          priority: mod.priority ?? MODE_INFO[mod.mode]?.priority ?? 20
        });
      }

      for (const inst of node.custom) {
        const skill = getCustomSkill(inst.skill);
        if (typeof skill?.changes !== "function") continue;
        let list = [];
        try {
          list = skill.changes(skillContext({ actor, tree, node, rank, inst, skill, extra: { vars } })) ?? [];
        } catch (err) {
          console.error(`${MODULE_ID} | ${skill.id}.changes failed`, err);
        }
        for (const c of Array.isArray(list) ? list : []) {
          if (!c?.key || c.value === null || c.value === undefined) continue;
          const scope = SCOPES[c.scope] ? c.scope : "mech";
          const mode = Number.isInteger(c.mode) ? c.mode : AE_MODES.ADD;
          push(scope, {
            key: c.key,
            mode,
            value: typeof c.value === "object" ? JSON.stringify(c.value) : String(c.value),
            priority: c.priority ?? MODE_INFO[mode]?.priority ?? 20
          });
        }
      }

      for (const [scope, changes] of Object.entries(byScope)) {
        const key = `${treeId}.${nodeId}.${scope}`;
        desired.set(key, {
          name: effectName(node, rank, scope),
          img: node.img,
          description: `<p><em>${esc(tree.name)}</em> skill tree</p>`,
          disabled: false,
          transfer: false,
          origin: actor.uuid,
          changes,
          flags: {
            [MODULE_ID]: { key, treeId, nodeId, scope, rank, treeName: tree.name },
            [systemId]: { target_type: SCOPES[scope].targetType }
          }
        });
      }
    }
  }
  return desired;
}

function signature(data, systemId) {
  return JSON.stringify({
    n: data.name,
    i: data.img,
    c: (data.changes ?? []).map((c) => [c.key, Number(c.mode), String(c.value), Number(c.priority ?? 0)]),
    t: data.flags?.[systemId]?.target_type ?? null,
    r: data.flags?.[MODULE_ID]?.rank ?? null,
    tn: data.flags?.[MODULE_ID]?.treeName ?? null
  });
}

/* ------------------------------------------------------------------ */
/*  Sync                                                               */
/* ------------------------------------------------------------------ */

const QUEUES = new Map();

/**
 * Bring an actor's managed Active Effects in line with its unlocked skills.
 * Calls on the same actor are serialized. Non-owners ask the GM to do it.
 */
export function syncActor(actor) {
  if (!actor || actor.documentName !== "Actor") return Promise.resolve(false);
  const key = actor.uuid;
  const run = (QUEUES.get(key) ?? Promise.resolve()).catch(() => {}).then(() => syncNow(actor));
  QUEUES.set(key, run);
  run.finally(() => {
    if (QUEUES.get(key) === run) QUEUES.delete(key);
  }).catch(() => {});
  return run;
}

async function syncNow(actor) {
  if (!actor.isOwner) {
    if (hasActiveGM()) emit("sync", { actorUuid: actor.uuid });
    return false;
  }
  const systemId = game.system.id;
  const desired = buildDesiredEffects(actor, { systemId });
  const existing = actor.effects.filter((e) => e.flags?.[MODULE_ID]?.key);
  const toDelete = [];
  const toUpdate = [];
  const seen = new Set();

  for (const effect of existing) {
    const key = effect.flags[MODULE_ID].key;
    const want = desired.get(key);
    if (!want || seen.has(key)) {
      toDelete.push(effect.id);
      continue;
    }
    seen.add(key);
    if (signature(effect, systemId) !== signature(want, systemId)) {
      toUpdate.push({ _id: effect.id, name: want.name, img: want.img, description: want.description, changes: want.changes, flags: want.flags });
    }
  }
  const toCreate = [...desired.entries()].filter(([key]) => !seen.has(key)).map(([, data]) => data);

  if (toDelete.length) await actor.deleteEmbeddedDocuments("ActiveEffect", toDelete);
  if (toUpdate.length) await actor.updateEmbeddedDocuments("ActiveEffect", toUpdate);
  if (toCreate.length) await actor.createEmbeddedDocuments("ActiveEffect", toCreate);

  const changed = toDelete.length + toUpdate.length + toCreate.length > 0;
  if (changed) {
    // Ask the LANCER system to push pilot → mech / deployable effects now.
    try {
      actor.effectHelper?.propagateEffects?.(true);
    } catch (err) {
      console.warn(`${MODULE_ID} | effect propagation failed`, err);
    }
  }
  return changed;
}

onSocket("sync", async ({ actorUuid }) => {
  const actor = await fromUuid(actorUuid);
  if (actor) await syncActor(actor);
});

export async function syncAll() {
  if (!isActiveGM()) return;
  for (const actor of game.actors) {
    if (!hasProgress(actor) && !actor.effects.some((e) => e.flags?.[MODULE_ID]?.key)) continue;
    try {
      await syncActor(actor);
    } catch (err) {
      console.error(`${MODULE_ID} | sync failed for ${actor.name}`, err);
    }
  }
}

let _syncAllTimer = null;
export function syncAllDebounced(delay = 1500) {
  clearTimeout(_syncAllTimer);
  _syncAllTimer = setTimeout(() => syncAll(), delay);
}

const _actorTimers = new Map();
export function syncActorDebounced(actor, delay = 400) {
  clearTimeout(_actorTimers.get(actor.uuid));
  _actorTimers.set(actor.uuid, setTimeout(() => {
    _actorTimers.delete(actor.uuid);
    syncActor(actor);
  }, delay));
}
