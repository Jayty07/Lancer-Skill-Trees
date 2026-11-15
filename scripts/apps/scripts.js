import { MODULE_ID } from "../constants.js";
import { checkScript } from "../world-scripts.js";
import { esc } from "../util.js";

const { ApplicationV2 } = foundry.applications.api;

const TEMPLATE = `// Custom skills written here load for everyone when the world starts.
// Reload (F5) on every client after saving. Full reference: scripts/custom-skills.js in the module.
//
// registerCustomSkill("my-skill-id", {
//   name: "My Skill",
//   description: "What it does, shown to players.",
//   options: { amount: { type: "number", label: "Amount", default: 1 } },
//
//   // Extra Active Effect changes, recalculated whenever the character's skills sync:
//   changes({ actor, rank, options }) {
//     return [{ scope: "mech", key: "system.evasion", value: options.amount * rank }];
//   },
//
//   // Runs on the GM's client:
//   async onUnlock({ actor, rank, options }) {},
//   async onRemove({ actor }) {},
//   async onTurnStart({ actor, progressActor, rank, options, combat }) {}
// });
`;

export class CustomScriptEditor extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "lst-scripts",
    classes: ["lst-app", "lst-scripts-app"],
    tag: "div",
    window: { title: "Custom Skill Scripts", icon: "fa-solid fa-code", resizable: true },
    position: { width: 780, height: 680 },
    actions: {
      lstInsertTemplate() {
        const ta = this.element.querySelector("textarea");
        if (!ta) return;
        ta.value = ta.value.trim() ? `${ta.value.trimEnd()}\n\n${TEMPLATE}` : TEMPLATE;
      },
      lstCheckScript() {
        const err = checkScript(this.element.querySelector("textarea")?.value ?? "");
        if (err) ui.notifications.error(`Script error: ${err.message}`);
        else ui.notifications.info("No syntax errors found.");
      },
      async lstSaveScript() {
        const code = this.element.querySelector("textarea")?.value ?? "";
        const err = checkScript(code);
        if (err) return ui.notifications.error(`Not saved — script error: ${err.message}`);
        await game.settings.set(MODULE_ID, "customScript", code);
        ui.notifications.info("Custom skill scripts saved. Reload (F5) on every client to apply them.");
      }
    }
  };

  async _prepareContext() {
    return {};
  }

  async _renderHTML() {
    const code = game.settings.get(MODULE_ID, "customScript") ?? "";
    return `<div class="lst-scripts">
      <p class="lst-hint">JavaScript that registers custom skills with <code>registerCustomSkill(id, definition)</code>. It runs on every client at startup, like a world script, so only paste code you trust. For effects that hook into LANCER attack flows, add them to <code>scripts/custom-skills.js</code> in the module instead.</p>
      <textarea spellcheck="false" placeholder="// registerCustomSkill(...)">${esc(code)}</textarea>
      <footer class="lst-btn-row">
        <button type="button" class="lst-btn" data-action="lstInsertTemplate"><i class="fa-solid fa-file-code"></i> Insert template</button>
        <button type="button" class="lst-btn" data-action="lstCheckScript"><i class="fa-solid fa-check-double"></i> Check syntax</button>
        <button type="button" class="lst-btn primary" data-action="lstSaveScript"><i class="fa-solid fa-floppy-disk"></i> Save</button>
      </footer>
    </div>`;
  }

  _replaceHTML(result, content) {
    content.innerHTML = result;
  }

  _onRender() {
    const ta = this.element.querySelector("textarea");
    ta?.addEventListener("keydown", (ev) => {
      if (ev.key !== "Tab") return;
      ev.preventDefault();
      const { selectionStart: s, selectionEnd: e, value } = ta;
      ta.value = `${value.slice(0, s)}  ${value.slice(e)}`;
      ta.selectionStart = ta.selectionEnd = s + 2;
    });
  }
}
