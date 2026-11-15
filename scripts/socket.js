import { MODULE_ID, SOCKET_NAME } from "./constants.js";
import { isActiveGM } from "./util.js";

const HANDLERS = new Map();

/** Register a handler that runs on the active GM's client. */
export function onSocket(type, fn) {
  HANDLERS.set(type, fn);
}

export function emit(type, payload = {}) {
  game.socket.emit(SOCKET_NAME, { type, payload, userId: game.user.id });
}

export function initSocket() {
  game.socket.on(SOCKET_NAME, async (message) => {
    if (!message?.type || !isActiveGM()) return;
    const fn = HANDLERS.get(message.type);
    if (!fn) return;
    try {
      await fn({ ...(message.payload ?? {}), userId: message.userId });
    } catch (err) {
      console.error(`${MODULE_ID} | socket handler "${message.type}" failed`, err);
    }
  });
}
