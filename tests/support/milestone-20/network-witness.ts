import type { M20NetworkAttemptWitnessPort } from "../../../services/knowledge-engine/src/index.js";

const AMBIENT_NETWORK_GLOBALS = Object.freeze([
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "EventSource",
  "WebTransport",
] as const);

export interface M20AmbientNetworkTrap {
  readonly witness: M20NetworkAttemptWitnessPort;
  readonly attemptedCalls: () => number;
  readonly wrappedGlobals: readonly string[];
  readonly restore: () => void;
}

export function installM20AmbientNetworkTrap(): M20AmbientNetworkTrap {
  let attempts = 0;
  const originals = new Map<string, PropertyDescriptor>();
  const wrapped: string[] = [];
  const target = globalThis as unknown as Record<string, unknown>;

  for (const name of AMBIENT_NETWORK_GLOBALS) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
    if (
      descriptor === undefined ||
      typeof target[name] !== "function" ||
      descriptor.configurable !== true
    ) {
      continue;
    }
    originals.set(name, descriptor);
    const reject = function networkCapabilityProhibited(): never {
      attempts += 1;
      throw new Error("M20_NETWORK_CAPABILITY_PROHIBITED");
    };
    Object.defineProperty(globalThis, name, {
      configurable: true,
      enumerable: descriptor.enumerable,
      writable: true,
      value: reject,
    });
    wrapped.push(name);
  }

  const witness = Object.freeze({
    readAttemptCount(): number {
      return attempts;
    },
  });
  let restored = false;
  return Object.freeze({
    witness,
    attemptedCalls: () => attempts,
    wrappedGlobals: Object.freeze(wrapped),
    restore() {
      if (restored) return;
      restored = true;
      for (const [name, descriptor] of originals)
        Object.defineProperty(globalThis, name, descriptor);
    },
  });
}
