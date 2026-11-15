import { MODULE_ID } from "../constants.js";
import {
  getTrees, sortedTrees, getRanks, actorLevel, actorPoints, treeAccessible, prereqStatus,
  canIncrease, canDecrease, formulaVars, isGranted, getBonusPoints, pointsInTree
} from "../data.js";
import { setRank, resetTree, setBonusPoints, setGranted } from "../progression.js";
import { getCustomSkill } from "../registry.js";
import { state } from "../state.js";
import { esc, setting, textToHTML, enrich, plural, confirmDialog } from "../util.js";
import { renderTreeBlock, describeModifier, bindSkillTooltips, hideSkillTooltip, skillTooltipHTML } from "./common.js";

const { ApplicationV2 } = foundry.applications.api;

/** Open viewers, keyed by actor uuid. */
export const VIEWERS = new Map();

export class SkillTreeViewer extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    classes: ["lst-app", "lst-viewer-app"],
    tag: "div",
    window: { title: "Skill Trees", icon: "fa-solid fa-diagram-project", resizable: true },
    position: { width: 1080, height: 760 },
    actions: {
      lstSelectTree(event, target) {
        this.treeId = target.dataset.treeId;
        this.selectedId = null;
        this.render();
      },
      lstSelectNode(event, target) {
        const { nodeId, treeId } = target.dataset;
        const same = this.selectedId === nodeId && this.treeId === treeId;
        if (treeId) this.treeId = treeId;
        this.selectedId = same ? null : nodeId;
        this.render();
      },
      lstClearSelection() {
        this.selectedId = null;
        this.render();
      },
      lstUnlock() { return this.changeRank(+1); },
      lstRefund() { return this.changeRank(-1); },
      async lstToggleGrant() {
        if (!this.treeId) return;
        await setGranted(this.actor, this.treeId, !isGranted(this.actor, this.treeId));
      },
      async lstResetTree() {
        const tree = getTrees()[this.treeId];
        if (!tree) return;
        const ok = await confirmDialog("Reset tree", `<p>Refund every skill ${esc(this.actor.name)} has in <strong>${esc(tree.name)}</strong>?</p>`);
        if (ok) await resetTree(this.actor, tree.id);
      },
      lstEditTree() { state.api?.openEditor(this.treeId); },
      lstToggleOverride() {
        this.gmOverride = !this.gmOverride;
        this.render();
      },
      async lstToggleLayout() {
        const next = this.layout === "columns" ? "tabs" : "columns";
        await game.settings.set(MODULE_ID, "viewerLayout", next);
        this.render();
      }
    }
  };

  constructor({ actor, ...options } = {}) {
    super({ id: `lst-viewer-${String(actor.uuid).replace(/[^a-zA-Z0-9_-]/g, "-")}`, ...options });
    this.actor = actor;
    this.treeId = null;
    this.selectedId = null;
    this.gmOverride = false;
    this._scroll = null;
  }

  get title() {
    return `Skill Trees — ${this.actor?.name ?? ""}`;
  }

  get layout() {
    return setting("viewerLayout") === "columns" ? "columns" : "tabs";
  }

  async changeRank(delta) {
    const tree = getTrees()[this.treeId];
    const node = tree?.nodes?.[this.selectedId];
    if (!node) return;
    const current = getRanks(this.actor)[tree.id]?.[node.id] ?? 0;
    await setRank(this.actor, tree.id, node.id, current + delta, { force: this.gmOverride });
  }

  /* ---------------------------------------------------------------- */

  async _prepareContext() {
    return {};
  }

  async _renderHTML() {
    const actor = this.actor;
    const trees = getTrees();
    const isGM = game.user.isGM;
    const visible = sortedTrees(trees).filter((t) => isGM || treeAccessible(t, actor));
    if (!visible.some((t) => t.id === this.treeId)) {
      this.treeId = visible[0]?.id ?? null;
      this.selectedId = null;
    }
    const tree = this.treeId ? trees[this.treeId] : null;
    if (tree && this.selectedId && !tree.nodes[this.selectedId]) this.selectedId = null;

    const ranks = getRanks(actor);
    const level = actorLevel(actor);
    const pts = actorPoints(actor, trees);
    const layout = this.layout;
    const header = this._headerHTML(actor, level, pts, isGM, visible.length > 1);

    if (!tree) {
      return `<div class="lst-viewer">${header}
        <div class="lst-empty">
          <i class="fa-solid fa-diagram-project"></i>
          <h2>No skill trees available</h2>
          <p>${isGM ? "Create one in the Skill Tree Editor." : "Your GM hasn't given this character any skill trees yet."}</p>
          ${isGM ? '<button type="button" class="lst-btn primary" data-action="lstEditTree"><i class="fa-solid fa-pen-ruler"></i> Open editor</button>' : ""}
        </div>
      </div>`;
    }

    const block = (t) => {
      const tr = ranks[t.id] ?? {};
      return renderTreeBlock(t, {
        mode: "view",
        uid: `${this.id}-${t.id}`,
        selectedId: t.id === this.treeId ? this.selectedId : null,
        spent: pointsInTree(t, tr),
        treeRanks: tr,
        centerValue: pointsInTree(t, tr),
        centerTotal: pts.total,
        forceBanner: layout === "columns",
        nodeState: (n) => this._nodeState(t, n, tr, level, pts),
        linkState: (r, n) => {
          const a = (tr[r.id] ?? 0) > 0;
          const b = (tr[n.id] ?? 0) > 0;
          return a && b ? "lit" : a ? "met" : "";
        }
      });
    };

    let tabs = "";
    let stage;
    if (layout === "columns") {
      stage = `<div class="lst-columns">${visible.map((t) => `<div class="lst-column${t.id === this.treeId ? " active" : ""}${!treeAccessible(t, actor) ? " not-granted" : ""}">${block(t)}</div>`).join("")}</div>`;
    } else {
      tabs = `<nav class="lst-tabs">${visible.map((t) => {
        const locked = !treeAccessible(t, actor);
        return `<button type="button" class="lst-tab${t.id === this.treeId ? " active" : ""}" data-action="lstSelectTree" data-tree-id="${t.id}" style="--lst-accent:${t.style.accent}">
          <img src="${esc(t.img)}" alt=""> ${esc(t.name)}${locked ? ' <i class="fa-solid fa-lock" data-tooltip="Not granted to this character"></i>' : ""}
        </button>`;
      }).join("")}</nav>`;
      stage = block(tree);
    }

    const panel = this.selectedId
      ? await this._nodePanel(tree, tree.nodes[this.selectedId], ranks[tree.id] ?? {}, level, pts)
      : await this._treePanel(tree, ranks[tree.id] ?? {}, isGM);

    return `<div class="lst-viewer lst-layout-${layout}" style="--lst-accent:${tree.style.accent};--lst-secondary:${tree.style.secondary}">
      ${header}${tabs}
      <div class="lst-body">
        <section class="lst-canvas-wrap">${stage}</section>
        <aside class="lst-panel lst-theme-${tree.style.theme}">${panel}</aside>
      </div>
    </div>`;
  }

  _nodeState(tree, n, treeRanks, level, pts) {
    const rank = Math.min(treeRanks[n.id] ?? 0, n.maxRank);
    const st = prereqStatus(tree, n, treeRanks, level);
    let cls;
    if (rank > 0) cls = rank >= n.maxRank ? "unlocked maxed" : "unlocked";
    else if (st.ok) cls = pts.available >= n.cost ? "available" : "available unaffordable";
    else cls = st.tierOk ? "locked" : "locked tierlocked";
    const badge = n.maxRank > 1 || tree.style.theme === "cel" ? `${rank}/${n.maxRank}` : rank > 0 ? "✓" : "";
    return { cls, badge };
  }

  _headerHTML(actor, level, pts, isGM, multipleTrees) {
    const typeLabel = { pilot: "Pilot", mech: "Mech", npc: "NPC", deployable: "Deployable" }[actor.type] ?? actor.type;
    const levelLabel = actor.type === "npc" ? `Tier ${level}` : `License Level ${level}`;
    const layoutBtn = multipleTrees
      ? `<button type="button" class="lst-btn" data-action="lstToggleLayout" data-tooltip="Switch between tabs and side-by-side columns">
          <i class="fa-solid ${this.layout === "columns" ? "fa-folder" : "fa-table-columns"}"></i> ${this.layout === "columns" ? "Tabs" : "Columns"}</button>`
      : "";
    const gm = isGM
      ? `<label class="lst-inline" data-tooltip="Extra skill points for this character (can be negative)">Bonus
          <input type="number" data-role="bonus" value="${getBonusPoints(actor)}" step="1"></label>
        <button type="button" class="lst-btn${this.gmOverride ? " warn" : ""}" data-action="lstToggleOverride" data-tooltip="GM override: unlock and refund while ignoring points and requirements">
          <i class="fa-solid ${this.gmOverride ? "fa-lock-open" : "fa-lock"}"></i> Override${this.gmOverride ? " on" : ""}</button>
        <button type="button" class="lst-btn" data-action="lstEditTree"><i class="fa-solid fa-pen-ruler"></i> Editor</button>`
      : "";
    return `<header class="lst-vhead">
      <img class="lst-portrait" src="${esc(actor.img)}" alt="">
      <div class="lst-who"><h2>${esc(actor.name)}</h2><span class="lst-muted">${esc(typeLabel)} · ${esc(levelLabel)}</span></div>
      <div class="lst-points${pts.available < 0 ? " negative" : ""}">
        <span class="lst-points-num">${pts.available}</span>
        <span class="lst-points-label">skill points<br><span class="lst-muted">${pts.spent} spent of ${pts.total}</span></span>
      </div>
      <div class="lst-head-tools">${layoutBtn}${gm}</div>
    </header>`;
  }

  async _treePanel(tree, treeRanks, isGM) {
    const nodes = Object.values(tree.nodes);
    const unlocked = nodes.filter((n) => (treeRanks[n.id] ?? 0) > 0).length;
    const desc = await enrich(textToHTML(tree.description), { relativeTo: this.actor });
    let tier = "";
    if (tree.tierPoints > 0 && tree.layout === "radial") {
      tier = `<p class="lst-hint"><i class="fa-solid fa-circle-nodes"></i> Each ring of a sector needs ${tree.tierPoints} more points spent in that sector's inner rings. <span class="lst-lock-key red">Red locks</span> need more points in the sector; <span class="lst-lock-key blue">blue locks</span> need a prerequisite.</p>`;
    } else if (tree.tierPoints > 0) {
      tier = `<p class="lst-hint"><i class="fa-solid fa-layer-group"></i> Each row needs ${tree.tierPoints} more points spent in the rows above it. Invested here: <strong>${pointsInTree(tree, treeRanks)}</strong>.</p>`;
    }
    let gm = "";
    if (isGM) {
      const granted = isGranted(this.actor, tree.id);
      const accessText = tree.access === "granted"
        ? granted ? "This character has been granted this tree." : "Players can't see this tree until you grant it."
        : "Every character can use this tree.";
      gm = `<div class="lst-section"><h3><i class="fa-solid fa-user-shield"></i> GM</h3>
        <p class="lst-hint">${accessText}</p>
        <div class="lst-btn-row">
          ${tree.access === "granted" ? `<button type="button" class="lst-btn" data-action="lstToggleGrant"><i class="fa-solid ${granted ? "fa-lock" : "fa-key"}"></i> ${granted ? "Revoke access" : "Grant access"}</button>` : ""}
          <button type="button" class="lst-btn danger" data-action="lstResetTree"><i class="fa-solid fa-rotate-left"></i> Reset progress</button>
        </div>
      </div>`;
    }
    return `<div class="lst-section">
        <div class="lst-title-row"><img src="${esc(tree.img)}" alt=""><div><h2>${esc(tree.name)}</h2><span class="lst-muted">${unlocked} / ${plural(nodes.length, "skill")} unlocked</span></div></div>
        ${desc ? `<div class="lst-desc">${desc}</div>` : ""}
        ${tier}
        <p class="lst-hint">Select a skill to see what it does.</p>
      </div>
      <div class="lst-section lst-legend">
        <span><i class="lst-swatch unlocked"></i> Unlocked</span>
        <span><i class="lst-swatch available"></i> Available</span>
        <span><i class="lst-swatch unaffordable"></i> Not enough points</span>
        <span><i class="lst-swatch locked"></i> Locked</span>
      </div>
      ${gm}`;
  }

  async _nodePanel(tree, node, treeRanks, level, pts) {
    const actor = this.actor;
    const isGM = game.user.isGM;
    const rank = Math.min(treeRanks[node.id] ?? 0, node.maxRank);
    const st = prereqStatus(tree, node, treeRanks, level);
    const vars = formulaVars(actor);

    let status;
    if (rank >= node.maxRank) status = `<span class="lst-pill unlocked">${node.maxRank > 1 ? "Max rank" : "Unlocked"}</span>`;
    else if (rank > 0) status = `<span class="lst-pill unlocked">Rank ${rank} of ${node.maxRank}</span>`;
    else if (st.ok) status = `<span class="lst-pill available">Available</span>`;
    else status = `<span class="lst-pill locked">Locked</span>`;

    const pips = node.maxRank > 1
      ? `<span class="lst-pips">${Array.from({ length: node.maxRank }, (_, i) => `<i class="${i < rank ? "on" : ""}"></i>`).join("")}</span>`
      : "";

    const reqs = [];
    for (const r of st.list) reqs.push(`<li class="${r.met ? "met" : "unmet"}"><i class="fa-solid ${r.met ? "fa-check" : "fa-xmark"}"></i> ${esc(r.name)}</li>`);
    if (node.minLevel > 0) reqs.push(`<li class="${st.levelOk ? "met" : "unmet"}"><i class="fa-solid ${st.levelOk ? "fa-check" : "fa-xmark"}"></i> License Level ${node.minLevel}</li>`);
    if (st.tier.need > 0) reqs.push(`<li class="${st.tierOk ? "met" : "unmet"}"><i class="fa-solid ${st.tierOk ? "fa-check" : "fa-xmark"}"></i> ${st.tier.need} points in ${esc(st.tier.where)} (${st.tier.have})</li>`);
    const reqTitle = node.requireMode === "any" && st.list.length > 1 ? "Requires (any one skill)" : "Requires";

    const effects = [
      ...node.modifiers.map((m) => `<li>${describeModifier(m, node, rank, vars)}</li>`),
      ...node.custom.map((inst) => {
        const skill = getCustomSkill(inst.skill);
        return `<li><span class="lst-scope-tag lst-scope-custom">Special</span> <strong>${esc(skill?.name ?? inst.skill)}</strong>${skill?.description ? ` — ${esc(skill.description)}` : ""}${skill ? "" : ' <em class="lst-warn">(script not loaded)</em>'}</li>`;
      })
    ];

    const desc = await enrich(textToHTML(node.description), { relativeTo: actor, secrets: actor.isOwner });

    // Actions
    const buttons = [];
    let reason = "";
    if (actor.isOwner) {
      const unlockAllowed = isGM || setting("playersCanUnlock");
      const refundAllowed = isGM || setting("playersCanRefund");
      const override = isGM && this.gmOverride;
      if (rank < node.maxRank) {
        if (unlockAllowed) {
          const check = canIncrease({ tree, node, treeRanks, level, available: pts.available });
          const label = rank === 0 ? `Unlock · ${plural(node.cost, "pt")}` : `Upgrade to rank ${rank + 1} · ${plural(node.cost, "pt")}`;
          buttons.push(`<button type="button" class="lst-btn primary big" data-action="lstUnlock" ${check.ok || override ? "" : "disabled"}><i class="fa-solid fa-arrow-up"></i> ${label}</button>`);
          if (!check.ok) reason = override ? `${check.reason} (GM override is on.)` : check.reason;
        } else {
          reason = "Your GM unlocks skills in this game.";
        }
      }
      if (rank > 0 && refundAllowed) {
        const check = canDecrease({ tree, node, treeRanks });
        buttons.push(`<button type="button" class="lst-btn big" data-action="lstRefund" ${check.ok || override ? "" : "disabled"} ${check.ok ? "" : `data-tooltip="${esc(check.reason)}"`}><i class="fa-solid fa-arrow-down"></i> Refund${node.maxRank > 1 ? " 1 rank" : ""}</button>`);
      }
    }

    return `<div class="lst-section">
        <button type="button" class="lst-btn small" data-action="lstClearSelection"><i class="fa-solid fa-arrow-left"></i> ${esc(tree.name)}</button>
        <div class="lst-title-row node">
          <img src="${esc(node.img)}" alt="">
          <div><h2>${esc(node.name)}</h2>${status} ${pips}</div>
        </div>
        <p class="lst-muted">Cost: ${plural(node.cost, "point")}${node.maxRank > 1 ? " per rank" : ""}</p>
        ${desc ? `<div class="lst-desc">${desc}</div>` : ""}
      </div>
      ${effects.length ? `<div class="lst-section"><h3>Effects${rank > 1 ? ` at rank ${rank}` : ""}</h3><ul class="lst-effects">${effects.join("")}</ul></div>` : ""}
      ${reqs.length ? `<div class="lst-section"><h3>${reqTitle}</h3><ul class="lst-reqs">${reqs.join("")}</ul></div>` : ""}
      ${buttons.length || reason ? `<div class="lst-section lst-actions">${buttons.join("")}${reason ? `<p class="lst-hint lst-reason">${esc(reason)}</p>` : ""}</div>` : ""}`;
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

  /** Hover card for one skill, from this character's point of view. */
  _tooltip(treeId, nodeId) {
    const trees = getTrees();
    const tree = trees[treeId];
    const node = tree?.nodes?.[nodeId];
    if (!node) return null;
    const actor = this.actor;
    const treeRanks = getRanks(actor)[treeId] ?? {};
    const rank = Math.min(treeRanks[nodeId] ?? 0, node.maxRank);
    const level = actorLevel(actor);
    const pts = actorPoints(actor, trees);
    const cost = plural(node.cost, "pt");
    let status;
    let statusCls;
    if (rank >= node.maxRank) {
      status = node.maxRank > 1 ? "Max rank" : "Unlocked";
      statusCls = "unlocked";
    } else {
      const check = canIncrease({ tree, node, treeRanks, level, available: pts.available });
      if (check.ok) {
        status = rank > 0 ? `Rank ${rank} of ${node.maxRank} · next rank ${cost}` : `Available · ${cost}`;
        statusCls = rank > 0 ? "unlocked" : "available";
      } else {
        const prefix = rank > 0 ? `Rank ${rank} of ${node.maxRank} · ` : "";
        status = `${prefix}${esc(check.reason)}`;
        statusCls = /skill points/.test(check.reason) ? "unaffordable" : rank > 0 ? "unlocked" : "locked";
      }
    }
    const sub = `${esc(tree.name)} · ${cost}${node.maxRank > 1 ? " per rank" : ""}`;
    return {
      theme: tree.style.theme,
      html: skillTooltipHTML({ tree, node, rank, sub, status, statusCls, vars: formulaVars(actor), footer: "Click for details" })
    };
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    const root = this.element.querySelector(".lst-viewer");
    if (!root) return;
    bindSkillTooltips(root.querySelector(".lst-canvas-wrap"), (t, n) => this._tooltip(t, n));
    root.querySelector("[data-role=bonus]")?.addEventListener("change", (ev) => setBonusPoints(this.actor, ev.target.value));
    const wrap = root.querySelector(".lst-canvas-wrap");
    if (wrap && this._scroll) {
      wrap.scrollLeft = this._scroll.wl;
      wrap.scrollTop = this._scroll.wt;
    }
    const panel = root.querySelector(".lst-panel");
    if (panel && this._scroll) panel.scrollTop = this._scroll.pt;
  }

  _onClose(options) {
    hideSkillTooltip();
    VIEWERS.delete(this.actor?.uuid);
    return super._onClose?.(options);
  }
}
