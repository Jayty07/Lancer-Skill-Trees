/**
 * Geometry for the "Radial web" layout: a regular polygon split into sectors (wedges, one per
 * edge) and concentric rings (tiers). Node positions are stored as { a, r }:
 *   a = bearing in degrees, clockwise from straight up (sector 0 is centered at the top)
 *   r = "polygon radius" from 0 (center) to 1 (outer edge), measured so rings are concentric polygons
 */

/** Fraction of the radius taken by the central core. */
export const CORE = 0.22;
/** Outer circumradius in pixels for each row-spacing setting. */
export const RADIAL_SIZE = { compact: 220, normal: 260, roomy: 310 };
/** Room around the polygon for the sector name plates. */
export const LABEL_PAD = 120;
export const RNODE_SIZE = 30;

export const DEFAULT_SECTOR_NAMES = ["Assault", "Defense", "Support", "Systems", "Utility", "Mobility", "Command", "Recon"];

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

export function normBearing(a) {
  return ((a % 360) + 360) % 360;
}

/** Signed difference in [-180, 180). */
export function angleDiff(a) {
  return ((((a + 180) % 360) + 360) % 360) - 180;
}

export function radialConfig(tree) {
  const n = tree.radial?.sectors ?? 6;
  const rings = tree.radial?.rings ?? 3;
  const step = 360 / n;
  const R = RADIAL_SIZE[tree.style?.spacing] ?? RADIAL_SIZE.normal;
  const A = R * Math.cos(rad(step / 2)); // apothem
  const size = Math.round(2 * (R + LABEL_PAD));
  return { n, rings, step, R, A, size, cx: size / 2, cy: size / 2 };
}

export function sectorOf(a, n) {
  const step = 360 / n;
  return Math.floor(normBearing(a + step / 2) / step) % n;
}

export function ringBounds(k, rings) {
  const w = (1 - CORE) / rings;
  return [CORE + k * w, CORE + (k + 1) * w];
}

export function ringOf(r, rings) {
  const w = (1 - CORE) / rings;
  return Math.min(rings - 1, Math.max(0, Math.floor((r - CORE) / w)));
}

/** Position for nodes that were never placed in the radial layout (derived from grid x/y). */
export function autoPos(tree, node) {
  const n = tree.radial?.sectors ?? 6;
  const rings = tree.radial?.rings ?? 3;
  const step = 360 / n;
  const offsets = [0, -0.28, 0.28, -0.14, 0.14, -0.4, 0.4];
  const sector = node.x % n;
  const sub = Math.floor(node.x / n);
  const ring = Math.min(node.y, rings - 1);
  const [r0, r1] = ringBounds(ring, rings);
  return { a: normBearing(sector * step + offsets[sub % offsets.length] * step), r: (r0 + r1) / 2 };
}

export function nodePos(tree, node) {
  return node.pos ?? autoPos(tree, node);
}

/** Which sector and ring a node sits in. */
export function radialSlot(tree, node) {
  const p = nodePos(tree, node);
  return { sector: sectorOf(p.a, tree.radial?.sectors ?? 6), ring: ringOf(p.r, tree.radial?.rings ?? 3) };
}

export function sectorName(tree, sector) {
  return tree.radial?.names?.[sector] || `Sector ${sector + 1}`;
}

/** Pixel position of a point on the canvas. */
export function vertex(cfg, bearing, dist) {
  const th = rad(bearing - 90);
  return [cfg.cx + dist * Math.cos(th), cfg.cy + dist * Math.sin(th)];
}

export function toXY(cfg, a, r) {
  const c = sectorOf(a, cfg.n) * cfg.step;
  const d = (r * cfg.A) / Math.cos(rad(angleDiff(a - c)));
  return vertex(cfg, a, d);
}

export function fromXY(cfg, x, y) {
  const dx = x - cfg.cx;
  const dy = y - cfg.cy;
  const a = normBearing(deg(Math.atan2(dy, dx)) + 90);
  const c = sectorOf(a, cfg.n) * cfg.step;
  const r = (Math.hypot(dx, dy) * Math.cos(rad(angleDiff(a - c)))) / cfg.A;
  return { a, r };
}

/** Snap to 8 angular slots per sector and 3 tracks per ring. */
export function snapPos(cfg, a, r) {
  const s = sectorOf(a, cfg.n);
  const c = s * cfg.step;
  const slotW = cfg.step / 8;
  const slot = Math.min(7, Math.max(0, Math.floor((angleDiff(a - c) + cfg.step / 2) / slotW)));
  const sub = (1 - CORE) / cfg.rings / 3;
  const track = Math.min(cfg.rings * 3 - 1, Math.max(0, Math.floor((r - CORE) / sub)));
  return {
    a: Math.round(normBearing(c - cfg.step / 2 + (slot + 0.5) * slotW) * 100) / 100,
    r: Math.round((CORE + (track + 0.5) * sub) * 1000) / 1000
  };
}

/** Every snap point, inner rings first, sector centers first; used to find room for a new node. */
export function* snapPoints(cfg) {
  const slotOrder = [4, 3, 5, 2, 6, 1, 7, 0];
  const sub = (1 - CORE) / cfg.rings / 3;
  for (let track = 0; track < cfg.rings * 3; track++) {
    for (const slot of slotOrder) {
      for (let s = 0; s < cfg.n; s++) {
        const a = normBearing(s * cfg.step - cfg.step / 2 + (slot + 0.5) * (cfg.step / 8));
        yield { a: Math.round(a * 100) / 100, r: Math.round((CORE + (track + 0.5) * sub) * 1000) / 1000 };
      }
    }
  }
}
