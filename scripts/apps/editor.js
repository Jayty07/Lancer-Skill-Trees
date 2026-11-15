import {
  CELL_SIZE, SCOPES, STATS, CUSTOM_KEY, MODE_INFO, MODE_ORDER, AE_MODES,
  DEFAULT_NODE_IMG, DEFAULT_TREE_IMG, THEMES, NODE_SHAPES, LINK_STYLES, ROW_SPACING, ICONS, suggestIcon, THEME_HEXWEB
} from "../constants.js";
import {
  getTrees, saveTrees, normalizeTree, normalizeNode, normalizeModifier, normalizeCustom,
  sortedTrees, wouldCreateCycle, nodeAt, firstFreeCell, cloneTreeWithNewIds, toInt, themeDefaults, rowHeight
} from "../data.js";
import { evaluateFormula } from "../effects.js";
import { listCustomSkills, getCustomSkill, skillOptionDefaults, optionChoices } from "../registry.js";
import { exampleTree, exampleRadialTree } from "../examples.js";
import { radialConfig, fromXY, snapPos, snapPoints, toXY, nodePos, autoPos, radialSlot, sectorName, CORE, DEFAULT_SECTOR_NAMES } from "../radial.js";
import { state } from "../state.js";
import { esc, pickFile, saveJSONFile, getDropData, slugify, plural, confirmDialog } from "../util.js";
import { renderTreeBlock, opt, bindSkillTooltips, hideSkillTooltip, skillTooltipHTML, plainExcerpt } from "./common.js";

const { ApplicationV2, DialogV2 } = foundry.applications.api;

const NUMERIC_MODES = new Set([AE_MODES.ADD, AE_MODES.MULTIPLY, AE_MODES.UPGRADE, AE_MODES.DOWNGRADE]);

export class SkillTreeEditor extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "lst-editor",
    classes: ["lst-app", "lst-editor-app"],
    tag: "div",
    window: { title: "LANCER Skill Tree Editor", icon: "fa-solid fa-diagram-project", resizable: true },
    position: { width: 1220, height: 800 },
    actions: {
      lstNewTree() { this.createTree(); },
      lstDuplicateTree() { this.duplicateTree(); },
      lstDeleteTree() { this.deleteTree(); },
      lstImport() { this.importTrees(); },
      lstExport(event) { this.exportTrees(event.shiftKey); },
      lstAddExample() { this.addExample(); },
      lstAddNode() { this.addNode(); },
      lstDeleteNode() { this.deleteNode(); },
      lstDeselect() { this.selectedId = null; this.render(); },
      lstSelectNode(event, target) { this.onNodeClick(event, target.dataset.nodeId); },
      lstAddModifier() { this.addModifier(); },
      lstRemoveModifier(event, target) { this.removeAt("modifiers", Number(target.dataset.index)); },
      lstAddCustom() { this.addCustom(); },
      lstRemoveCustom(event, target) { this.removeAt("custom", Number(target.dataset.index)); },
      lstPickNodeImage() { this.pickImage("node"); },
      lstUseIcon(event, target) { this.useIcon(target.dataset.target, target.dataset.path); },
      lstPickTreeImage() { this.pickImage("tree"); },
      lstPickBackground() { this.pickImage("background"); },
      lstClearBackground() { this.setStyle("background", ""); },
      lstOpenMacro() { this.openMacro(); },
      lstApplyTheme() { this.applyThemeDefaults(); },
      lstOpenScripts() { state.api?.openScripts(); }
    }
  };

  constructor({ treeId = null, ...options } = {}) {
    super(options);
    this.trees = foundry.utils.deepClone(getTrees());
    this.treeId = treeId && this.trees[treeId] ? treeId : sortedTrees(this.trees)[0]?.id ?? null;
    this.selectedId = null;
    this._dirty = false;
    this._saveTimer = null;
    this._scroll = null;
  }

  get tree() {
    return this.trees[this.treeId] ?? null;
  }

  get node() {
    return this.tree?.nodes?.[this.selectedId] ?? null;
  }

  selectTree(treeId) {
    if (this.trees[treeId]) {
      this.treeId = treeId;
      this.selectedId = null;
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Rendering                                                        */
  /* ---------------------------------------------------------------- */

  async _prepareContext() {
    return {};
  }

  async _renderHTML() {
    const trees = sortedTrees(this.trees);
    const tree = this.tree;
    const toolbar = `<header class="lst-toolbar">
      <label class="lst-tree-picker"><i class="fa-solid fa-diagram-project"></i>
        <select data-role="tree-select" ${trees.length ? "" : "disabled"}>
          ${trees.map((t) => opt(t.id, t.name, t.id === this.treeId)).join("") || opt("", "No trees yet", true)}
        </select>
      </label>
      <button type="button" class="lst-btn" data-action="lstNewTree"><i class="fa-solid fa-plus"></i> New</button>
      <button type="button" class="lst-btn" data-action="lstDuplicateTree" ${tree ? "" : "disabled"}><i class="fa-solid fa-copy"></i> Duplicate</button>
      <button type="button" class="lst-btn danger" data-action="lstDeleteTree" ${tree ? "" : "disabled"}><i class="fa-solid fa-trash"></i> Delete</button>
      <span class="lst-sep"></span>
      <button type="button" class="lst-btn" data-action="lstImport"><i class="fa-solid fa-file-import"></i> Import</button>
      <button type="button" class="lst-btn" data-action="lstExport" ${tree ? "" : "disabled"} data-tooltip="Shift-click to export every tree"><i class="fa-solid fa-file-export"></i> Export</button>
      <button type="button" class="lst-btn" data-action="lstAddExample"><i class="fa-solid fa-flask"></i> Example</button>
      <button type="button" class="lst-btn" data-action="lstOpenScripts" data-tooltip="Custom skill scripts"><i class="fa-solid fa-code"></i></button>
      <span class="lst-status" data-role="status">${this._statusText()}</span>
    </header>`;

    if (!tree) {
      return `<div class="lst-editor">${toolbar}
        <div class="lst-empty">
          <i class="fa-solid fa-diagram-project"></i>
          <h2>No skill trees yet</h2>
          <p>Create a tree from scratch, or add the example to see ranks, prerequisites, tier gating, passive modifiers and a scripted custom effect in action.</p>
          <div class="lst-btn-row">
            <button type="button" class="lst-btn primary" data-action="lstNewTree"><i class="fa-solid fa-plus"></i> Create a tree</button>
            <button type="button" class="lst-btn" data-action="lstAddExample"><i class="fa-solid fa-flask"></i> Add example tree</button>
            <button type="button" class="lst-btn" data-action="lstImport"><i class="fa-solid fa-file-import"></i> Import JSON</button>
          </div>
        </div>
      </div>`;
    }

    return `<div class="lst-editor">${toolbar}
      <div class="lst-body">
        <section class="lst-canvas-wrap">${this._canvasHTML()}</section>
        <aside class="lst-panel lst-inspector">${this.node ? this._nodeInspector(tree, this.node) : this._treeInspector(tree)}</aside>
      </div>
      <footer class="lst-footer">
        <span><b>Double-click</b> an empty spot to add a skill</span>
        <span><b>Drag</b> a skill to move it</span>
        <span><b>Shift-click</b> another skill to toggle it as a prerequisite of the selected one</span>
      </footer>
    </div>`;
  }

  _canvasHTML() {
    const tree = this.tree;
    const sel = this.node;
    return renderTreeBlock(tree, {
      mode: "edit",
      uid: this.id,
      selectedId: this.selectedId,
      centerValue: Object.keys(tree.nodes).length,
      centerLabel: "skills",
      nodeState: (n) => {
        let cls = "";
        if (sel && sel.requires.includes(n.id)) cls = "is-prereq";
        else if (sel && n.requires.includes(sel.id)) cls = "is-dependent";
        const marks = [
          n.modifiers.length ? '<i class="fa-solid fa-chart-simple" data-tooltip="Passive modifiers"></i>' : "",
          n.custom.length ? '<i class="fa-solid fa-code" data-tooltip="Custom effect"></i>' : "",
          n.macro ? '<i class="fa-solid fa-terminal" data-tooltip="Macro"></i>' : ""
        ].join("");
        const badge = `${n.cost}pt${n.maxRank > 1 ? ` ×${n.maxRank}` : ""}`;
        return { cls, badge, marks };
      },
      linkState: (r, n) => (sel && (r.id === sel.id || n.id === sel.id) ? "hl" : "")
    });
  }

  _treeInspector(tree) {
    const s = tree.style;
    const count = Object.keys(tree.nodes).length;
    return `<div class="lst-section">
        <h3><i class="fa-solid fa-diagram-project"></i> Tree</h3>
        <label class="lst-field">Name<input type="text" data-tree-field="name" value="${esc(tree.name)}"></label>
        <div class="lst-img-row">
          <img src="${esc(tree.img)}" data-action="lstPickTreeImage" data-tooltip="Pick an icon" alt="">
          <label class="lst-field">Icon<input type="text" data-tree-field="img" value="${esc(tree.img)}"></label>
        </div>
        ${this._iconPalette("tree", tree.img, false)}
        <label class="lst-field">Description<textarea data-tree-field="description" rows="3">${esc(tree.description)}</textarea></label>
        <button type="button" class="lst-btn primary" data-action="lstAddNode"><i class="fa-solid fa-plus"></i> Add skill</button>
        <p class="lst-hint">${plural(count, "skill")} · ID <code>${esc(tree.id)}</code></p>
      </div>

      <div class="lst-section">
        <h3><i class="fa-solid fa-palette"></i> Style</h3>
        <label class="lst-field">Theme
          <select data-tree-style="theme">${Object.entries(THEMES).map(([k, t]) => opt(k, t.label, k === s.theme)).join("")}</select>
        </label>
        <p class="lst-hint">${esc(THEMES[s.theme].hint)}</p>
        <button type="button" class="lst-btn small" data-action="lstApplyTheme" data-tooltip="Reset colors, shape, links, spacing, banner and tier bar to this theme's defaults"><i class="fa-solid fa-wand-magic-sparkles"></i> Apply theme defaults</button>
        <div class="lst-grid2">
          <label class="lst-field">Accent<input type="color" data-tree-style="accent" value="${esc(s.accent)}"></label>
          <label class="lst-field">Secondary<input type="color" data-tree-style="secondary" value="${esc(s.secondary)}"></label>
        </div>
        <div class="lst-grid2">
          <label class="lst-field">Skill shape<select data-tree-style="nodeShape">${Object.entries(NODE_SHAPES).map(([k, l]) => opt(k, l, k === s.nodeShape)).join("")}</select></label>
          <label class="lst-field">Links<select data-tree-style="linkStyle">${Object.entries(LINK_STYLES).map(([k, l]) => opt(k, l, k === s.linkStyle)).join("")}</select></label>
        </div>
        <label class="lst-field">Row spacing<select data-tree-style="spacing">${Object.entries(ROW_SPACING).map(([k, v]) => opt(k, v.label, k === s.spacing)).join("")}</select></label>
        <label class="lst-check"><input type="checkbox" data-tree-style="banner" ${s.banner ? "checked" : ""}> Show title banner above the tree</label>
        <label class="lst-check"><input type="checkbox" data-tree-style="tierBar" ${s.tierBar ? "checked" : ""}> Show tier bar (needs “Points per tier” below)</label>
        <div class="lst-field">Background image
          <div class="lst-inline-row">
            <input type="text" data-tree-style="background" value="${esc(s.background)}" placeholder="None">
            <button type="button" class="lst-icon-btn" data-action="lstPickBackground" data-tooltip="Browse"><i class="fa-solid fa-image"></i></button>
            <button type="button" class="lst-icon-btn" data-action="lstClearBackground" data-tooltip="Remove"><i class="fa-solid fa-xmark"></i></button>
          </div>
        </div>
        <label class="lst-field">Background visibility <span class="lst-muted" data-role="bg-opacity">${s.bgOpacity}%</span>
          <input type="range" min="0" max="100" step="5" data-tree-style="bgOpacity" value="${s.bgOpacity}">
        </label>
      </div>

      <div class="lst-section">
        <h3><i class="fa-solid fa-scale-balanced"></i> Rules</h3>
        <label class="lst-field">Who can use this tree
          <select data-tree-field="access">
            ${opt("all", "Every character", tree.access === "all")}
            ${opt("granted", "Only characters the GM grants it to", tree.access === "granted")}
          </select>
        </label>
        <label class="lst-field">Layout
          <select data-tree-field="layout">
            ${opt("grid", "Grid (rows and columns)", tree.layout === "grid")}
            ${opt("radial", "Radial web (sectors and rings)", tree.layout === "radial")}
          </select>
        </label>
        <label class="lst-field">Points per tier
          <input type="number" min="0" max="99" data-tree-field="tierPoints" value="${tree.tierPoints}">
        </label>
        <p class="lst-hint">${tree.layout === "radial"
          ? "0 = off. At 3, a sector's second ring needs 3 points spent in that sector's inner ring, its third ring 6, and so on."
          : "Borderlands-style gating. 0 = off. At 5, the second row needs 5 points spent in rows above it, the third row 10, and so on."}</p>
        ${tree.layout === "radial" ? `
          <div class="lst-grid2">
            <label class="lst-field">Sectors<input type="number" min="3" max="8" data-radial-field="sectors" value="${tree.radial.sectors}"></label>
            <label class="lst-field">Rings<input type="number" min="1" max="5" data-radial-field="rings" value="${tree.radial.rings}"></label>
          </div>
          <div class="lst-field">Sector names (clockwise from the top)
            <div class="lst-sector-names">${tree.radial.names.map((nm, i) => `<input type="text" data-sector-index="${i}" value="${esc(nm)}">`).join("")}</div>
          </div>` : `
          <div class="lst-grid2">
            <label class="lst-field">Columns<input type="number" min="1" max="40" data-tree-field="cols" value="${tree.cols}"></label>
            <label class="lst-field">Rows<input type="number" min="1" max="40" data-tree-field="rows" value="${tree.rows}"></label>
          </div>`}
      </div>`;
  }

  _nodeInspector(tree, node) {
    const others = Object.values(tree.nodes).filter((n) => n.id !== node.id).sort((a, b) => a.y - b.y || a.x - b.x);
    const prereqs = others.length
      ? others.map((n) => {
        const checked = node.requires.includes(n.id);
        const loop = !checked && wouldCreateCycle(tree, node.id, n.id);
        return `<label class="lst-check${loop ? " disabled" : ""}"${loop ? ' data-tooltip="Would create a loop"' : ""}><input type="checkbox" data-require-id="${n.id}" ${checked ? "checked" : ""} ${loop ? "disabled" : ""}> ${esc(n.name)}</label>`;
      }).join("")
      : `<p class="lst-hint">Add more skills to set prerequisites.</p>`;

    const skills = listCustomSkills();

    return `<div class="lst-section">
        <div class="lst-inspector-head">
          <button type="button" class="lst-btn small" data-action="lstDeselect"><i class="fa-solid fa-arrow-left"></i> Tree settings</button>
          <button type="button" class="lst-btn small danger" data-action="lstDeleteNode"><i class="fa-solid fa-trash"></i> Delete skill</button>
        </div>
        <label class="lst-field">Name<input type="text" data-node-field="name" value="${esc(node.name)}"></label>
        <div class="lst-img-row">
          <img src="${esc(node.img)}" data-action="lstPickNodeImage" data-tooltip="Pick an icon" alt="">
          <label class="lst-field">Icon<input type="text" data-node-field="img" value="${esc(node.img)}"></label>
        </div>
        ${this._iconPalette("node", node.img)}
        <label class="lst-field">Description<textarea data-node-field="description" rows="4" placeholder="What the skill does. Plain text or HTML; @UUID links work.">${esc(node.description)}</textarea></label>
        <div class="lst-grid3">
          <label class="lst-field">Cost / rank<input type="number" min="0" max="99" data-node-field="cost" value="${node.cost}"></label>
          <label class="lst-field">Max rank<input type="number" min="1" max="20" data-node-field="maxRank" value="${node.maxRank}"></label>
          <label class="lst-field">Min. LL<input type="number" min="0" max="99" data-node-field="minLevel" value="${node.minLevel}"></label>
        </div>
        ${this._locationHint(tree, node)}
      </div>

      <div class="lst-section">
        <h3><i class="fa-solid fa-link"></i> Prerequisites</h3>
        <label class="lst-field">Unlock when
          <select data-node-field="requireMode">
            ${opt("all", "All checked skills are unlocked", node.requireMode === "all")}
            ${opt("any", "Any one checked skill is unlocked", node.requireMode === "any")}
          </select>
        </label>
        <div class="lst-checklist">${prereqs}</div>
      </div>

      <div class="lst-section">
        <h3><i class="fa-solid fa-chart-simple"></i> Passive modifiers</h3>
        <p class="lst-hint">Applied as Active Effects. Mech, deployable and drone bonuses on a pilot are passed to their active mech and deployables by the LANCER system. Add values stack per rank; formulas can use @ll, @grit, @hull, @agi, @sys, @eng, @tier and @rank.</p>
        ${node.modifiers.map((m, i) => this._modifierRow(m, i)).join("")}
        <button type="button" class="lst-btn small" data-action="lstAddModifier"><i class="fa-solid fa-plus"></i> Add modifier</button>
      </div>

      <div class="lst-section">
        <h3><i class="fa-solid fa-code"></i> Custom effects</h3>
        <p class="lst-hint">${skills.length ? "Scripted effects for anything beyond stat changes." : "No custom effects are loaded yet. Add them in scripts/custom-skills.js or the Custom Skill Scripts window."}</p>
        ${node.custom.map((c, i) => this._customRow(c, i, skills)).join("")}
        <button type="button" class="lst-btn small" data-action="lstAddCustom" ${skills.length ? "" : "disabled"}><i class="fa-solid fa-plus"></i> Add custom effect</button>
      </div>

      <div class="lst-section">
        <h3><i class="fa-solid fa-terminal"></i> Macro</h3>
        <div class="lst-inline-row">
          <input type="text" data-node-field="macro" data-drop-uuid value="${esc(node.macro)}" placeholder="Drag a macro here">
          <button type="button" class="lst-icon-btn" data-action="lstOpenMacro" ${node.macro ? "" : "disabled"} data-tooltip="Open macro"><i class="fa-solid fa-up-right-from-square"></i></button>
        </div>
        <p class="lst-hint">Runs on the GM's client whenever this skill's rank changes, with <code>actor</code>, <code>node</code>, <code>tree</code>, <code>rank</code>, <code>previousRank</code> and <code>event</code> ("unlock", "rankUp", "rankDown", "remove").</p>
      </div>`;
  }

  _locationHint(tree, node) {
    if (tree.layout === "radial") {
      const { sector, ring } = radialSlot(tree, node);
      const need = tree.tierPoints > 0 ? ring * tree.tierPoints : 0;
      return `<p class="lst-hint"><i class="fa-solid fa-circle-nodes"></i> ${esc(sectorName(tree, sector))} sector, ring ${ring + 1}${need ? `: needs ${need} points in this sector's inner rings` : ""}.</p>`;
    }
    const need = tree.tierPoints > 0 ? node.y * tree.tierPoints : 0;
    return need ? `<p class="lst-hint"><i class="fa-solid fa-layer-group"></i> Row ${node.y + 1}: needs ${need} points spent in the rows above.</p>` : "";
  }

  _iconPalette(target, current, open = true) {
    const cells = ICONS.map((icon) => `<button type="button" class="lst-icon-cell${icon.path === current ? " active" : ""}" data-action="lstUseIcon" data-target="${target}" data-path="${esc(icon.path)}" data-tooltip="${esc(icon.label)}"><img src="${esc(icon.path)}" alt=""></button>`).join("");
    return `<details class="lst-icon-palette"${open ? " open" : ""}><summary>Built-in icons</summary><div class="lst-icon-grid">${cells}</div></details>`;
  }

  useIcon(target, path) {
    if (!path) return;
    if (target === "tree" && this.tree) this.tree.img = path;
    else if (this.node) this.node.img = path;
    else return;
    this.markDirty();
    this.render();
  }

  /** Follow the first modifier while the icon is still an auto-picked one. */
  _autoIconFrom(node, mod) {
    const auto = node.img === DEFAULT_NODE_IMG || ICONS.some((i) => i.path === node.img && node._autoIcon === i.path);
    if (!auto) return;
    const path = suggestIcon(mod.scope, mod.key);
    if (path) {
      node.img = path;
      node._autoIcon = path;
    }
  }

  _modifierRow(mod, i) {
    const stats = STATS[mod.scope] ?? [];
    const isPreset = stats.some((s) => s.key === mod.key);
    const numeric = NUMERIC_MODES.has(mod.mode);
    const invalid = numeric && evaluateFormula(mod.value, { ll: 1, level: 1, grit: 1, tier: 1, hull: 1, agi: 1, sys: 1, eng: 1, rank: 1 }) === null;
    return `<div class="lst-mod">
      <div class="lst-mod-line">
        <select data-mod-index="${i}" data-mod-field="scope">${Object.entries(SCOPES).map(([k, s]) => opt(k, s.label, k === mod.scope)).join("")}</select>
        <select data-mod-index="${i}" data-mod-field="stat">${stats.map((s) => opt(s.key, s.label, s.key === mod.key)).join("")}${opt(CUSTOM_KEY, "Custom data path…", !isPreset)}</select>
        <button type="button" class="lst-icon-btn" data-action="lstRemoveModifier" data-index="${i}" data-tooltip="Remove"><i class="fa-solid fa-trash"></i></button>
      </div>
      ${isPreset ? "" : `<input type="text" data-mod-index="${i}" data-mod-field="key" value="${esc(mod.key)}" placeholder="system.path.to.value">`}
      <div class="lst-mod-line">
        <select data-mod-index="${i}" data-mod-field="mode">${MODE_ORDER.map((m) => opt(m, MODE_INFO[m].label, m === mod.mode)).join("")}</select>
        <input type="text" class="${invalid ? "lst-invalid" : ""}" data-mod-index="${i}" data-mod-field="value" value="${esc(mod.value)}" placeholder="1 or floor(@ll/2)">
      </div>
    </div>`;
  }

  _customRow(inst, i, skills) {
    const skill = getCustomSkill(inst.skill);
    const choices = skills.map((s) => opt(s.id, s.name, s.id === inst.skill)).join("")
      + (inst.skill && !skill ? opt(inst.skill, `(not loaded) ${inst.skill}`, true) : "")
      + (!inst.skill ? opt("", "— choose —", true) : "");
    const fields = skill ? Object.entries(skill.options ?? {}).map(([k, def]) => this._optionField(i, k, def, inst.options?.[k])).join("") : "";
    return `<div class="lst-custom">
      <div class="lst-mod-line">
        <select data-custom-index="${i}" data-custom-field="skill">${choices}</select>
        <button type="button" class="lst-icon-btn" data-action="lstRemoveCustom" data-index="${i}" data-tooltip="Remove"><i class="fa-solid fa-trash"></i></button>
      </div>
      ${skill?.description ? `<p class="lst-hint">${esc(skill.description)}</p>` : ""}
      ${!skill && inst.skill ? `<p class="lst-hint lst-warn">This custom effect's script isn't loaded, so it won't do anything.</p>` : ""}
      ${fields}
    </div>`;
  }

  _optionField(i, key, def = {}, value) {
    const v = value ?? def.default ?? "";
    const label = esc(def.label ?? key);
    const type = def.type ?? "text";
    const attrs = `data-custom-index="${i}" data-option-key="${esc(key)}" data-option-type="${esc(type)}"`;
    const hint = def.hint ? `<span class="lst-hint">${esc(def.hint)}</span>` : "";
    switch (type) {
      case "number":
        return `<label class="lst-field">${label}<input type="number" ${attrs} value="${esc(v)}">${hint}</label>`;
      case "boolean":
        return `<label class="lst-check"><input type="checkbox" ${attrs} ${v ? "checked" : ""}> ${label}</label>${hint}`;
      case "select":
        return `<label class="lst-field">${label}<select ${attrs}>${Object.entries(optionChoices(def)).map(([cv, cl]) => opt(cv, cl, String(cv) === String(v))).join("")}</select>${hint}</label>`;
      case "uuid":
        return `<label class="lst-field">${label}<input type="text" ${attrs} data-drop-uuid value="${esc(v)}" placeholder="Drag a document here">${hint}</label>`;
      default:
        return `<label class="lst-field">${label}<input type="text" ${attrs} value="${esc(v)}">${hint}</label>`;
    }
  }

  /** Hover card for one skill, from the GM's point of view. */
  _tooltip(treeId, nodeId) {
    const tree = this.trees[treeId];
    const node = tree?.nodes?.[nodeId];
    if (!node) return null;
    const reqs = node.requires.map((id) => tree.nodes[id]?.name).filter(Boolean);
    const where = plainExcerpt(this._locationHint(tree, node), 120);
    const lines = [
      reqs.length ? `Requires ${node.requireMode === "any" && reqs.length > 1 ? "one of " : ""}${esc(reqs.join(", "))}` : "",
      node.minLevel > 0 ? `License Level ${node.minLevel}+` : "",
      where ? esc(where) : "",
      node.macro ? "Runs a macro" : ""
    ].filter(Boolean);
    return {
      theme: tree.style.theme,
      html: skillTooltipHTML({
        tree, node, rank: 1,
        sub: `${plural(node.cost, "pt")}${node.maxRank > 1 ? ` per rank · max rank ${node.maxRank}` : ""}`,
        status: lines.join("<br>"),
        statusCls: "info",
        vars: { ll: 1, level: 1, grit: 1, tier: 1, hull: 0, agi: 0, sys: 0, eng: 0 },
        footer: "Click to edit · Shift-click to link · Drag to move"
      })
    };
  }

  _replaceHTML(result, content) {
    content.innerHTML = result;
  }

  async _preRender(context, options) {
    await super._preRender?.(context, options);
    hideSkillTooltip();
    const wrap = this.element?.querySelector(".lst-canvas-wrap");
    const panel = this.element?.querySelector(".lst-panel");
    this._scroll = { wl: wrap?.scrollLeft ?? 0, wt: wrap?.scrollTop ?? 0, pt: panel?.scrollTop ?? 0 };
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    const root = this.element.querySelector(".lst-editor");
    if (!root) return;
    root.addEventListener("change", (ev) => this._onChange(ev));
    root.addEventListener("input", (ev) => {
      if (ev.target.dataset?.treeStyle === "bgOpacity") {
        const label = root.querySelector("[data-role=bg-opacity]");
        if (label) label.textContent = `${ev.target.value}%`;
      }
    });
    root.querySelectorAll("[data-drop-uuid]").forEach((el) => {
      el.addEventListener("dragover", (ev) => ev.preventDefault());
      el.addEventListener("drop", (ev) => this._onDropUuid(ev, el));
    });
    const wrap = root.querySelector(".lst-canvas-wrap");
    if (wrap) {
      bindSkillTooltips(wrap, (t, n) => this._tooltip(t, n));
      wrap.addEventListener("dragstart", (ev) => {
        const nodeEl = ev.target.closest?.(".lst-node, .lst-rnode");
        if (!nodeEl) return;
        ev.dataTransfer.setData("text/plain", JSON.stringify({ lstNodeId: nodeEl.dataset.nodeId }));
        ev.dataTransfer.effectAllowed = "move";
      });
      wrap.addEventListener("dragover", (ev) => ev.preventDefault());
      wrap.addEventListener("drop", (ev) => this._onCanvasDrop(ev));
      wrap.addEventListener("dblclick", (ev) => this._onCanvasDblClick(ev));
      if (this._scroll) {
        wrap.scrollLeft = this._scroll.wl;
        wrap.scrollTop = this._scroll.wt;
      }
    }
    const panel = root.querySelector(".lst-panel");
    if (panel && this._scroll) panel.scrollTop = this._scroll.pt;
  }

  refreshCanvas() {
    const wrap = this.element?.querySelector(".lst-canvas-wrap");
    if (!wrap || !this.tree) return;
    const { scrollLeft, scrollTop } = wrap;
    wrap.innerHTML = this._canvasHTML();
    wrap.scrollLeft = scrollLeft;
    wrap.scrollTop = scrollTop;
  }

  /* ---------------------------------------------------------------- */
  /*  Saving                                                           */
  /* ---------------------------------------------------------------- */

  _statusText() {
    return { saved: "All changes saved", dirty: "Unsaved changes…", saving: "Saving…", error: "Save failed" }[this._status ?? "saved"];
  }

  _setStatus(status) {
    this._status = status;
    const el = this.element?.querySelector("[data-role=status]");
    if (el) {
      el.textContent = this._statusText();
      el.dataset.state = status;
    }
  }

  markDirty() {
    this._dirty = true;
    this._setStatus("dirty");
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this._save(), 700);
  }

  async _save() {
    clearTimeout(this._saveTimer);
    if (!this._dirty) return;
    this._dirty = false;
    this._setStatus("saving");
    try {
      await saveTrees(this.trees);
      this._setStatus(this._dirty ? "dirty" : "saved");
    } catch (err) {
      console.error(err);
      this._dirty = true;
      this._setStatus("error");
      ui.notifications.error("Skill Trees: saving failed. Press F12 for details.");
    }
  }

  async close(options) {
    hideSkillTooltip();
    if (this._dirty) await this._save();
    return super.close(options);
  }

  /* ---------------------------------------------------------------- */
  /*  Field edits                                                      */
  /* ---------------------------------------------------------------- */

  _onChange(event) {
    const el = event.target;
    if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement)) return;
    const ds = el.dataset;
    if (ds.role === "tree-select") {
      this.treeId = el.value || null;
      this.selectedId = null;
      this.render();
      return;
    }
    const tree = this.tree;
    if (!tree) return;
    const value = el.type === "checkbox" ? el.checked : el.value;
    let refresh;
    if (ds.treeField) refresh = this._setTreeField(tree, ds.treeField, value, el);
    else if (ds.treeStyle) refresh = this._setStyleField(tree, ds.treeStyle, value);
    else if (ds.radialField) refresh = this._setRadialField(tree, ds.radialField, value);
    else if (ds.sectorIndex !== undefined) {
      tree.radial.names[Number(ds.sectorIndex)] = String(value).trim() || DEFAULT_SECTOR_NAMES[Number(ds.sectorIndex)];
      refresh = "canvas";
    }
    else if (ds.nodeField && this.node) refresh = this._setNodeField(this.node, ds.nodeField, value);
    else if (ds.modIndex !== undefined && this.node) refresh = this._setModField(this.node, Number(ds.modIndex), ds.modField, value, el);
    else if (ds.customIndex !== undefined && this.node) refresh = this._setCustomField(this.node, Number(ds.customIndex), el, value);
    else if (ds.requireId && this.node) refresh = this._toggleRequire(this.node, ds.requireId, value, el);
    else return;
    if (refresh === "invalid") return;
    this.markDirty();
    if (refresh === "full") this.render();
    else if (refresh === "canvas") this.refreshCanvas();
  }

  _setTreeField(tree, field, value, el) {
    switch (field) {
      case "name": tree.name = String(value).trim() || "Untitled Tree"; return "full";
      case "description": tree.description = String(value); return "none";
      case "img": tree.img = String(value).trim() || DEFAULT_TREE_IMG; return "full";
      case "access": tree.access = value === "granted" ? "granted" : "all"; return "none";
      case "tierPoints": tree.tierPoints = toInt(value, tree.tierPoints, 0, 99); return "full";
      case "layout": {
        tree.layout = value === "radial" ? "radial" : "grid";
        if (tree.layout === "radial") {
          for (const n of Object.values(tree.nodes)) n.pos ??= autoPos(tree, n);
          if (tree.style.theme === "lancer") {
            Object.assign(tree.style, { theme: THEME_HEXWEB }, themeDefaults(THEME_HEXWEB));
            ui.notifications.info("Skill Trees: switched this tree to the Hex Web theme. Change it under Style.");
          }
        }
        return "full";
      }
      case "cols":
      case "rows": {
        const axis = field === "cols" ? "x" : "y";
        const min = Math.max(1, ...Object.values(tree.nodes).map((n) => n[axis] + 1));
        let v = toInt(value, tree[field], 1, 40);
        if (v < min) {
          ui.notifications.warn(`Skill Trees: move skills out of the last ${field === "cols" ? "column" : "row"} before shrinking the grid.`);
          v = min;
          el.value = v;
        }
        tree[field] = v;
        return "canvas";
      }
    }
    return "invalid";
  }

  _setStyleField(tree, field, value) {
    const s = tree.style;
    switch (field) {
      case "theme":
        if (THEMES[value]) Object.assign(s, { theme: value }, themeDefaults(value));
        return "full";
      case "accent":
      case "secondary":
        if (/^#[0-9a-f]{6}$/i.test(value)) s[field] = value;
        return "canvas";
      case "nodeShape": if (NODE_SHAPES[value]) s.nodeShape = value; return "canvas";
      case "linkStyle": if (LINK_STYLES[value]) s.linkStyle = value; return "canvas";
      case "spacing": if (ROW_SPACING[value]) s.spacing = value; return "canvas";
      case "banner": s.banner = !!value; return "canvas";
      case "tierBar": s.tierBar = !!value; return "canvas";
      case "background": s.background = String(value).trim(); return "canvas";
      case "bgOpacity": s.bgOpacity = toInt(value, s.bgOpacity, 0, 100); return "canvas";
    }
    return "invalid";
  }

  _setRadialField(tree, field, value) {
    const r = tree.radial;
    if (field === "sectors") {
      r.sectors = toInt(value, r.sectors, 3, 8);
      while (r.names.length < r.sectors) r.names.push(DEFAULT_SECTOR_NAMES[r.names.length] ?? `Sector ${r.names.length + 1}`);
      r.names.length = r.sectors;
      return "full";
    }
    if (field === "rings") {
      r.rings = toInt(value, r.rings, 1, 5);
      return "full";
    }
    return "invalid";
  }

  setStyle(field, value) {
    if (!this.tree) return;
    this._setStyleField(this.tree, field, value);
    this.markDirty();
    this.render();
  }

  applyThemeDefaults() {
    const s = this.tree?.style;
    if (!s) return;
    Object.assign(s, themeDefaults(s.theme));
    this.markDirty();
    this.render();
  }

  _setNodeField(node, field, value) {
    switch (field) {
      case "name": node.name = String(value).trim() || "Unnamed Skill"; return "canvas";
      case "img": node.img = String(value).trim() || DEFAULT_NODE_IMG; return "full";
      case "description": node.description = String(value); return "none";
      case "cost": node.cost = toInt(value, node.cost, 0, 99); return "canvas";
      case "maxRank": node.maxRank = toInt(value, node.maxRank, 1, 20); return "canvas";
      case "minLevel": node.minLevel = toInt(value, node.minLevel, 0, 99); return "none";
      case "requireMode": node.requireMode = value === "any" ? "any" : "all"; return "canvas";
      case "macro": node.macro = String(value).trim(); return "full";
    }
    return "invalid";
  }

  _setModField(node, index, field, value, el) {
    const mod = node.modifiers[index];
    if (!mod) return "invalid";
    switch (field) {
      case "scope": {
        const wasPreset = (STATS[mod.scope] ?? []).some((s) => s.key === mod.key);
        mod.scope = SCOPES[value] ? value : "mech";
        const stats = STATS[mod.scope] ?? [];
        if (wasPreset && !stats.some((s) => s.key === mod.key)) mod.key = stats[0]?.key ?? "";
        if (index === 0) this._autoIconFrom(node, mod);
        return "full";
      }
      case "stat": {
        if (value === CUSTOM_KEY) {
          mod.key = "";
          return "full";
        }
        const oldPreset = (STATS[mod.scope] ?? []).find((s) => s.key === mod.key);
        const preset = (STATS[mod.scope] ?? []).find((s) => s.key === value);
        mod.key = value;
        if (preset?.mode !== undefined) {
          mod.mode = preset.mode;
          mod.value = preset.value ?? mod.value;
        } else if (oldPreset?.mode !== undefined) {
          mod.mode = AE_MODES.ADD;
          mod.value = "1";
        }
        if (index === 0) this._autoIconFrom(node, mod);
        return "full";
      }
      case "key": mod.key = String(value).trim(); return "none";
      case "mode": mod.mode = Number(value); return "full";
      case "value": {
        mod.value = String(value).trim();
        const numeric = NUMERIC_MODES.has(mod.mode);
        const ok = !numeric || evaluateFormula(mod.value, { ll: 1, level: 1, grit: 1, tier: 1, hull: 1, agi: 1, sys: 1, eng: 1, rank: 1 }) !== null;
        el.classList.toggle("lst-invalid", !ok);
        if (!ok) ui.notifications.warn(`Skill Trees: “${mod.value}” isn't a valid number or formula.`);
        return "none";
      }
    }
    return "invalid";
  }

  _setCustomField(node, index, el, value) {
    const inst = node.custom[index];
    if (!inst) return "invalid";
    if (el.dataset.customField === "skill") {
      inst.skill = String(value);
      inst.options = skillOptionDefaults(getCustomSkill(inst.skill));
      return "full";
    }
    const key = el.dataset.optionKey;
    if (!key) return "invalid";
    const type = el.dataset.optionType;
    inst.options[key] = type === "number" ? Number(value) || 0 : type === "boolean" ? !!value : String(value);
    return "none";
  }

  _toggleRequire(node, reqId, checked, el) {
    if (checked) {
      if (wouldCreateCycle(this.tree, node.id, reqId)) {
        ui.notifications.warn("Skill Trees: that would create a loop of prerequisites.");
        el.checked = false;
        return "invalid";
      }
      if (!node.requires.includes(reqId)) node.requires.push(reqId);
    } else {
      node.requires = node.requires.filter((r) => r !== reqId);
    }
    return "canvas";
  }

  _onDropUuid(event, el) {
    const data = getDropData(event);
    if (!data?.uuid) return;
    event.preventDefault();
    event.stopPropagation();
    el.value = data.uuid;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  /* ---------------------------------------------------------------- */
  /*  Canvas interaction                                               */
  /* ---------------------------------------------------------------- */

  /** Snapped radial position under the pointer, or null outside the web. */
  _radialPosFromEvent(event) {
    const canvas = this.element.querySelector(".lst-canvas");
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const cfg = radialConfig(this.tree);
    const p = fromXY(cfg, event.clientX - rect.left, event.clientY - rect.top);
    if (p.r < CORE * 0.95 || p.r > 1.02) return null;
    return snapPos(cfg, p.a, Math.min(p.r, 0.999));
  }

  /** A node already sitting near a radial position. */
  _radialNodeNear(pos, exceptId = null) {
    const cfg = radialConfig(this.tree);
    const [x, y] = toXY(cfg, pos.a, pos.r);
    return Object.values(this.tree.nodes).find((n) => {
      if (n.id === exceptId) return false;
      const p = nodePos(this.tree, n);
      const [nx, ny] = toXY(cfg, p.a, p.r);
      return Math.hypot(nx - x, ny - y) < 22;
    }) ?? null;
  }

  _cellFromEvent(event) {
    const canvas = this.element.querySelector(".lst-canvas");
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((event.clientX - rect.left) / CELL_SIZE);
    const y = Math.floor((event.clientY - rect.top) / rowHeight(this.tree));
    if (x < 0 || y < 0 || x >= this.tree.cols || y >= this.tree.rows) return null;
    return { x, y };
  }

  _onCanvasDrop(event) {
    const data = getDropData(event);
    if (!data?.lstNodeId) return;
    event.preventDefault();
    const tree = this.tree;
    const node = tree?.nodes[data.lstNodeId];
    if (node && tree.layout === "radial") {
      const pos = this._radialPosFromEvent(event);
      if (!pos) return;
      const other = this._radialNodeNear(pos, node.id);
      if (other) other.pos = nodePos(tree, node);
      node.pos = pos;
      this.markDirty();
      if (this.node) this.render();
      else this.refreshCanvas();
      return;
    }
    const cell = node && this._cellFromEvent(event);
    if (!cell || (cell.x === node.x && cell.y === node.y)) return;
    const other = nodeAt(tree, cell.x, cell.y);
    if (other) {
      other.x = node.x;
      other.y = node.y;
    }
    node.x = cell.x;
    node.y = cell.y;
    this.markDirty();
    if (this.node) this.render();
    else this.refreshCanvas();
  }

  _onCanvasDblClick(event) {
    if (event.target.closest(".lst-node, .lst-rnode")) return;
    if (this.tree?.layout === "radial") {
      const pos = this._radialPosFromEvent(event);
      if (pos && !this._radialNodeNear(pos)) this.addNode(null, pos);
      return;
    }
    const cell = this._cellFromEvent(event);
    if (!cell || nodeAt(this.tree, cell.x, cell.y)) return;
    this.addNode(cell);
  }

  onNodeClick(event, nodeId) {
    const node = this.node;
    if (event.shiftKey && node && nodeId !== node.id) {
      if (node.requires.includes(nodeId)) node.requires = node.requires.filter((r) => r !== nodeId);
      else if (wouldCreateCycle(this.tree, node.id, nodeId)) return ui.notifications.warn("Skill Trees: that would create a loop of prerequisites.");
      else node.requires.push(nodeId);
      this.markDirty();
      return this.render();
    }
    this.selectedId = nodeId === this.selectedId ? null : nodeId;
    this.render();
  }

  /* ---------------------------------------------------------------- */
  /*  Commands                                                         */
  /* ---------------------------------------------------------------- */

  createTree() {
    const tree = normalizeTree({ name: "New Skill Tree", sort: Object.keys(this.trees).length });
    this.trees[tree.id] = tree;
    this.treeId = tree.id;
    this.selectedId = null;
    this.markDirty();
    this.render();
  }

  duplicateTree() {
    if (!this.tree) return;
    const copy = cloneTreeWithNewIds(this.tree);
    copy.name = `${this.tree.name} (Copy)`;
    this.trees[copy.id] = copy;
    this.treeId = copy.id;
    this.selectedId = null;
    this.markDirty();
    this.render();
  }

  async deleteTree() {
    const tree = this.tree;
    if (!tree) return;
    const ok = await confirmDialog("Delete skill tree",
      `<p>Delete <strong>${esc(tree.name)}</strong>? Characters lose the bonuses from it and get its points back.</p>`);
    if (!ok) return;
    delete this.trees[tree.id];
    this.treeId = sortedTrees(this.trees)[0]?.id ?? null;
    this.selectedId = null;
    this.markDirty();
    this.render();
  }

  async addExample() {
    const choice = await DialogV2.wait({
      window: { title: "Add an example tree" },
      content: "<p>Pick an example to add. Both are fully editable.</p>",
      buttons: [
        { action: "grid", label: "Tier tree (Borderlands-style)", icon: "fa-solid fa-layer-group", default: true },
        { action: "radial", label: "Hex web (radial)", icon: "fa-solid fa-circle-nodes" }
      ],
      rejectClose: false
    }).catch(() => null);
    if (choice !== "grid" && choice !== "radial") return;
    const tree = choice === "radial" ? exampleRadialTree() : exampleTree();
    this.trees[tree.id] = tree;
    this.treeId = tree.id;
    this.selectedId = null;
    this.markDirty();
    this.render();
  }

  addNode(cell = null, radialPos = null) {
    const tree = this.tree;
    if (!tree) return;
    const pos = cell ?? firstFreeCell(tree);
    if (pos.y >= tree.rows) tree.rows = pos.y + 1;
    let rpos = radialPos;
    if (!rpos && tree.layout === "radial") {
      for (const p of snapPoints(radialConfig(tree))) {
        if (!this._radialNodeNear(p)) {
          rpos = p;
          break;
        }
      }
    }
    const node = normalizeNode({ name: "New Skill", x: pos.x, y: pos.y, pos: rpos });
    tree.nodes[node.id] = node;
    this.selectedId = node.id;
    this.markDirty();
    this.render();
  }

  async deleteNode() {
    const tree = this.tree;
    const node = this.node;
    if (!node) return;
    const ok = await confirmDialog("Delete skill",
      `<p>Delete <strong>${esc(node.name)}</strong>? Characters who unlocked it get the points back.</p>`);
    if (!ok) return;
    delete tree.nodes[node.id];
    for (const n of Object.values(tree.nodes)) n.requires = n.requires.filter((r) => r !== node.id);
    this.selectedId = null;
    this.markDirty();
    this.render();
  }

  addModifier() {
    if (!this.node) return;
    this.node.modifiers.push(normalizeModifier({ scope: "mech", key: "system.hp.max", mode: AE_MODES.ADD, value: "1" }));
    if (this.node.modifiers.length === 1) this._autoIconFrom(this.node, this.node.modifiers[0]);
    this.markDirty();
    this.render();
  }

  addCustom() {
    if (!this.node) return;
    const skill = listCustomSkills()[0];
    this.node.custom.push(normalizeCustom({ skill: skill?.id ?? "", options: skillOptionDefaults(skill) }));
    this.markDirty();
    this.render();
  }

  removeAt(list, index) {
    if (!this.node?.[list]?.[index]) return;
    this.node[list].splice(index, 1);
    this.markDirty();
    this.render();
  }

  pickImage(target) {
    const tree = this.tree;
    if (!tree) return;
    const current = target === "node" ? this.node?.img : target === "tree" ? tree.img : tree.style.background;
    pickFile({
      type: "image",
      current,
      callback: (path) => {
        if (target === "node" && this.node) this.node.img = path;
        else if (target === "tree") tree.img = path;
        else tree.style.background = path;
        this.markDirty();
        this.render();
      }
    });
  }

  async openMacro() {
    const uuid = this.node?.macro;
    if (!uuid) return;
    const macro = await fromUuid(uuid).catch(() => null);
    if (macro?.sheet) macro.sheet.render(true);
    else ui.notifications.warn("Skill Trees: macro not found.");
  }

  exportTrees(all = false) {
    if (all) {
      const list = sortedTrees(this.trees);
      if (!list.length) return;
      return saveJSONFile({ module: "lancer-skill-trees", trees: list }, "lancer-skill-trees.json");
    }
    if (this.tree) saveJSONFile(this.tree, `${slugify(this.tree.name)}.json`);
  }

  async importTrees() {
    const text = await DialogV2.prompt({
      window: { title: "Import skill trees" },
      position: { width: 520 },
      content: `<p>Paste skill tree JSON, or choose a file exported from this module.</p>
        <textarea name="json" rows="10" style="width:100%;font-family:monospace"></textarea>
        <input type="file" name="file" accept=".json,application/json" style="margin-top:6px">`,
      ok: {
        label: "Import",
        icon: "fa-solid fa-file-import",
        callback: async (event, button) => {
          const form = button.form;
          const file = form.elements.file?.files?.[0];
          return file ? await file.text() : form.elements.json.value;
        }
      },
      rejectClose: false
    });
    if (!text?.trim()) return;
    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      return ui.notifications.error(`Skill Trees: that isn't valid JSON (${err.message}).`);
    }
    let list;
    if (Array.isArray(data)) list = data;
    else if (Array.isArray(data?.trees)) list = data.trees;
    else if (data?.nodes) list = [data];
    else list = Object.values(data ?? {}).filter((t) => t && typeof t === "object" && t.nodes);
    if (!list.length) return ui.notifications.warn("Skill Trees: no skill trees found in that JSON.");

    let imported = 0;
    for (const raw of list) {
      let tree = normalizeTree(raw);
      if (this.trees[tree.id]) {
        const replace = await confirmDialog("Tree already exists",
          `<p>A tree with this ID (<strong>${esc(this.trees[tree.id].name)}</strong>) already exists. Replace it? Choose “No” to import a separate copy.</p>`);
        if (!replace) tree = cloneTreeWithNewIds(tree);
      }
      this.trees[tree.id] = tree;
      this.treeId = tree.id;
      imported++;
    }
    this.selectedId = null;
    this.markDirty();
    this.render();
    ui.notifications.info(`Skill Trees: imported ${plural(imported, "tree")}.`);
  }
}
