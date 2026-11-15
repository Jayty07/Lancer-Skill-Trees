import { MODULE_ID, AE_MODES, SCOPES, STATS, THEMES } from "./constants.js";
import { getTrees, getTree, saveTrees, getRanks, actorPoints } from "./data.js";
import { evaluateFormula, syncActor, syncAll } from "./effects.js";
import {
  registerCustomSkill, getCustomSkill, listCustomSkills, hasSkill, getSkillInstances,
  getSkillHolders, registerGMHandler, runAsGM
} from "./registry.js";
import { getPilot, getActiveMech, getProgressActor } from "./actors.js";
import { setRank, unlock, refund, resetTree, setBonusPoints, setGranted } from "./progression.js";
import { exampleTree } from "./examples.js";
import { openEditor, openTree, openScripts } from "./apps/index.js";

export function buildApi() {
  return {
    MODULE_ID,
    AE_MODES,
    SCOPES,
    STATS,
    THEMES,

    // windows
    openEditor,
    openTree,
    openScripts,

    // custom skills
    registerCustomSkill,
    getCustomSkill,
    listCustomSkills,
    hasSkill,
    getSkillInstances,
    getSkillHolders,
    registerGMHandler,
    runAsGM,

    // trees
    getTrees,
    getTree,
    saveTrees,
    exampleTree,

    // progress
    getRanks,
    getPoints: (actor) => actorPoints(actor),
    setRank,
    unlock,
    refund,
    resetTree,
    setBonusPoints,
    setGranted,

    // actors + effects
    getPilot,
    getActiveMech,
    getProgressActor,
    syncActor,
    syncAll,
    evaluateFormula
  };
}
