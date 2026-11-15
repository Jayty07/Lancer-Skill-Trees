import {
  MODULE_ID, DEFAULT_NODE_IMG, DEFAULT_TREE_IMG, AE_MODES, MODE_INFO, SCOPES,
  THEMES, NODE_SHAPES, LINK_STYLES, ROW_SPACING, CELL_SIZE
} from "./constants.js";
import { radialSlot, sectorName, normBearing, DEFAULT_SECTOR_NAMES } from "./radial.js";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const ID_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export function randomId(length = 16) {
  const fn = globalThis.foundry?.utils?.randomID;
  if (fn) return fn(length);
  let id = "";
  for (let i = 0; i < length; i++) id += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)];
  return id;
}

export function toInt(value, fallback = 0, min = -Infinity, max = Infinity) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

const isHex = (v) => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);
const safeId = (v) => String(v ?? "").replace(/[^a-zA-Z0-9_-]/g, "");

/* ------------------------------------------------------------------ */
/*  Normalization                                                      */
/* ------------------------------------------------------------------ */

export function normalizeModifier(raw = {}) {
  const mode = Number(raw.mode);
  const priority = raw.priority === "" || raw.priority === null || raw.priority === undefined ? null : toInt(raw.priority, null);
  return {
    id: safeId(raw.id) || randomId(),
    scope: SCOPES[raw.scope] ? raw.scope : "mech",
    key: String(raw.key ?? "system.hp.max").trim(),
    mode: Number.isInteger(mode) && MODE_INFO[mode] ? mode : AE_MODES.ADD,
    value: raw.value === undefined || raw.value === null ? "1" : String(raw.value).trim(),
    priority
  };
}

export function normalizeCustom(raw = {}) {
  return {
    id: safeId(raw.id) || randomId(),
    skill: String(raw.skill ?? ""),
    options: raw.options && typeof raw.options === "object" && !Array.isArray(raw.options) ? { ...raw.options } : {}
  };
}

export function normalizeNode(raw = {}) {
  return {
    id: safeId(raw.id) || randomId(),
    name: String(raw.name ?? "New Skill"),
    img: String(raw.img || DEFAULT_NODE_IMG),
    description: String(raw.description ?? ""),
    x: toInt(raw.x, 0, 0, 39),
    y: toInt(raw.y, 0, 0, 39),
    cost: toInt(raw.cost, 1, 0, 99),
    maxRank: toInt(raw.maxRank, 1, 1, 20),
    minLevel: toInt(raw.minLevel, 0, 0, 99),
    requires: Array.isArray(raw.requires) ? [...new Set(raw.requires.map(safeId).filter(Boolean))] : [],
    requireMode: raw.requireMode === "any" ? "any" : "all",
    modifiers: Array.isArray(raw.modifiers) ? raw.modifiers.map(normalizeModifier) : [],
    custom: Array.isArray(raw.custom) ? raw.custom.map(normalizeCustom) : [],
    macro: String(raw.macro ?? "").trim(),
    pos: normalizePos(raw.pos)
  };
}

/** Radial-layout position { a: bearing°, r: 0..1 } or null. */
export function normalizePos(raw) {
  const a = Number(raw?.a);
  const r = Number(raw?.r);
  if (!Number.isFinite(a) || !Number.isFinite(r)) return null;
  return { a: Math.round(normBearing(a) * 100) / 100, r: Math.round(Math.min(1, Math.max(0, r)) * 1000) / 1000 };
}

export function normalizeRadial(raw = {}) {
  const sectors = toInt(raw.sectors, 6, 3, 8);
  const names = Array.from({ length: sectors }, (_, i) => {
    const v = Array.isArray(raw.names) ? raw.names[i] : undefined;
    return typeof v === "string" && v.trim() ? v.trim() : DEFAULT_SECTOR_NAMES[i];
  });
  return { sectors, rings: toInt(raw.rings, 3, 1, 5), names };
}

export function themeDefaults(theme) {
  return { ...(THEMES[theme] ?? THEMES.lancer).defaults };
}

export function normalizeStyle(raw = {}, legacyColor) {
  const theme = THEMES[raw.theme] ? raw.theme : "lancer";
  const d = themeDefaults(theme);
  const opacity = toInt(raw.bgOpacity, 35, 0, 100);
  return {
    theme,
    accent: isHex(raw.accent) ? raw.accent : isHex(legacyColor) ? legacyColor : d.accent,
    secondary: isHex(raw.secondary) ? raw.secondary : d.secondary,
    nodeShape: NODE_SHAPES[raw.nodeShape] ? raw.nodeShape : d.nodeShape,
    linkStyle: LINK_STYLES[raw.linkStyle] ? raw.linkStyle : d.linkStyle,
    tierBar: typeof raw.tierBar === "boolean" ? raw.tierBar : d.tierBar,
    banner: typeof raw.banner === "boolean" ? raw.banner : d.banner,
    spacing: ROW_SPACING[raw.spacing] ? raw.spacing : d.spacing,
    background: String(raw.background ?? "").trim(),
    bgOpacity: opacity
  };
}

/** Height of one grid row for this tree, in pixels. */
export function rowHeight(tree) {
  return CELL_SIZE + (ROW_SPACING[tree?.style?.spacing]?.extra ?? 0);
}

export function normalizeTree(raw = {}) {
  const tree = {
    id: safeId(raw.id) || randomId(),
    name: String(raw.name ?? "New Skill Tree"),
    description: String(raw.description ?? ""),
    img: String(raw.img || DEFAULT_TREE_IMG),
    access: raw.access === "granted" ? "granted" : "all",
    layout: raw.layout === "radial" ? "radial" : "grid",
    radial: normalizeRadial(raw.radial ?? {}),
    tierPoints: toInt(raw.tierPoints, 0, 0, 99),
    cols: toInt(raw.cols, 7, 1, 40),
    rows: toInt(raw.rows, 6, 1, 40),
    sort: toInt(raw.sort, 0),
    style: normalizeStyle(raw.style ?? {}, raw.color),
    nodes: {}
  };
  const entries = Array.isArray(raw.nodes) ? raw.nodes.map((n) => [n?.id, n]) : Object.entries(raw.nodes ?? {});
  for (const [key, rn] of entries) {
    if (!rn || typeof rn !== "object") continue;
    const node = normalizeNode({ id: key, ...rn });
    tree.nodes[node.id] = node;
  }
  for (const node of Object.values(tree.nodes)) {
    node.requires = node.requires.filter((r) => r !== node.id && tree.nodes[r]);
    tree.cols = Math.max(tree.cols, node.x + 1);
    tree.rows = Math.max(tree.rows, node.y + 1);
  }
  return tree;
}

/* ------------------------------------------------------------------ */
/*  Tree storage (world setting)                                       */
/* ------------------------------------------------------------------ */

let _cache = null;

export function invalidateTreeCache() {
  _cache = null;
}

/** All trees, normalized. Treat the result as read-only; deepClone before editing. */
export function getTrees() {
  if (_cache) return _cache;
  let raw = {};
  try {
    raw = game.settings.get(MODULE_ID, "trees") ?? {};
  } catch {
    raw = {};
  }
  const out = {};
  for (const t of Array.isArray(raw) ? raw : Object.values(raw)) {
    if (!t || typeof t !== "object") continue;
    const tree = normalizeTree(t);
    out[tree.id] = tree;
  }
  _cache = out;
  return out;
}

export function getTree(id) {
  return getTrees()[id] ?? null;
}

export async function saveTrees(trees) {
  const data = {};
  for (const t of Object.values(trees)) {
    const tree = normalizeTree(t);
    data[tree.id] = tree;
  }
  _cache = null;
  await game.settings.set(MODULE_ID, "trees", data);
  _cache = null;
}

export function sortedTrees(trees) {
  return Object.values(trees).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
}

/* ------------------------------------------------------------------ */
/*  Actor progress (flags)                                             */
/* ------------------------------------------------------------------ */

export function getProgressFlags(actor) {
  return actor?.flags?.[MODULE_ID] ?? {};
}

/** { treeId: { nodeId: rank } } containing only ranks above zero. */
export function getRanks(actor) {
  const raw = getProgressFlags(actor).ranks ?? {};
  const out = {};
  for (const [treeId, nodes] of Object.entries(raw)) {
    if (!nodes || typeof nodes !== "object") continue;
    for (const [nodeId, r] of Object.entries(nodes)) {
      const n = Number(r);
      if (n > 0) (out[treeId] ??= {})[nodeId] = n;
    }
  }
  return out;
}

export function hasProgress(actor) {
  return Object.keys(getRanks(actor)).length > 0;
}

export function getBonusPoints(actor) {
  return Number(getProgressFlags(actor).bonusPoints) || 0;
}

export function isGranted(actor, treeId) {
  return !!getProgressFlags(actor).granted?.[treeId];
}

export function actorLevel(actor) {
  const s = actor?.system ?? {};
  const lvl = Number(s.level ?? s.tier ?? 0);
  return Number.isFinite(lvl) ? lvl : 0;
}

/** Variables available in modifier formulas: @ll, @grit, @tier, @hull, @agi, @sys, @eng, @rank. */
export function formulaVars(actor) {
  const s = actor?.system ?? {};
  const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
  const ll = actorLevel(actor);
  return {
    ll,
    level: ll,
    grit: num(s.grit, Math.ceil(ll / 2)),
    tier: num(s.tier, 0),
    hull: num(s.hull),
    agi: num(s.agi),
    sys: num(s.sys),
    eng: num(s.eng)
  };
}

export function treeAccessible(tree, actor) {
  if (!tree) return false;
  if (tree.access !== "granted") return true;
  if (isGranted(actor, tree.id)) return true;
  return Object.keys(getRanks(actor)[tree.id] ?? {}).length > 0;
}

/* ------------------------------------------------------------------ */
/*  Points and rules (pure)                                            */
/* ------------------------------------------------------------------ */

export function computePoints({ trees, ranks, level = 0, bonus = 0, perLevel = 1, starting = 0 }) {
  const total = Number(starting) + Number(level) * Number(perLevel) + Number(bonus);
  let spent = 0;
  for (const [treeId, nodeRanks] of Object.entries(ranks ?? {})) {
    const tree = trees[treeId];
    if (!tree) continue;
    spent += pointsInTree(tree, nodeRanks);
  }
  return { total, spent, available: total - spent };
}

export function actorPoints(actor, trees = getTrees()) {
  let perLevel = 1;
  let starting = 0;
  try {
    perLevel = Number(game.settings.get(MODULE_ID, "pointsPerLevel")) || 0;
    starting = Number(game.settings.get(MODULE_ID, "startingPoints")) || 0;
  } catch { /* settings not ready */ }
  return computePoints({ trees, ranks: getRanks(actor), level: actorLevel(actor), bonus: getBonusPoints(actor), perLevel, starting });
}

/** Points spent in one tree, optionally only in rows above `belowRow`. */
export function pointsInTree(tree, treeRanks = {}, belowRow = Infinity) {
  let sum = 0;
  for (const [nodeId, r] of Object.entries(treeRanks)) {
    const node = tree.nodes[nodeId];
    if (!node || !(r > 0) || node.y >= belowRow) continue;
    sum += node.cost * Math.min(r, node.maxRank);
  }
  return sum;
}

/** Points spent in one sector of a radial tree, optionally only in rings inside `belowRing`. */
export function pointsInSector(tree, treeRanks = {}, sector, belowRing = Infinity) {
  let sum = 0;
  for (const [nodeId, r] of Object.entries(treeRanks)) {
    const node = tree.nodes[nodeId];
    if (!node || !(r > 0)) continue;
    const slot = radialSlot(tree, node);
    if (slot.sector !== sector || slot.ring >= belowRing) continue;
    sum += node.cost * Math.min(r, node.maxRank);
  }
  return sum;
}

/** Display info for a radial sector: points spent, rings open, progress toward the outer ring. */
export function sectorStats(tree, treeRanks, sector) {
  const rings = tree.radial.rings;
  const spent = treeRanks ? pointsInSector(tree, treeRanks, sector) : 0;
  if (!(tree.tierPoints > 0)) return { spent, tier: rings, progress: rings ? 1 : 0 };
  const tier = Math.min(rings, 1 + Math.floor(spent / tree.tierPoints));
  const progress = rings > 1 ? Math.min(1, spent / (tree.tierPoints * (rings - 1))) : 1;
  return { spent, tier, progress };
}

/**
 * Tier gating.
 * Grid: row N needs N × tierPoints spent in the rows above it (Borderlands style).
 * Radial: ring N of a sector needs N × tierPoints spent in that sector's inner rings.
 */
export function tierStatus(tree, node, treeRanks = {}) {
  if (tree.layout === "radial") {
    const { sector, ring } = radialSlot(tree, node);
    const need = tree.tierPoints > 0 ? ring * tree.tierPoints : 0;
    const have = need > 0 ? pointsInSector(tree, treeRanks, sector, ring) : 0;
    return { need, have, ok: have >= need, where: `the inner rings of the ${sectorName(tree, sector)} sector` };
  }
  const need = tree.tierPoints > 0 ? node.y * tree.tierPoints : 0;
  const have = need > 0 ? pointsInTree(tree, treeRanks, node.y) : 0;
  return { need, have, ok: have >= need, where: `earlier tiers of ${tree.name}` };
}

export function prereqStatus(tree, node, treeRanks = {}, level = 0) {
  const reqs = node.requires.filter((id) => tree.nodes[id]);
  const list = reqs.map((id) => ({ id, name: tree.nodes[id].name, met: (treeRanks[id] ?? 0) > 0 }));
  const prereqOk = !list.length || (node.requireMode === "any" ? list.some((l) => l.met) : list.every((l) => l.met));
  const levelOk = level >= node.minLevel;
  const tier = tierStatus(tree, node, treeRanks);
  return { ok: prereqOk && levelOk && tier.ok, prereqOk, levelOk, tierOk: tier.ok, tier, list };
}

export function canIncrease({ tree, node, treeRanks = {}, level = 0, available = 0, steps = 1 }) {
  const rank = Math.min(treeRanks[node.id] ?? 0, node.maxRank);
  if (rank >= node.maxRank) return { ok: false, reason: "Already at maximum rank." };
  const st = prereqStatus(tree, node, treeRanks, level);
  if (!st.levelOk) return { ok: false, reason: `Requires License Level ${node.minLevel}.` };
  if (!st.prereqOk) {
    const missing = st.list.filter((l) => !l.met).map((l) => l.name).join(", ");
    return { ok: false, reason: node.requireMode === "any" ? `Requires one of: ${missing}.` : `Requires ${missing}.` };
  }
  if (!st.tierOk) {
    return { ok: false, reason: `Requires ${st.tier.need} points spent in ${st.tier.where} (currently ${st.tier.have}).` };
  }
  const cost = node.cost * Math.max(1, steps);
  if (cost > available) return { ok: false, reason: `Not enough skill points (needs ${cost}, have ${available}).` };
  return { ok: true, cost };
}

/** Lowering a node by one rank must not strand any other unlocked node. */
export function canDecrease({ tree, node, treeRanks = {} }) {
  const rank = Math.min(treeRanks[node.id] ?? 0, node.maxRank);
  if (rank <= 0) return { ok: false, reason: "Not unlocked." };
  const sim = { ...treeRanks, [node.id]: rank - 1 };
  const broken = Object.values(tree.nodes).filter((n) => {
    if (n.id === node.id || !((sim[n.id] ?? 0) > 0)) return false;
    const st = prereqStatus(tree, n, sim, Infinity);
    return !st.prereqOk || !st.tierOk;
  });
  if (broken.length) return { ok: false, reason: `Refund ${broken.map((b) => b.name).join(", ")} first.`, broken };
  return { ok: true };
}

/** Would making `prereqId` a prerequisite of `nodeId` create a loop? */
export function wouldCreateCycle(tree, nodeId, prereqId) {
  if (nodeId === prereqId) return true;
  const stack = [prereqId];
  const seen = new Set();
  while (stack.length) {
    const id = stack.pop();
    if (id === nodeId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    const n = tree.nodes[id];
    if (n) stack.push(...n.requires);
  }
  return false;
}

export function nodeAt(tree, x, y) {
  return Object.values(tree.nodes).find((n) => n.x === x && n.y === y) ?? null;
}

export function firstFreeCell(tree) {
  for (let y = 0; y < tree.rows; y++) {
    for (let x = 0; x < tree.cols; x++) if (!nodeAt(tree, x, y)) return { x, y };
  }
  return { x: 0, y: tree.rows };
}

/** Deep copy of a tree with fresh ids for the tree and every node. */
export function cloneTreeWithNewIds(tree) {
  const copy = JSON.parse(JSON.stringify(tree));
  const map = {};
  for (const id of Object.keys(copy.nodes)) map[id] = randomId();
  const nodes = {};
  for (const [oldId, node] of Object.entries(copy.nodes)) {
    node.id = map[oldId];
    node.requires = node.requires.map((r) => map[r]).filter(Boolean);
    nodes[node.id] = node;
  }
  copy.nodes = nodes;
  copy.id = randomId();
  return normalizeTree(copy);
}
