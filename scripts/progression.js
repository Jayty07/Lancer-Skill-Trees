import { MODULE_ID } from "./constants.js";
import {
  getTrees, getTree, getRanks, actorLevel, actorPoints, canIncrease, canDecrease, treeAccessible
} from "./data.js";
import { syncActor } from "./effects.js";
import { nodeHasLifecycle, runLifecycleLocal } from "./registry.js";
import { onSocket, emit } from "./socket.js";
import { state } from "./state.js";
import { esc, setting, hasActiveGM } from "./util.js";

/**
 * Change a skill's rank on an actor, enforcing the rules unless a GM forces it.
 * Then sync Active Effects, run custom effects and the node macro, and announce in chat.
 */
export async function setRank(actor, treeId, nodeId, rank, { force = false, silent = false } = {}) {
  const tree = getTree(treeId);
  const node = tree?.nodes?.[nodeId];
  if (!actor || !tree || !node) {
    ui.notifications.warn("Skill Trees: that skill no longer exists.");
    return false;
  }
  if (!actor.isOwner) {
    ui.notifications.warn("Skill Trees: you don't own this character.");
    return false;
  }
  const isGM = game.user.isGM;
  const treeRanks = getRanks(actor)[treeId] ?? {};
  const previousRank = Math.min(treeRanks[nodeId] ?? 0, node.maxRank);
  const target = Math.max(0, Math.min(node.maxRank, Math.round(Number(rank) || 0)));
  if (target === previousRank) return false;

  if (!(force && isGM)) {
    if (target > previousRank) {
      if (!isGM && !setting("playersCanUnlock")) return deny("Only the GM can unlock skills in this game.");
      if (!treeAccessible(tree, actor)) return deny("This character doesn't have access to that tree.");
      const pts = actorPoints(actor, getTrees());
      const check = canIncrease({ tree, node, treeRanks, level: actorLevel(actor), available: pts.available, steps: target - previousRank });
      if (!check.ok) return deny(check.reason);
    } else {
      if (!isGM && !setting("playersCanRefund")) return deny("Only the GM can refund skills in this game.");
      let sim = { ...treeRanks };
      for (let r = previousRank; r > target; r--) {
        const check = canDecrease({ tree, node, treeRanks: sim });
        if (!check.ok) return deny(check.reason);
        sim = { ...sim, [nodeId]: r - 1 };
      }
    }
  }

  await actor.update({ [`flags.${MODULE_ID}.ranks.${treeId}.${nodeId}`]: target });
  await afterRankChange({ actor, tree, node, rank: target, previousRank, silent });
  return true;
}

export async function unlock(actor, treeId, nodeId, options = {}) {
  const current = getRanks(actor)[treeId]?.[nodeId] ?? 0;
  return setRank(actor, treeId, nodeId, current + 1, options);
}

export async function refund(actor, treeId, nodeId, options = {}) {
  const current = getRanks(actor)[treeId]?.[nodeId] ?? 0;
  return setRank(actor, treeId, nodeId, current - 1, options);
}

/** GM: clear every rank in one tree for an actor. */
export async function resetTree(actor, treeId) {
  if (!game.user.isGM) return deny("Only the GM can reset a tree.");
  const tree = getTree(treeId);
  const treeRanks = getRanks(actor)[treeId] ?? {};
  await actor.update({ [`flags.${MODULE_ID}.ranks.-=${treeId}`]: null });
  await syncActor(actor);
  if (tree) {
    for (const [nodeId, r] of Object.entries(treeRanks)) {
      const node = tree.nodes[nodeId];
      if (node) await runLifecycleAndMacro({ actor, tree, node, rank: 0, previousRank: Math.min(r, node.maxRank) });
    }
  }
  return true;
}

export async function setBonusPoints(actor, value) {
  if (!game.user.isGM) return deny("Only the GM can change bonus points.");
  await actor.update({ [`flags.${MODULE_ID}.bonusPoints`]: Math.round(Number(value) || 0) });
  return true;
}

export async function setGranted(actor, treeId, granted) {
  if (!game.user.isGM) return deny("Only the GM can grant trees.");
  await actor.update({ [`flags.${MODULE_ID}.granted.${treeId}`]: !!granted });
  return true;
}

function deny(message) {
  ui.notifications.warn(`Skill Trees: ${message}`);
  return false;
}

/* ------------------------------------------------------------------ */

async function afterRankChange({ actor, tree, node, rank, previousRank, silent }) {
  await syncActor(actor);
  await dispatchLifecycle({ actor, tree, node, rank, previousRank });
  if (!silent && setting("announceUnlocks")) await announce({ actor, tree, node, rank, previousRank });
  Hooks.callAll("lancerSkillTrees.rankChanged", { actor, tree, node, rank, previousRank });
}

/** Custom effects and macros run on the GM's client so they have full permissions. */
async function dispatchLifecycle(payload) {
  const { actor, tree, node, rank, previousRank } = payload;
  if (!nodeHasLifecycle(node, previousRank, rank) && !node.macro) return;
  if (game.user.isGM || !hasActiveGM()) return runLifecycleAndMacro(payload);
  emit("lifecycle", { actorUuid: actor.uuid, treeId: tree.id, nodeId: node.id, rank, previousRank });
}

async function runLifecycleAndMacro(payload) {
  await runLifecycleLocal(payload);
  await runNodeMacro(payload);
}

async function runNodeMacro({ actor, tree, node, rank, previousRank }) {
  if (!node.macro) return;
  let macro = null;
  try {
    macro = await fromUuid(node.macro);
  } catch { /* bad uuid */ }
  if (macro?.documentName !== "Macro") {
    console.warn(`${MODULE_ID} | macro ${node.macro} for skill "${node.name}" not found`);
    return;
  }
  const event = previousRank <= 0 ? "unlock" : rank <= 0 ? "remove" : rank > previousRank ? "rankUp" : "rankDown";
  try {
    await macro.execute({ actor, tree, node, rank, previousRank, event, api: state.api });
  } catch (err) {
    console.error(`${MODULE_ID} | macro for "${node.name}" failed`, err);
  }
}

onSocket("lifecycle", async ({ actorUuid, treeId, nodeId, rank, previousRank, userId }) => {
  const actor = await fromUuid(actorUuid);
  const tree = getTree(treeId);
  const node = tree?.nodes?.[nodeId];
  if (!actor || !node) return;
  const user = game.users.get(userId);
  if (!user || !actor.testUserPermission(user, "OWNER")) return;
  // Only act if the actor really is at that rank now (the flag update may arrive a moment later).
  const matches = () => Math.min(getRanks(actor)[treeId]?.[nodeId] ?? 0, node.maxRank) === rank;
  if (!matches()) await new Promise((r) => setTimeout(r, 750));
  if (!matches()) return;
  await runLifecycleAndMacro({ actor, tree, node, rank, previousRank });
});

async function announce({ actor, tree, node, rank, previousRank }) {
  const verb = rank > previousRank ? (previousRank === 0 ? "unlocked" : "upgraded") : rank === 0 ? "refunded" : "lowered";
  const rankText = node.maxRank > 1 && rank > 0 ? ` <span class="lst-chat-rank">${rank}/${node.maxRank}</span>` : "";
  const content = `<div class="lst-chat-card" style="--lst-accent:${esc(tree.style.accent)}">
    <img src="${esc(node.img)}" alt="">
    <div>
      <div class="lst-chat-title">${esc(node.name)}${rankText}</div>
      <div class="lst-chat-sub">${esc(actor.name)} ${verb} a skill in <em>${esc(tree.name)}</em></div>
    </div>
  </div>`;
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content });
}
