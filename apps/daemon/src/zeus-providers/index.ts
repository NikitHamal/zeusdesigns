import { chatjimmy } from './chatjimmy.js';
import { deepai } from './deepai.js';
import { geminiweb } from './geminiweb.js';
import { k2horizon } from './k2horizon.js';
import { longcat } from './longcat.js';
import { mercury3 } from './mercury.js';
import { motif } from './motif.js';
import { qwen } from './qwen.js';
import type { ZeusProvider } from './types.js';

// Keyless, free providers shipped with Zeus Codes. Order is the picker order.
export const ZEUS_PROVIDERS: readonly ZeusProvider[] = [
  mercury3,
  chatjimmy,
  qwen,
  k2horizon,
  motif,
  deepai,
  longcat,
  geminiweb,
];

export const ZEUS_PROVIDER_MAP: ReadonlyMap<string, ZeusProvider> = new Map(
  ZEUS_PROVIDERS.map((p) => [p.id, p]),
);

export * from './types.js';
