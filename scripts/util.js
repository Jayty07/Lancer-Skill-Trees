import { MODULE_ID } from "./constants.js";

export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

export function setting(key) {
  try {
    return game.settings.get(MODULE_ID, key);
  } catch {
    return undefined;
  }
}

/** True on exactly one client: the active GM. */
export function isActiveGM() {
  if (!game.user?.isGM) return false;
  const active = game.users?.activeGM;
  return active ? active.id === game.user.id : true;
}

export function hasActiveGM() {
  return !!game.users?.activeGM;
}

/** Plain text gets paragraphs and line breaks; anything that already looks like HTML is left alone. */
export function textToHTML(text) {
  const t = String(text ?? "").trim();
  if (!t) return "";
  if (/<[a-z][\s\S]*>/i.test(t)) return t;
  return t
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export async function enrich(html, options = {}) {
  if (!html) return "";
  const TE = foundry.applications?.ux?.TextEditor?.implementation ?? globalThis.TextEditor;
  try {
    return await TE.enrichHTML(html, { async: true, ...options });
  } catch (err) {
    console.warn(`${MODULE_ID} | enrichHTML failed`, err);
    return html;
  }
}

export function pickFile({ type = "image", current = "", callback }) {
  const FP = foundry.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
  if (!FP) return ui.notifications.warn("File picker unavailable.");
  new FP({ type, current, callback }).render(true);
}

export function saveJSONFile(data, filename) {
  const save = foundry.utils.saveDataToFile ?? globalThis.saveDataToFile;
  save(JSON.stringify(data, null, 2), "application/json", filename);
}

export function getDropData(event) {
  try {
    return JSON.parse(event.dataTransfer?.getData("text/plain") || "null");
  } catch {
    return null;
  }
}

export function slugify(text) {
  return String(text ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "skill-tree";
}

export function plural(n, one, many = `${one}s`) {
  return `${n} ${Math.abs(n) === 1 ? one : many}`;
}

/** A safe CSS url() value for a user-supplied path. */
export function cssUrl(path) {
  return `url("${String(path).replace(/["\\\n\r]/g, "")}")`;
}

/** Yes/no dialog that resolves false when dismissed. */
export async function confirmDialog(title, html) {
  try {
    const result = await foundry.applications.api.DialogV2.confirm({
      window: { title },
      content: html,
      rejectClose: false
    });
    return result === true;
  } catch {
    return false;
  }
}
