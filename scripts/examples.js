import { normalizeTree, randomId } from "./data.js";
import { iconPath } from "./constants.js";
import { CORE } from "./radial.js";

/**
 * A sample tree in the Borderlands-inspired cel-shaded style with tier gating:
 * three columns, four tiers, ranks, prerequisites, pilot / mech / drone bonuses,
 * a License Level formula, an "any one of" capstone and a scripted custom effect.
 */
export function exampleTree() {
  const id = {
    plating: randomId(), conditioning: randomId(), evasive: randomId(), hardened: randomId(),
    drones: randomId(), ace: randomId(), coolant: randomId(), legend: randomId()
  };
  return normalizeTree({
    id: randomId(),
    name: "Frame Veteran (Example)",
    description: "A sample tree. Each row needs 2 more points spent in the rows above it. Edit or delete it freely.",
    access: "all",
    tierPoints: 2,
    cols: 3,
    rows: 4,
    style: { theme: "cel", accent: "#f6b51e", secondary: "#2b9be8", nodeShape: "rounded", linkStyle: "elbow", tierBar: true, banner: true },
    nodes: [
      {
        id: id.plating, name: "Reinforced Plating", img: iconPath("plating"), x: 0, y: 0, cost: 1, maxRank: 3,
        description: "Extra armor plating bolted onto every frame you pilot.\n\n+2 mech HP per rank.",
        modifiers: [{ scope: "mech", key: "system.hp.max", mode: 2, value: "2" }]
      },
      {
        id: id.conditioning, name: "Pilot Conditioning", img: iconPath("pilot"), x: 2, y: 0, cost: 1,
        description: "Hard training keeps you alive outside the cockpit.\n\n+2 pilot HP and +1 pilot Evasion.",
        modifiers: [
          { scope: "pilot", key: "system.hp.max", mode: 2, value: "2" },
          { scope: "pilot", key: "system.evasion", mode: 2, value: "1" }
        ]
      },
      {
        id: id.evasive, name: "Evasive Maneuvers", img: iconPath("evasion"), x: 0, y: 1, cost: 1, requires: [id.plating],
        description: "+1 mech Evasion.",
        modifiers: [{ scope: "mech", key: "system.evasion", mode: 2, value: "1" }]
      },
      {
        id: id.hardened, name: "Hardened Systems", img: iconPath("firewall"), x: 1, y: 1, cost: 1,
        description: "No prerequisite skill, only the tier requirement.\n\n+1 mech E-Defense and +1 Heat Cap.",
        modifiers: [
          { scope: "mech", key: "system.edef", mode: 2, value: "1" },
          { scope: "mech", key: "system.heat.max", mode: 2, value: "1" }
        ]
      },
      {
        id: id.drones, name: "Drone Tuning", img: iconPath("drone"), x: 2, y: 1, cost: 1, maxRank: 2, requires: [id.conditioning],
        description: "Your drones gain +2 HP and +1 Evasion per rank.",
        modifiers: [
          { scope: "drone", key: "system.hp_bonus", mode: 2, value: "2" },
          { scope: "drone", key: "system.evasion", mode: 2, value: "1" }
        ]
      },
      {
        id: id.ace, name: "Ace", img: iconPath("speed"), x: 0, y: 2, cost: 1, minLevel: 3, requires: [id.evasive],
        description: "Requires License Level 3.\n\n+1 mech Speed, plus 1 more for every 6 License Levels (formula: 1 + floor(@ll/6)).",
        modifiers: [{ scope: "mech", key: "system.speed", mode: 2, value: "1 + floor(@ll/6)" }]
      },
      {
        id: id.coolant, name: "Coolant Flush", img: iconPath("coolant"), x: 1, y: 2, cost: 1, maxRank: 2, requires: [id.hardened],
        description: "Scripted custom effect: at the start of each of your turns, your mech clears 1 Heat per rank.",
        custom: [{ skill: "coolant-flush", options: { heat: 1 } }]
      },
      {
        id: id.legend, name: "Living Legend", img: iconPath("capstone"), x: 1, y: 3, cost: 2, requires: [id.ace, id.coolant], requireMode: "any",
        description: "Capstone. Requires Ace or Coolant Flush.\n\n+1 mech Structure and +2 Repair Cap.",
        modifiers: [
          { scope: "mech", key: "system.structure.max", mode: 2, value: "1" },
          { scope: "mech", key: "system.repairs.max", mode: 2, value: "2" }
        ]
      }
    ]
  });
}

/**
 * A sample "Radial web" tree: six sectors, three rings, per-sector ring gating.
 * Each sector is a spoke of three skills; a few cross-links tie neighbouring sectors together.
 */
export function exampleRadialTree() {
  const band = (1 - CORE) / 3;
  const ringR = (k, track = 1) => Math.round((CORE + k * band + ((track + 0.5) * band) / 3) * 1000) / 1000;
  const spec = [
    ["Assault", [["Hardpoint Drills", "targeting", "mech", "system.bonuses.flat.range_attack", "1", "+1 to ranged attack rolls."],
      ["Heavy Hitter", "impact", "mech", "system.bonuses.flat.ram", "1", "+1 to Ram checks."],
      ["Missile Racks", "missile", "mech", "system.loadout.limited_bonus", "1", "+1 use for Limited systems and weapons."]]],
    ["Defense", [["Reinforced Plating", "plating", "mech", "system.hp.max", "2", "+2 mech HP per rank.", 3],
      ["Bulwark", "structure", "mech", "system.armor", "1", "+1 mech Armor."],
      ["Overshield Emitters", "overshield", "mech", "system.structure.max", "1", "+1 mech Structure."]]],
    ["Support", [["Field Medic", "repair", "mech", "system.repairs.max", "1", "+1 Repair Cap."],
      ["Drone Wing", "drone", "drone", "system.hp_bonus", "2", "Drones gain +2 HP."],
      ["Turret Tuning", "turret", "deployable", "system.hp_bonus", "3", "Deployables gain +3 HP."]]],
    ["Systems", [["Firewall", "firewall", "mech", "system.edef", "1", "+1 mech E-Defense."],
      ["Tech Specialist", "hacking", "mech", "system.tech_attack", "1", "+1 Tech Attack."],
      ["NHP Link", "nhp", "mech", "system.ai.max", "1", "+1 AI cap."]]],
    ["Utility", [["Coolant Loops", "coolant", "mech", "system.heat.max", "1", "+1 Heat Cap."],
      ["Reactor Tuning", "reactor", "mech", "system.loadout.sp.max", "1", "+1 System Point."],
      ["Coolant Flush", "heat", null, null, null, "Scripted: clears 1 Heat per rank at the start of your turns.", 2]]],
    ["Mobility", [["Servo Tuning", "speed", "mech", "system.speed", "1", "+1 mech Speed."],
      ["Evasive Maneuvers", "evasion", "mech", "system.evasion", "1", "+1 mech Evasion."],
      ["Sensor Mast", "sensors", "mech", "system.sensor_range", "2", "+2 mech Sensors."]]]
  ];
  const nodes = [];
  const ids = {};
  spec.forEach(([sector, skills], s) => {
    let prev = null;
    skills.forEach(([name, icon, scope, key, value, description, maxRank = 1], k) => {
      const id = randomId();
      ids[name] = id;
      nodes.push({
        id, name, img: iconPath(icon), description, x: s, y: k, cost: k === 2 ? 2 : 1, maxRank,
        requires: prev ? [prev] : [],
        pos: { a: s * 60, r: ringR(k) },
        modifiers: key ? [{ scope, key, mode: 2, value }] : [],
        custom: key ? [] : [{ skill: "coolant-flush", options: { heat: 1 } }]
      });
      prev = id;
    });
  });
  // A pilot skill off to the side of Defense, and a capstone between Assault and Mobility.
  nodes.push({
    id: randomId(), name: "Pilot Conditioning", img: iconPath("pilot"), description: "+2 pilot HP.", x: 1, y: 0,
    requires: [], pos: { a: 60 + 22, r: ringR(0, 2) }, modifiers: [{ scope: "pilot", key: "system.hp.max", mode: 2, value: "2" }]
  });
  nodes.push({
    id: randomId(), name: "Living Legend", img: iconPath("capstone"), x: 0, y: 2, cost: 3,
    description: "Requires Missile Racks or Sensor Mast. +1 mech Structure and +1 Evasion.",
    requires: [ids["Missile Racks"], ids["Sensor Mast"]], requireMode: "any",
    pos: { a: 330 + 1, r: ringR(2, 2) },
    modifiers: [{ scope: "mech", key: "system.structure.max", mode: 2, value: "1" }, { scope: "mech", key: "system.evasion", mode: 2, value: "1" }]
  });
  return normalizeTree({
    id: randomId(),
    name: "Combat Doctrine (Hex Web)",
    description: "A sample radial tree. Each ring of a sector needs 2 more points spent in that sector's inner rings.",
    layout: "radial",
    radial: { sectors: 6, rings: 3, names: spec.map(([s]) => s) },
    tierPoints: 2,
    style: { theme: "hexweb", accent: "#ff8a1f", secondary: "#1fb3c7", nodeShape: "circle", linkStyle: "straight", spacing: "normal" },
    nodes
  });
}
