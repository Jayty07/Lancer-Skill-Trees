/* =====================================================================
 *  CUSTOM SKILLS
 *  ---------------------------------------------------------------------
 *  Anything a passive modifier can't express lives here. Each
 *  registerCustomSkill() call adds an entry to the "Custom effects"
 *  dropdown in the Skill Tree Editor. Attach it to any skill node.
 *
 *  To add a new one: paste the skill's rules text into a chat with
 *  Claude and ask for it to be added to this file, then publish a new
 *  release (bump "version" in module.json). For quick tests without a
 *  release, the same code can go in Settings → LANCER Skill Trees →
 *  Custom Skill Scripts.
 *
 *  ---------------------------------------------------------------------
 *  DEFINITION (every field is optional except the id)
 *
 *  registerCustomSkill("unique-id", {
 *    name:        "Shown in the editor and to players",
 *    description: "One line shown to players under Effects",
 *
 *    // Settings the GM fills in per node. type: number | text | boolean | select | uuid
 *    options: {
 *      amount: { type: "number", label: "Amount", default: 1, hint: "optional help text" },
 *      mode:   { type: "select", label: "Mode", default: "a", choices: { a: "Option A", b: "Option B" } }
 *    },
 *
 *    // Extra Active Effect changes, merged into the node's effect and recalculated on every sync
 *    // (unlocks, tree edits, and changes to LL / HASE / grit). Return [] for none.
 *    //   scope: "pilot" | "mech" | "deployable" | "drone" | "allDeployables"   (default "mech")
 *    //   mode:  2 add (default), 1 multiply, 5 override, 4 upgrade, 3 downgrade
 *    changes(ctx) { return [{ scope: "mech", key: "system.evasion", value: 1 }]; },
 *
 *    // Lifecycle, run on the GM's client (full permissions):
 *    async onUnlock(ctx) {},       // rank 0 → 1+
 *    async onRankChange(ctx) {},   // rank changed but still unlocked (ctx.previousRank)
 *    async onRemove(ctx) {},       // rank → 0 (refund or reset)
 *
 *    // Combat, run once on the active GM. ctx.actor is the combatant's actor (usually the mech);
 *    // ctx.progressActor is the actor that owns the tree (usually the pilot).
 *    async onTurnStart(ctx) {}, async onTurnEnd(ctx) {},
 *    async onRoundStart(ctx) {}, async onCombatEnd(ctx) {},
 *
 *    // Steps inserted into LANCER system flows (only run for actors with the skill).
 *    // Flows: WeaponAttackFlow, TechAttackFlow, StatRollFlow, StructureFlow, OverheatFlow, ...
 *    // Return false to stop the flow. These must live in this file (they register at startup).
 *    flowSteps: [{ flow: "WeaponAttackFlow", after: "showAttackHUD", run: async (flowState, ctx) => true }],
 *
 *    // Called once when the world is ready; register your own Hooks here.
 *    setup(api) {}
 *  });
 *
 *  ctx = { actor, progressActor, pilot, mech, tree, node, rank, options, skill, api,
 *          previousRank?, combat?, combatant?, token?, vars? }
 *
 *  api (also at game.modules.get("lancer-skill-trees").api and globalThis.LancerSkillTrees):
 *    hasSkill(actor, id), getSkillInstances(actor, id), getSkillHolders(id),
 *    getPilot(actor), getActiveMech(actor), getProgressActor(actor),
 *    syncActor(actor), registerGMHandler(name, fn), runAsGM(name, data),
 *    getRanks(actor), getPoints(actor), setRank(actor, treeId, nodeId, rank, { force }),
 *    openTree(actor), openEditor(), evaluateFormula(text, vars)
 *
 *  Useful LANCER data paths (check a real actor with `actor.system` in the F12 console):
 *  system.hp.value / .max, system.heat.value / .max, system.structure.value,
 *  system.stress.value, system.evasion, system.edef, system.speed, system.armor,
 *  pilot: system.level (License Level), system.grit, system.hull / agi / sys / eng,
 *  links: pilot.system.active_mech.value, mech.system.pilot.value.
 * ===================================================================== */

import { registerCustomSkill } from "./registry.js";

/* --- Example 1: a combat trigger ------------------------------------ */
registerCustomSkill("coolant-flush", {
  name: "Coolant Flush",
  description: "At the start of each of your turns, your mech clears Heat (amount × rank).",
  options: {
    heat: { type: "number", label: "Heat cleared per rank", default: 1 }
  },
  async onTurnStart({ actor, rank, options }) {
    if (actor?.type !== "mech") return; // only while mounted
    const heat = Number(actor.system?.heat?.value ?? 0);
    const clear = Math.min(heat, (Number(options.heat) || 0) * rank);
    if (clear <= 0) return;
    await actor.update({ "system.heat.value": heat - clear });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<p><strong>Coolant Flush:</strong> ${actor.name} clears ${clear} Heat.</p>`
    });
  }
});

/* --- Example 2: computed passive changes ---------------------------- */
registerCustomSkill("iron-hull-doctrine", {
  name: "Iron Hull Doctrine",
  description: "+1 mech Save Target per rank. If the pilot's HULL is 2 or more, also +1 mech Armor.",
  changes({ actor, rank }) {
    const changes = [{ scope: "mech", key: "system.save", value: rank }];
    if (Number(actor.system?.hull ?? 0) >= 2) changes.push({ scope: "mech", key: "system.armor", value: 1 });
    return changes;
  }
});

/* --- Example 3: grant an item on unlock, take it back on refund ----- */
registerCustomSkill("signature-gear", {
  name: "Signature Gear",
  description: "Gives the character an item (pilot gear, talent, mech system, weapon…) while this skill is unlocked.",
  options: {
    itemUuid: { type: "uuid", label: "Item", default: "", hint: "Drag an item from the sidebar or a compendium." },
    target: { type: "select", label: "Give it to", default: "pilot", choices: { pilot: "The pilot", mech: "The active mech" } }
  },
  async onUnlock({ actor, tree, node, options, api }) {
    const source = options.itemUuid ? await fromUuid(options.itemUuid) : null;
    if (source?.documentName !== "Item") return ui.notifications.warn(`Signature Gear (${node.name}): no item set.`);
    const recipient = options.target === "mech" ? api.getActiveMech(actor) : actor;
    if (!recipient) return ui.notifications.warn(`Signature Gear (${node.name}): ${actor.name} has no active mech.`);
    const data = source.toObject();
    delete data._id;
    foundry.utils.setProperty(data, `flags.${api.MODULE_ID}.grantedBy`, `${tree.id}.${node.id}`);
    await recipient.createEmbeddedDocuments("Item", [data]);
  },
  async onRemove({ actor, tree, node, api }) {
    const tag = `${tree.id}.${node.id}`;
    for (const doc of new Set([actor, api.getActiveMech(actor)].filter(Boolean))) {
      const ids = doc.items.filter((i) => i.flags?.[api.MODULE_ID]?.grantedBy === tag).map((i) => i.id);
      if (ids.length) await doc.deleteEmbeddedDocuments("Item", ids);
    }
  }
});

/* --- Add new custom skills below this line -------------------------- */
