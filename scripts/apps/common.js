import { CELL_SIZE, NODE_SIZE, NODE_TOP, SCOPES, MODE_INFO, AE_MODES, statLabel } from "../constants.js";
import { resolveModifierValue, isFormula } from "../effects.js";
import { rowHeight } from "../data.js";
import { renderRadialBlock } from "./radial.js";
import { getCustomSkill } from "../registry.js";
import { esc, cssUrl } from "../util.js";

export const opt = (value, label, selected = false) =>
  `<option value="${esc(value)}"${selected ? " selected" : ""}>${esc(label)}</option>`;

export function nodeCenter(node, rowH = CELL_SIZE) {
  return [node.x * CELL_SIZE + CELL_SIZE / 2, node.y * rowH + NODE_TOP + NODE_SIZE / 2];
}

const f = (n) => (Math.round(n * 10) / 10).toString();

/** SVG path data for one prerequisite link, plus whether it gets an arrowhead. */
function linkGeometry(linkStyle, from, to, rowH) {
  const [x1, y1] = nodeCenter(from, rowH);
  const [x2, y2] = nodeCenter(to, rowH);
  const half = NODE_SIZE / 2;
  if (to.y > from.y && (linkStyle === "elbow" || linkStyle === "curved")) {
    const sy = y1 + half + 4;
    if (linkStyle === "elbow") {
      const ey = y2 - half - 2;
      // horizontal run sits in the gap above the child row, below the parent row's labels
      const my = to.y * rowH + NODE_TOP - Math.max(8, (rowH - CELL_SIZE) / 2 + 8);
      const d = x1 === x2 ? `M${f(x1)},${f(sy)} V${f(ey)}` : `M${f(x1)},${f(sy)} V${f(my)} H${f(x2)} V${f(ey)}`;
      return { d, arrow: false };
    }
    const ey = y2 - half - 8;
    const my = (sy + ey) / 2;
    return { d: `M${f(x1)},${f(sy)} C${f(x1)},${f(my)} ${f(x2)},${f(my)} ${f(x2)},${f(ey)}`, arrow: true };
  }
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  const pad = half + 6;
  if (len <= pad * 2 + 4) return null;
  const ux = dx / len;
  const uy = dy / len;
  return {
    d: `M${f(x1 + ux * pad)},${f(y1 + uy * pad)} L${f(x2 - ux * (pad + 4))},${f(y2 - uy * (pad + 4))}`,
    arrow: true
  };
}

/**
 * Render one tree: optional banner, a stage with optional background image and tier bar,
 * then the node canvas. Styling comes from tree.style.
 * @param {object} tree
 * @param {object} opts
 *   mode: "view" | "edit"; uid: unique id prefix for SVG markers;
 *   nodeState(node) → { cls, badge }; linkState(from, to) → "" | "met" | "lit" | "hl";
 *   spent: points spent in this tree (view mode); forceBanner: always show the banner.
 */
export function renderTreeBlock(tree, opts = {}) {
  const { mode = "view", uid = "lst", nodeState = () => ({}), linkState = () => "", spent = null, forceBanner = false, selectedId = null } = opts;
  const style = tree.style;
  const showBanner = style.banner || forceBanner;
  const banner = showBanner ? `<div class="lst-banner">
      <img src="${esc(tree.img)}" alt="">
      <span class="lst-banner-name">${esc(tree.name)}</span>
      ${spent !== null ? `<span class="lst-banner-pts" data-tooltip="Points invested in this tree">${spent}</span>` : ""}
    </div>` : "";
  if (tree.layout === "radial") return renderRadialBlock(tree, { ...opts, bannerHTML: banner });
  const safeUid = String(uid).replace(/[^a-zA-Z0-9_-]/g, "-");
  const w = tree.cols * CELL_SIZE;
  const rowH = rowHeight(tree);
  const h = tree.rows * rowH;
  const nodes = Object.values(tree.nodes);

  const states = ["base", "met", "lit", "hl"];
  const markers = states.map((s) =>
    `<marker id="${safeUid}-arrow-${s}" class="lst-arrow ${s}" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z"/></marker>`
  ).join("");

  let under = "";
  let over = "";
  const linkStyle = style.linkStyle === "none" && mode === "edit" ? "straight" : style.linkStyle;
  if (linkStyle !== "none") {
    for (const n of nodes) {
      for (const rid of n.requires) {
        const r = tree.nodes[rid];
        if (!r) continue;
        const geo = linkGeometry(linkStyle, r, n, rowH);
        if (!geo) continue;
        const st = linkState(r, n) || "base";
        const cls = `lst-link ${st}${n.requireMode === "any" ? " any" : ""}${style.linkStyle === "none" ? " ghost" : ""}`;
        under += `<path class="lst-link-under" d="${geo.d}"/>`;
        over += `<path class="${cls}" d="${geo.d}"${geo.arrow ? ` marker-end="url(#${safeUid}-arrow-${st})"` : ""}/>`;
      }
    }
  }

  const nodeHTML = nodes.map((n) => {
    const st = nodeState(n) ?? {};
    const left = n.x * CELL_SIZE + (CELL_SIZE - NODE_SIZE) / 2;
    const top = n.y * rowH + NODE_TOP;
    return `<div class="lst-node ${st.cls ?? ""}${n.id === selectedId ? " selected" : ""}" data-action="lstSelectNode" data-node-id="${n.id}" data-tree-id="${tree.id}"${mode === "edit" ? ' draggable="true"' : ""} aria-label="${esc(n.name)}" style="left:${left}px;top:${top}px">
      <div class="lst-node-frame"><div class="lst-node-inner"><img src="${esc(n.img)}" alt="" draggable="false"></div></div>
      ${st.badge ? `<span class="lst-badge">${esc(st.badge)}</span>` : ""}
      ${st.marks ? `<span class="lst-marks">${st.marks}</span>` : ""}
      <span class="lst-node-label"><span>${esc(n.name)}</span></span>
    </div>`;
  }).join("");

  let tierBar = "";
  if (style.tierBar && tree.tierPoints > 0) {
    const ticks = [];
    for (let y = 1; y < tree.rows; y++) {
      ticks.push(`<span class="lst-tier-tick" style="top:${y * rowH}px"><b>${y * tree.tierPoints}</b></span>`);
    }
    const fillRows = spent === null ? 0 : Math.min(tree.rows, 1 + spent / tree.tierPoints);
    tierBar = `<div class="lst-tierbar" style="height:${h}px" data-tooltip="Points needed in this tree to open each row">
      <div class="lst-tierbar-fill" style="height:${f(fillRows * rowH)}px"></div>${ticks.join("")}
    </div>`;
  }

  let stageStyle = "";
  if (style.background) {
    const dim = (1 - style.bgOpacity / 100).toFixed(2);
    stageStyle = ` style="background-image:linear-gradient(rgba(0,0,0,${dim}),rgba(0,0,0,${dim})),${esc(cssUrl(style.background))}"`;
  }

  return `<div class="lst-tree-block lst-theme-${style.theme} lst-shape-${style.nodeShape} lst-links-${style.linkStyle}" data-tree-id="${tree.id}" style="--lst-accent:${style.accent};--lst-secondary:${style.secondary}">
    ${banner}
    <div class="lst-stage${style.background ? " has-image" : ""}"${stageStyle}>
      ${tierBar}
      <div class="lst-canvas ${mode}" style="width:${w}px;height:${h}px;--lst-row-h:${rowH}px">
        <svg class="lst-links" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg"><defs>${markers}</defs>${under}${over}</svg>
        ${nodeHTML}
      </div>
    </div>
  </div>`;
}

/* ------------------------------------------------------------------ */

const fmt = (v) => (typeof v === "number" ? (Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100)) : String(v));
const signed = (v) => `${v >= 0 ? "+" : "−"}${fmt(Math.abs(v))}`;

/** Human-readable line for a passive modifier, e.g. "Mech Evasion +2 (+1 per rank)". */
export function describeModifier(mod, node, rank, vars) {
  const scope = SCOPES[mod.scope]?.short ?? mod.scope;
  const stat = statLabel(mod.scope, mod.key);
  const value = resolveModifierValue(mod, Math.max(1, rank), vars);
  let effect;
  if (value === null) effect = `<em>invalid value “${esc(mod.value)}”</em>`;
  else {
    switch (mod.mode) {
      case AE_MODES.ADD: effect = signed(value); break;
      case AE_MODES.MULTIPLY: effect = `×${fmt(value)}`; break;
      case AE_MODES.OVERRIDE: effect = `= ${esc(fmt(value))}`; break;
      case AE_MODES.UPGRADE: effect = `at least ${fmt(value)}`; break;
      case AE_MODES.DOWNGRADE: effect = `at most ${fmt(value)}`; break;
      default: effect = `${esc(MODE_INFO[mod.mode]?.label ?? `mode ${mod.mode}`)}: ${esc(fmt(value))}`;
    }
  }
  const notes = [];
  if (mod.mode === AE_MODES.ADD && node.maxRank > 1 && !/[@{]rank/i.test(mod.value)) {
    const per = resolveModifierValue(mod, 1, vars);
    if (per !== null) notes.push(`${signed(per)} per rank`);
  }
  if (isFormula(mod.value) && mod.mode !== AE_MODES.SET_JSON && mod.mode !== AE_MODES.APPEND_JSON) notes.push(esc(mod.value));
  return `<span class="lst-scope-tag lst-scope-${mod.scope}">${esc(scope)}</span> ${esc(stat)} <strong>${effect}</strong>${notes.length ? ` <span class="lst-muted">(${notes.join("; ")})</span>` : ""}`;
}

/* ------------------------------------------------------------------ */
/*  Skill hover cards                                                  */
/* ------------------------------------------------------------------ */

/** Description as a short plain-text excerpt (HTML and @UUID links flattened). */
export function plainExcerpt(text, max = 180) {
  const flat = String(text ?? "")
    .replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1")
    .replace(/@\w+\[([^\]]*)\]/g, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

/** Inner HTML of a skill hover card. */
export function skillTooltipHTML({ tree, node, rank = 0, sub = "", status = "", statusCls = "", vars = {}, footer = "" }) {
  const effects = [
    ...node.modifiers.map((m) => `<li>${describeModifier(m, node, rank, vars)}</li>`),
    ...node.custom.map((inst) => {
      const skill = getCustomSkill(inst.skill);
      return `<li><span class="lst-scope-tag lst-scope-custom">Special</span> ${esc(skill?.name ?? inst.skill)}${skill?.description ? ` <span class="lst-muted">— ${esc(plainExcerpt(skill.description, 90))}</span>` : ""}</li>`;
    })
  ];
  const pips = node.maxRank > 1
    ? `<span class="lst-pips">${Array.from({ length: node.maxRank }, (_, i) => `<i class="${i < rank ? "on" : ""}"></i>`).join("")}</span>`
    : "";
  const desc = plainExcerpt(node.description);
  return `<div class="lst-tip-head">
      <img src="${esc(node.img)}" alt="">
      <div><div class="lst-tip-name">${esc(node.name)}</div><div class="lst-tip-sub">${sub}${pips}</div></div>
    </div>
    ${status ? `<div class="lst-tip-status ${statusCls}">${status}</div>` : ""}
    ${effects.length ? `<ul class="lst-tip-effects">${effects.join("")}</ul>` : ""}
    ${desc ? `<p class="lst-tip-desc">${esc(desc)}</p>` : ""}
    ${footer ? `<div class="lst-tip-foot">${footer}</div>` : ""}`;
}

let TIP = null;

export function hideSkillTooltip() {
  TIP?.classList.remove("visible");
}

function showSkillTooltip(anchor, html, theme) {
  if (!TIP) {
    TIP = document.createElement("div");
    TIP.className = "lst-skill-tip";
    document.body.append(TIP);
  }
  TIP.innerHTML = html;
  TIP.className = `lst-skill-tip lst-tip-theme-${theme ?? "lancer"}`;
  const cs = getComputedStyle(anchor);
  TIP.style.setProperty("--lst-accent", cs.getPropertyValue("--lst-accent").trim() || "#c8102e");
  TIP.style.setProperty("--lst-secondary", cs.getPropertyValue("--lst-secondary").trim() || "#8fa3bf");
  TIP.style.left = "-9999px";
  TIP.style.top = "0px";
  const r = anchor.getBoundingClientRect();
  const w = TIP.offsetWidth;
  const h = TIP.offsetHeight;
  let left = r.right + 14;
  if (left + w > window.innerWidth - 8) left = r.left - w - 14;
  left = Math.max(8, left);
  const top = Math.min(window.innerHeight - h - 8, Math.max(8, r.top + r.height / 2 - h / 2));
  TIP.style.left = `${Math.round(left)}px`;
  TIP.style.top = `${Math.round(top)}px`;
  TIP.classList.add("visible");
}

/**
 * Show a hover card for any [data-node-id] skill inside `root`.
 * @param {HTMLElement} root
 * @param {(treeId: string, nodeId: string) => {html: string, theme: string} | null} build
 */
export function bindSkillTooltips(root, build) {
  if (!root) return;
  let current = null;
  root.addEventListener("mouseover", (ev) => {
    const el = ev.target.closest?.(".lst-node, .lst-rnode");
    if (!el || el === current || !root.contains(el)) return;
    current = el;
    const card = build(el.dataset.treeId, el.dataset.nodeId);
    if (card?.html) showSkillTooltip(el, card.html, card.theme);
  });
  root.addEventListener("mouseout", (ev) => {
    if (!current) return;
    if (ev.relatedTarget && current.contains(ev.relatedTarget)) return;
    current = null;
    hideSkillTooltip();
  });
  for (const type of ["pointerdown", "dragstart", "wheel", "scroll"]) {
    root.addEventListener(type, () => {
      current = null;
      hideSkillTooltip();
    }, { passive: true, capture: type === "scroll" });
  }
}
