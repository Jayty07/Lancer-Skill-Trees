import { MODULE_ID } from "./constants.js";
import { getTrees, getRanks, hasProgress } from "./data.js";
import { getPilot, getActiveMech, getProgressActor, progressActorsFor } from "./actors.js";
import { onSocket, emit } from "./socket.js";
import { state } from "./state.js";
import { isActiveGM, hasActiveGM } from "./util.js";

/* ------------------------------------------------------------------ */
/*  Custom skill registry                                              */
/* ------------------------------------------------------------------ */

const SKILLS = new Map();
let READY = false;

/**
 * Register a scripted skill effect. See scripts/custom-skills.js for the full reference.
 * @param {string} id          Stable id stored on tree nodes, e.g. "coolant-flush".
 * @param {object} definition  { name, description, options, changes, onUnlock, onRemove,
 *                               onRankChange, onTurnStart, onTurnEnd, onRoundStart,
 *                               onCombatEnd, flowSteps, setup }
 */
export function registerCustomSkill(id, definition = {}) {
  if (typeof id !== "string" || !id.trim()) throw new Error(`${MODULE_ID} | registerCustomSkill needs a string id`);
  if (!definition || typeof definition !== "object") throw new Error(`${MODULE_ID} | registerCustomSkill("${id}") needs a definition object`);
  if (SKILLS.has(id)) console.warn(`${MODULE_ID} | custom skill "${id}" registered twice; the later one wins`);
  const skill = {
    ...definition,
    id,
    name: definition.name ?? id,
    description: definition.description ?? "",
    options: definition.options ?? {}
  };
  SKILLS.set(id, skill);
  if (READY) runSetup(skill);
  return skill;
}

export function getCustomSkill(id) {
  return SKILLS.get(id) ?? null;
}

export function listCustomSkills() {
  return [...SKILLS.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function normalizeChoices(choices) {
  if (Array.isArray(choices)) return Object.fromEntries(choices.map((c) => [c, c]));
  return choices && typeof choices === "object" ? choices : {};
}

export function optionChoices(def) {
  return normalizeChoices(def?.choices);
}

export function skillOptionDefaults(skill) {
  const out = {};
  for (const [key, def] of Object.entries(skill?.options ?? {})) {
    if (def?.default !== undefined) out[key] = def.default;
    else if (def?.type === "boolean") out[key] = false;
    else if (def?.type === "number") out[key] = 0;
    else if (def?.type === "select") out[key] = Object.keys(normalizeChoices(def.choices))[0] ?? "";
    else out[key] = "";
  }
  return out;
}

export function resolveOptions(skill, inst) {
  return { ...skillOptionDefaults(skill), ...(inst?.options ?? {}) };
}

/** The object every custom skill callback receives. */
export function skillContext({ actor, tree, node, rank, inst, skill, extra = {} }) {
  return {
    actor,
    progressActor: actor,
    pilot: getPilot(actor),
    mech: getActiveMech(actor),
    tree,
    node,
    rank,
    options: resolveOptions(skill, inst),
    skill,
    api: state.api,
    ...extra
  };
}

/* ------------------------------------------------------------------ */
/*  Who has what                                                       */
/* ------------------------------------------------------------------ */

/** Unlocked custom-effect instances on one actor's trees (optionally filtered by skill id). */
export function getSkillInstances(actor, skillId = null, trees = getTrees()) {
  const out = [];
  if (!actor) return out;
  for (const [treeId, nodeRanks] of Object.entries(getRanks(actor))) {
    const tree = trees[treeId];
    if (!tree) continue;
    for (const [nodeId, r] of Object.entries(nodeRanks)) {
      const node = tree.nodes[nodeId];
      if (!node) continue;
      const rank = Math.min(r, node.maxRank);
      if (rank <= 0) continue;
      for (const inst of node.custom) {
        if (skillId && inst.skill !== skillId) continue;
        const skill = getCustomSkill(inst.skill);
        out.push({ actor, tree, node, rank, inst, skill, options: resolveOptions(skill, inst) });
      }
    }
  }
  return out;
}

/** Does this actor (or, for a mech, its pilot) have the custom skill unlocked? */
export function hasSkill(actor, skillId) {
  const actors = new Set([actor, getProgressActor(actor)].filter(Boolean));
  return [...actors].some((a) => getSkillInstances(a, skillId).length > 0);
}

/** Every world actor holding a custom skill: [{ actor, tree, node, rank, options }]. */
export function getSkillHolders(skillId) {
  return game.actors.contents.flatMap((a) => (hasProgress(a) ? getSkillInstances(a, skillId) : []));
}

/* ------------------------------------------------------------------ */
/*  Lifecycle: unlock / remove / rank change                           */
/* ------------------------------------------------------------------ */

export function lifecycleMethod(previousRank, rank) {
  if (previousRank <= 0 && rank > 0) return "onUnlock";
  if (previousRank > 0 && rank <= 0) return "onRemove";
  if (previousRank !== rank) return "onRankChange";
  return null;
}

export function nodeHasLifecycle(node, previousRank, rank) {
  const method = lifecycleMethod(previousRank, rank);
  return !!method && node.custom.some((i) => typeof getCustomSkill(i.skill)?.[method] === "function");
}

export async function runLifecycleLocal({ actor, tree, node, rank, previousRank }) {
  const method = lifecycleMethod(previousRank, rank);
  if (!method) return;
  for (const inst of node.custom) {
    const skill = getCustomSkill(inst.skill);
    const fn = skill?.[method];
    if (typeof fn !== "function") continue;
    const ctx = skillContext({ actor, tree, node, rank, inst, skill, extra: { previousRank } });
    try {
      await fn.call(skill, ctx);
    } catch (err) {
      console.error(`${MODULE_ID} | ${skill.id}.${method} failed`, err);
      ui.notifications?.error(`Skill Trees: the custom effect "${skill.name}" failed. Press F12 for details.`);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Combat events (run once, on the active GM)                         */
/* ------------------------------------------------------------------ */

async function dispatchActorEvent(actor, method, extra = {}) {
  for (const pa of progressActorsFor(actor)) {
    for (const inst of getSkillInstances(pa)) {
      const fn = inst.skill?.[method];
      if (typeof fn !== "function") continue;
      const ctx = skillContext({
        actor: pa, tree: inst.tree, node: inst.node, rank: inst.rank, inst: inst.inst, skill: inst.skill,
        extra: { ...extra, actor, progressActor: pa }
      });
      try {
        await fn.call(inst.skill, ctx);
      } catch (err) {
        console.error(`${MODULE_ID} | ${inst.skill.id}.${method} failed`, err);
      }
    }
  }
}

export function initCombatEvents() {
  Hooks.on("combatTurnChange", async (combat, prior, current) => {
    if (!isActiveGM()) return;
    const ctxFor = (c) => ({ combat, combatant: c, token: c.token });
    const priorId = prior?.combatantId ?? null;
    const currentId = current?.combatantId ?? null;
    if (priorId && priorId !== currentId) {
      const c = combat.combatants.get(priorId);
      if (c?.actor) await dispatchActorEvent(c.actor, "onTurnEnd", ctxFor(c));
    }
    if ((current?.round ?? 0) > (prior?.round ?? 0)) {
      for (const c of combat.combatants) if (c.actor) await dispatchActorEvent(c.actor, "onRoundStart", ctxFor(c));
    }
    if (currentId && currentId !== priorId) {
      const c = combat.combatants.get(currentId);
      if (c?.actor) await dispatchActorEvent(c.actor, "onTurnStart", ctxFor(c));
    }
  });

  Hooks.on("deleteCombat", async (combat) => {
    if (!isActiveGM() || !combat.started) return;
    for (const c of combat.combatants) {
      if (c.actor) await dispatchActorEvent(c.actor, "onCombatEnd", { combat, combatant: c, token: c.token });
    }
  });
}

/* ------------------------------------------------------------------ */
/*  LANCER flow steps                                                   */
/* ------------------------------------------------------------------ */

/**
 * Called from the LANCER system's "lancer.registerFlows" hook. A custom skill can declare
 *   flowSteps: [{ flow: "WeaponAttackFlow", after: "showAttackHUD", run: async (state, ctx) => {} }]
 * The step only runs for actors that have the skill unlocked.
 */
export function registerFlowSteps(flowSteps, flows) {
  for (const skill of SKILLS.values()) {
    (skill.flowSteps ?? []).forEach((fs, i) => {
      if (!fs?.flow || typeof fs.run !== "function") return;
      const stepName = `${MODULE_ID}.${skill.id}.${i}`;
      flowSteps.set(stepName, async (flowState, flowOptions) => {
        try {
          const actor = flowState?.actor;
          if (!actor) return true;
          for (const pa of progressActorsFor(actor)) {
            for (const inst of getSkillInstances(pa, skill.id)) {
              const ctx = skillContext({
                actor: pa, tree: inst.tree, node: inst.node, rank: inst.rank, inst: inst.inst, skill,
                extra: { actor, progressActor: pa, flowOptions }
              });
              const result = await fs.run.call(skill, flowState, ctx);
              if (result === false) return false;
            }
          }
        } catch (err) {
          console.error(`${MODULE_ID} | flow step ${stepName} failed`, err);
        }
        return true;
      });
      const flow = flows.get(fs.flow);
      if (!flow) return console.warn(`${MODULE_ID} | ${skill.id}: unknown LANCER flow "${fs.flow}"`);
      try {
        if (fs.before) flow.insertStepBefore(fs.before, stepName);
        else flow.insertStepAfter(fs.after, stepName);
      } catch (err) {
        console.error(`${MODULE_ID} | could not insert ${stepName} into ${fs.flow}`, err);
      }
    });
  }
}

/* ------------------------------------------------------------------ */
/*  Setup + GM handlers                                                */
/* ------------------------------------------------------------------ */

function runSetup(skill) {
  if (typeof skill.setup !== "function") return;
  try {
    skill.setup(state.api);
  } catch (err) {
    console.error(`${MODULE_ID} | setup for custom skill "${skill.id}" failed`, err);
  }
}

export function readyRegistry() {
  READY = true;
  for (const skill of SKILLS.values()) runSetup(skill);
}

const GM_LOCAL = new Map();

/** Custom code that needs GM permissions: registerGMHandler("name", fn) then runAsGM("name", data). */
export function registerGMHandler(name, fn) {
  onSocket(`gm:${name}`, fn);
  GM_LOCAL.set(name, fn);
}

export async function runAsGM(name, payload = {}) {
  if (game.user.isGM) return GM_LOCAL.get(name)?.({ ...payload, userId: game.user.id });
  if (!hasActiveGM()) return ui.notifications.warn("Skill Trees: a GM needs to be online for that.");
  emit(`gm:${name}`, payload);
}
