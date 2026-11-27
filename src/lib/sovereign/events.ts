// Typed, synchronous, crash-proof event bus for harness telemetry hooks.
// A throwing listener can never break generation: every handler runs inside its own try/catch.

import type { HarnessEventMap, HarnessEventName } from "./types";

type Handler<K extends HarnessEventName> = (payload: HarnessEventMap[K]) => void;

export class HarnessEventBus {
  private handlers = new Map<HarnessEventName, Set<Handler<HarnessEventName>>>();

  on<K extends HarnessEventName>(name: K, handler: Handler<K>): () => void {
    let set = this.handlers.get(name);
    if (!set) {
      set = new Set();
      this.handlers.set(name, set);
    }
    set.add(handler as Handler<HarnessEventName>);
    return () => this.off(name, handler);
  }

  off<K extends HarnessEventName>(name: K, handler: Handler<K>): void {
    this.handlers.get(name)?.delete(handler as Handler<HarnessEventName>);
  }

  /** Registers a one-shot listener. */
  once<K extends HarnessEventName>(name: K, handler: Handler<K>): () => void {
    const off = this.on(name, (p) => {
      off();
      handler(p);
    });
    return off;
  }

  emit<K extends HarnessEventName>(name: K, payload: HarnessEventMap[K]): void {
    const set = this.handlers.get(name);
    if (!set) return;
    for (const h of [...set]) {
      try {
        h(payload);
      } catch (e) {
        // Telemetry must never break the harness.
        if (typeof console !== "undefined") console.warn(`[zeus-harness] listener for ${name} threw`, e);
      }
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}

/** Singleton bus shared by the engine, the host bridge and the UI. */
export const harnessBus = new HarnessEventBus();
