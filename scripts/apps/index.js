import { SkillTreeEditor } from "./editor.js";
import { SkillTreeViewer, VIEWERS } from "./viewer.js";
import { CustomScriptEditor } from "./scripts.js";
import { getProgressActor } from "../actors.js";

const { ApplicationV2 } = foundry.applications.api;

let editor = null;
let scripts = null;

export function openEditor(treeId = null) {
  if (!game.user.isGM) return ui.notifications.warn("Skill Trees: only the GM can edit skill trees.");
  if (!editor?.rendered) editor = new SkillTreeEditor({ treeId });
  else if (treeId) editor.selectTree(treeId);
  editor.render({ force: true });
  return editor;
}

export function openScripts() {
  if (!game.user.isGM) return ui.notifications.warn("Skill Trees: only the GM can edit custom skill scripts.");
  if (!scripts?.rendered) scripts = new CustomScriptEditor();
  scripts.render({ force: true });
  return scripts;
}

/** Open the skill tree window for an actor (a mech opens its pilot's trees). */
export function openTree(actor = null) {
  actor ??= canvas?.tokens?.controlled?.[0]?.actor ?? game.user.character ?? null;
  if (!actor) return ui.notifications.warn("Skill Trees: select a token or assign yourself a character first.");
  const target = getProgressActor(actor) ?? actor;
  if (!target.testUserPermission(game.user, "OBSERVER")) return ui.notifications.warn("Skill Trees: you can't view that character.");
  let app = VIEWERS.get(target.uuid);
  if (!app) {
    app = new SkillTreeViewer({ actor: target });
    VIEWERS.set(target.uuid, app);
  }
  app.render({ force: true });
  return app;
}

export function refreshViewers(actor) {
  for (const app of VIEWERS.values()) {
    if (app.actor === actor || app.actor?.uuid === actor?.uuid) app.render();
  }
}

export function refreshAllViewers() {
  for (const app of VIEWERS.values()) app.render();
}

export function closeViewersFor(actor) {
  for (const app of [...VIEWERS.values()]) {
    if (app.actor?.uuid === actor?.uuid) app.close();
  }
}

/** Settings-menu entries must be classes; these just open the singletons. */
export class EditorLauncher extends ApplicationV2 {
  render() {
    openEditor();
    return this;
  }
}

export class ScriptsLauncher extends ApplicationV2 {
  render() {
    openScripts();
    return this;
  }
}
