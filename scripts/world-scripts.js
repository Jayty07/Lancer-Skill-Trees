import { MODULE_ID } from "./constants.js";
import { registerCustomSkill } from "./registry.js";
import { state } from "./state.js";

const ARGS = ["registerCustomSkill", "api", "MODULE_ID"];
let loadError = null;

/** Syntax-check a script without running it. Returns the error, or null. */
export function checkScript(code) {
  try {
    // eslint-disable-next-line no-new-func
    new Function(...ARGS, `"use strict";\n${code}`);
    return null;
  } catch (err) {
    return err;
  }
}

/** Run the GM's "Custom Skill Scripts" setting. Called during the setup hook. */
export function runWorldScripts() {
  let code = "";
  try {
    code = game.settings.get(MODULE_ID, "customScript") ?? "";
  } catch {
    return;
  }
  if (!code.trim()) return;
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(...ARGS, `"use strict";\n${code}`);
    fn(registerCustomSkill, state.api, MODULE_ID);
    console.log(`${MODULE_ID} | custom skill scripts loaded`);
  } catch (err) {
    loadError = err;
    console.error(`${MODULE_ID} | custom skill scripts failed`, err);
  }
}

export function reportWorldScriptErrors() {
  if (loadError && game.user.isGM) {
    ui.notifications.error(`LANCER Skill Trees: your Custom Skill Scripts have an error (${loadError.message}). Press F12 for details.`, { permanent: true });
  }
}
