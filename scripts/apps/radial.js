import { radialConfig, toXY, vertex, ringBounds, nodePos, radialSlot, sectorName, CORE, RNODE_SIZE } from "../radial.js";
import { sectorStats } from "../data.js";
import { esc } from "../util.js";

const f = (n) => (Math.round(n * 10) / 10).toString();
const pts = (list) => list.map(([x, y]) => `${f(x)},${f(y)}`).join(" ");

const LOCK = `<svg class="lst-lock" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 7.5V5.2a3.5 3.5 0 0 1 7 0v2.3" fill="none" stroke="currentColor" stroke-width="2"/><rect x="2.5" y="7" width="11" height="8" rx="1.6" fill="currentColor"/></svg>`;

/**
 * Render a tree in the "Radial web" layout.
 * opts: mode, uid, selectedId, nodeState(node), linkState(from, to), treeRanks (view),
 *       centerValue, centerTotal, centerLabel, bannerHTML
 */
export function renderRadialBlock(tree, opts = {}) {
  const {
    mode = "view", uid = "lst", selectedId = null, nodeState = () => ({}), linkState = () => "",
    treeRanks = null, centerValue = "", centerTotal = null, centerLabel = "", bannerHTML = ""
  } = opts;
  const style = tree.style;
  const cfg = radialConfig(tree);
  const { n, rings, step, R, A, size, cx, cy } = cfg;
  const safeUid = String(uid).replace(/[^a-zA-Z0-9_-]/g, "-");
  const nodes = Object.values(tree.nodes);
  const xy = new Map(nodes.map((nd) => [nd.id, toXY(cfg, nodePos(tree, nd).a, nodePos(tree, nd).r)]));

  // Sector bands
  const stats = Array.from({ length: n }, (_, s) => sectorStats(tree, treeRanks, s));
  let bands = "";
  for (let s = 0; s < n; s++) {
    const c = s * step;
    for (let k = 0; k < rings; k++) {
      const [h0, h1] = ringBounds(k, rings);
      const quad = [vertex(cfg, c - step / 2, h0 * R), vertex(cfg, c + step / 2, h0 * R), vertex(cfg, c + step / 2, h1 * R), vertex(cfg, c - step / 2, h1 * R)];
      let cls = "open";
      if (mode === "view") cls = k < stats[s].tier ? (stats[s].spent > 0 ? "open invested" : "open") : "locked";
      bands += `<polygon class="lst-band ${cls} ring-${k}" points="${pts(quad)}"/>`;
    }
  }
  const polygon = (h) => pts(Array.from({ length: n }, (_, i) => vertex(cfg, (i + 0.5) * step, h * R)));
  let rims = "";
  for (let k = 0; k <= rings; k++) rims += `<polygon class="lst-rim${k === rings ? " outer" : ""}" points="${polygon(ringBounds(0, rings)[0] + k * ((1 - CORE) / rings))}"/>`;
  let spokes = "";
  for (let i = 0; i < n; i++) {
    const [x1, y1] = vertex(cfg, (i + 0.5) * step, CORE * R);
    const [x2, y2] = vertex(cfg, (i + 0.5) * step, R);
    spokes += `<line class="lst-spoke" x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"/>`;
  }

  // Links
  let links = "";
  const half = RNODE_SIZE / 2 + 2;
  for (const nd of nodes) {
    for (const rid of nd.requires) {
      if (!tree.nodes[rid]) continue;
      const [x1, y1] = xy.get(rid);
      const [x2, y2] = xy.get(nd.id);
      const len = Math.hypot(x2 - x1, y2 - y1);
      if (len <= half * 2) continue;
      const ux = (x2 - x1) / len;
      const uy = (y2 - y1) / len;
      const st = linkState(tree.nodes[rid], nd) || "base";
      links += `<line class="lst-rlink ${st}${nd.requireMode === "any" ? " any" : ""}" x1="${f(x1 + ux * half)}" y1="${f(y1 + uy * half)}" x2="${f(x2 - ux * half)}" y2="${f(y2 - uy * half)}"/>`;
    }
  }

  // Nodes
  const nodeHTML = nodes.map((nd) => {
    const st = nodeState(nd) ?? {};
    const [x, y] = xy.get(nd.id);
    const locked = mode === "view" && /\blocked\b/.test(st.cls ?? "");
    return `<div class="lst-rnode ${st.cls ?? ""}${nd.id === selectedId ? " selected" : ""}" data-action="lstSelectNode" data-node-id="${nd.id}" data-tree-id="${tree.id}"${mode === "edit" ? ' draggable="true"' : ""} aria-label="${esc(nd.name)}" style="left:${f(x)}px;top:${f(y)}px">
      ${locked ? LOCK : `<img src="${esc(nd.img)}" alt="" draggable="false">`}
      ${st.badge && !locked ? `<span class="lst-rbadge">${esc(st.badge)}</span>` : ""}
    </div>`;
  }).join("");

  // Sector name plates
  const labels = Array.from({ length: n }, (_, s) => {
    const [lx, ly] = vertex(cfg, s * step, A + 50);
    let bar;
    if (mode === "edit") {
      const count = nodes.filter((nd) => radialSlot(tree, nd).sector === s).length;
      bar = `<span class="lst-sector-bar"><b>${count} ${count === 1 ? "skill" : "skills"}</b></span>`;
    } else {
      const label = tree.tierPoints > 0 ? `T${stats[s].tier}` : `${stats[s].spent} pts`;
      const pct = tree.tierPoints > 0 ? stats[s].progress * 100 : stats[s].spent > 0 ? 100 : 0;
      bar = `<span class="lst-sector-bar"><i style="width:${f(pct)}%"></i><b>${label}</b></span>`;
    }
    return `<div class="lst-sector-label${stats[s].spent > 0 && mode === "view" ? " invested" : ""}" style="left:${f(lx)}px;top:${f(ly)}px">
      <span class="lst-sector-name">${esc(sectorName(tree, s))}</span>${bar}
    </div>`;
  }).join("");

  const coreD = CORE * A * 1.7;
  const core = `<div class="lst-core" style="left:${f(cx)}px;top:${f(cy)}px;width:${f(coreD)}px;height:${f(coreD)}px">
    <span class="lst-core-num">${esc(centerValue)}</span>
    ${centerTotal !== null ? `<span class="lst-core-total">/${esc(centerTotal)}</span>` : ""}
    ${centerLabel ? `<span class="lst-core-label">${esc(centerLabel)}</span>` : ""}
  </div>`;

  const glowR = A * 0.8;
  const bg = style.background
    ? `<image href="${esc(style.background)}" x="${f(cx - R)}" y="${f(cy - R)}" width="${f(R * 2)}" height="${f(R * 2)}" preserveAspectRatio="xMidYMid slice" opacity="${(style.bgOpacity / 100).toFixed(2)}" clip-path="url(#${safeUid}-clip)"/>`
    : "";

  return `<div class="lst-tree-block lst-radial-block lst-theme-${style.theme} lst-links-${style.linkStyle}" data-tree-id="${tree.id}" style="--lst-accent:${style.accent};--lst-secondary:${style.secondary}">
    ${bannerHTML}
    <div class="lst-canvas lst-radial ${mode}" style="width:${size}px;height:${size}px">
      <svg class="lst-radial-svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="${safeUid}-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="${style.accent}" stop-opacity="0.75"/>
            <stop offset="35%" stop-color="${style.accent}" stop-opacity="0.32"/>
            <stop offset="100%" stop-color="${style.accent}" stop-opacity="0"/>
          </radialGradient>
          <linearGradient id="${safeUid}-sheen" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#ffffff" stop-opacity="0.10"/>
            <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
          </linearGradient>
          <clipPath id="${safeUid}-clip"><polygon points="${polygon(1)}"/></clipPath>
        </defs>
        <polygon class="lst-web-shadow" points="${polygon(1.04)}"/>
        <polygon class="lst-web-bg" points="${polygon(1)}"/>
        ${bg}
        ${bands}
        <circle cx="${f(cx)}" cy="${f(cy)}" r="${f(glowR)}" fill="url(#${safeUid}-glow)" class="lst-web-glow" clip-path="url(#${safeUid}-clip)"/>
        <polygon points="${polygon(1)}" fill="url(#${safeUid}-sheen)" class="lst-web-sheen"/>
        ${rims}${spokes}${links}
      </svg>
      ${labels}
      ${core}
      ${nodeHTML}
    </div>
  </div>`;
}

