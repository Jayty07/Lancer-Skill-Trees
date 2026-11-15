export const MODULE_ID = "lancer-skill-trees";
export const SOCKET_NAME = `module.${MODULE_ID}`;
export const DEFAULT_NODE_IMG = `modules/${MODULE_ID}/assets/node.svg`;
export const DEFAULT_TREE_IMG = `modules/${MODULE_ID}/assets/tree.svg`;

/** Size of one grid cell and of a skill icon, in pixels. */
export const CELL_SIZE = 128;
export const NODE_SIZE = 72;
export const NODE_TOP = 16;

/** Foundry Active Effect change modes, plus the two JSON modes the LANCER system adds. */
export const AE_MODES = Object.freeze({
  CUSTOM: 0,
  MULTIPLY: 1,
  ADD: 2,
  DOWNGRADE: 3,
  UPGRADE: 4,
  OVERRIDE: 5,
  SET_JSON: 11,
  APPEND_JSON: 12
});

/**
 * Priorities mirror the LANCER system's own converter:
 * frame stats 10, bonuses 20, pilot stats 30, effects 40, overrides 50.
 */
export const MODE_INFO = {
  2: { label: "Add", priority: 20 },
  1: { label: "Multiply", priority: 35 },
  5: { label: "Override (set to)", priority: 50 },
  4: { label: "Upgrade (at least)", priority: 45 },
  3: { label: "Downgrade (at most)", priority: 45 },
  0: { label: "Custom", priority: 50 },
  11: { label: "Set JSON (LANCER)", priority: 50 },
  12: { label: "Append JSON (LANCER)", priority: 50 }
};
export const MODE_ORDER = [2, 1, 5, 4, 3, 0, 11, 12];

/**
 * Where a passive modifier lands. targetType is the LANCER system's
 * flags.lancer.target_type: effects on a pilot that target a mech or
 * deployable are passed down automatically by the system.
 */
export const SCOPES = {
  pilot: { label: "Pilot", short: "Pilot", targetType: "pilot" },
  mech: { label: "Mech / NPC", short: "Mech", targetType: "mech_and_npc" },
  deployable: { label: "Deployables", short: "Deployable", targetType: "only_deployable" },
  drone: { label: "Drones", short: "Drone", targetType: "only_drone" },
  allDeployables: { label: "Deployables & Drones", short: "Deployable/Drone", targetType: "deployable" }
};

export const CUSTOM_KEY = "__custom__";

/* Data paths match the LANCER system's bonus converter (src/module/effects/converter.ts). */
const PILOT_STATS = [
  { key: "system.hp.max", label: "HP" },
  { key: "system.armor", label: "Armor" },
  { key: "system.evasion", label: "Evasion" },
  { key: "system.edef", label: "E-Defense" },
  { key: "system.speed", label: "Speed" }
];

const MECH_STATS = [
  { key: "system.hp.max", label: "HP" },
  { key: "system.armor", label: "Armor" },
  { key: "system.structure.max", label: "Structure" },
  { key: "system.stress.max", label: "Stress" },
  { key: "system.heat.max", label: "Heat Cap" },
  { key: "system.repairs.max", label: "Repair Cap" },
  { key: "system.speed", label: "Speed" },
  { key: "system.evasion", label: "Evasion" },
  { key: "system.edef", label: "E-Defense" },
  { key: "system.sensor_range", label: "Sensors" },
  { key: "system.save", label: "Save Target" },
  { key: "system.tech_attack", label: "Tech Attack" },
  { key: "system.bonuses.flat.range_attack", label: "Ranged Attack Bonus" },
  { key: "system.bonuses.flat.grapple", label: "Grapple Bonus" },
  { key: "system.bonuses.flat.ram", label: "Ram Bonus" },
  { key: "system.loadout.sp.max", label: "System Points (SP)" },
  { key: "system.ai.max", label: "AI Cap" },
  { key: "system.loadout.limited_bonus", label: "Limited Uses Bonus" },
  { key: "system.size", label: "Size" },
  { key: "system.structure_repair_cost", label: "Structure Repair Cost", mode: 5, value: "1" },
  { key: "system.stress_repair_cost", label: "Stress Repair Cost", mode: 5, value: "1" }
];

const DEPLOYABLE_STATS = [
  { key: "system.hp_bonus", label: "HP (bonus)" },
  { key: "system.armor", label: "Armor" },
  { key: "system.evasion", label: "Evasion" },
  { key: "system.edef", label: "E-Defense" },
  { key: "system.speed", label: "Speed" },
  { key: "system.sensor_range", label: "Sensors" },
  { key: "system.save", label: "Save Target" },
  { key: "system.tech_attack_bonus", label: "Tech Attack (bonus)" },
  { key: "system.size", label: "Size" }
];

export const STATS = {
  pilot: PILOT_STATS,
  mech: MECH_STATS,
  deployable: DEPLOYABLE_STATS,
  drone: DEPLOYABLE_STATS,
  allDeployables: DEPLOYABLE_STATS
};

export function statLabel(scope, key) {
  return STATS[scope]?.find((s) => s.key === key)?.label ?? key;
}

/* ------------------------------------------------------------------ */
/*  Tree styles                                                        */
/* ------------------------------------------------------------------ */

export const THEMES = {
  lancer: {
    label: "LANCER Tactical",
    hint: "Angular gunmetal panels with clipped corners.",
    defaults: { accent: "#c8102e", secondary: "#8fa3bf", nodeShape: "angular", linkStyle: "straight", tierBar: true, banner: false, spacing: "normal" }
  },
  cel: {
    label: "Cel-Shaded Tiers (Borderlands-inspired)",
    hint: "Comic-book ink outlines, halftone backdrop, rank counters under each skill, tier rows and a points-invested bar. Pair it with “Points per tier”.",
    defaults: { accent: "#f6b51e", secondary: "#2b9be8", nodeShape: "rounded", linkStyle: "elbow", tierBar: true, banner: true, spacing: "roomy" }
  },
  holo: {
    label: "Holographic HUD",
    hint: "Glowing lines and hexagons on a scanline grid.",
    defaults: { accent: "#29e3ff", secondary: "#7c5cff", nodeShape: "hex", linkStyle: "curved", tierBar: true, banner: false, spacing: "normal" }
  },
  hexweb: {
    label: "Hex Web",
    hint: "Glassy teal sectors around a glowing core. Made for the Radial web layout; also works on grids.",
    defaults: { accent: "#ff8a1f", secondary: "#1fb3c7", nodeShape: "circle", linkStyle: "straight", tierBar: true, banner: false, spacing: "normal" }
  }
};

export const THEME_HEXWEB = "hexweb";

export const NODE_SHAPES = {
  angular: "Angular (clipped corners)",
  rounded: "Rounded square",
  square: "Square",
  hex: "Hexagon",
  circle: "Circle",
  diamond: "Diamond"
};

/** Extra vertical room between rows, in pixels (more room shows more of each connector). */
export const ROW_SPACING = {
  compact: { label: "Compact", extra: 0 },
  normal: { label: "Normal", extra: 20 },
  roomy: { label: "Roomy", extra: 48 }
};

export const LINK_STYLES = {
  straight: "Straight",
  elbow: "Elbow (right angles)",
  curved: "Curved",
  none: "Hidden"
};

/* ------------------------------------------------------------------ */
/*  Built-in skill icons (assets/icons)                                */
/* ------------------------------------------------------------------ */

export const ICONS = [
  ["plating", "Armor Plating"], ["evasion", "Evasion"], ["targeting", "Targeting"], ["hacking", "Hacking"],
  ["sensors", "Sensors"], ["heat", "Heat"], ["coolant", "Coolant"], ["speed", "Speed"],
  ["structure", "Structure"], ["repair", "Repair"], ["reactor", "Reactor"], ["missile", "Missile"],
  ["melee", "Melee"], ["drone", "Drone"], ["turret", "Turret"], ["pilot", "Pilot"],
  ["grit", "Grit"], ["warning", "Stress"], ["firewall", "E-Defense"], ["nhp", "NHP / AI"],
  ["ammo", "Ammo"], ["impact", "Impact"], ["overshield", "Overshield"], ["capstone", "Capstone"]
].map(([id, label]) => ({ id, label, path: `modules/${MODULE_ID}/assets/icons/${id}.svg` }));

export function iconPath(id) {
  return ICONS.find((i) => i.id === id)?.path ?? DEFAULT_NODE_IMG;
}

/** A sensible icon for a stat, used when a modifier is added to a skill that still has the default icon. */
const STAT_ICONS = {
  "system.hp.max": "plating", "system.hp_bonus": "plating", "system.armor": "plating",
  "system.evasion": "evasion", "system.edef": "firewall", "system.speed": "speed",
  "system.structure.max": "structure", "system.stress.max": "warning", "system.heat.max": "heat",
  "system.repairs.max": "repair", "system.structure_repair_cost": "repair", "system.stress_repair_cost": "repair",
  "system.sensor_range": "sensors", "system.save": "firewall", "system.tech_attack": "hacking",
  "system.tech_attack_bonus": "hacking", "system.bonuses.flat.range_attack": "targeting",
  "system.bonuses.flat.grapple": "impact", "system.bonuses.flat.ram": "impact",
  "system.loadout.sp.max": "reactor", "system.ai.max": "nhp", "system.loadout.limited_bonus": "ammo",
  "system.size": "structure"
};

export function suggestIcon(scope, key) {
  if (scope === "drone") return iconPath("drone");
  if (scope === "deployable" || scope === "allDeployables") return iconPath("turret");
  if (scope === "pilot" && (key === "system.hp.max" || key === "system.armor")) return iconPath("pilot");
  return STAT_ICONS[key] ? iconPath(STAT_ICONS[key]) : null;
}
