import { hasProgress } from "./data.js";

const isActorDoc = (v) => !!v && typeof v === "object" && v.documentName === "Actor";

/** The pilot behind an actor: itself for pilots, system.pilot for mechs. */
export function getPilot(actor) {
  if (!actor) return null;
  if (actor.type === "pilot") return actor;
  const ref = actor.system?.pilot;
  return isActorDoc(ref?.value) ? ref.value : null;
}

/** The mech an actor is driving: itself for mechs, system.active_mech for pilots. */
export function getActiveMech(actor) {
  if (!actor) return null;
  if (actor.type === "mech") return actor;
  const ref = actor.system?.active_mech;
  return isActorDoc(ref?.value) ? ref.value : null;
}

/** Skill trees live on the pilot. A piloted mech resolves to its pilot. */
export function getProgressActor(actor) {
  if (!actor) return null;
  if (actor.type === "mech") return getPilot(actor) ?? actor;
  return actor;
}

/** Every actor whose skill trees apply to this actor (its own, plus its pilot's). */
export function progressActorsFor(actor) {
  const out = [];
  if (!actor) return out;
  if (hasProgress(actor)) out.push(actor);
  if (actor.type === "mech") {
    const pilot = getPilot(actor);
    if (pilot && pilot !== actor && hasProgress(pilot)) out.push(pilot);
  }
  return out;
}
