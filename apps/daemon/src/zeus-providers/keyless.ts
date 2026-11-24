import { ZEUS_PROVIDER_MAP } from './index.js';

// Placeholder bearer for the loopback gateway; it never leaves the machine.
export const ZEUS_KEYLESS_TOKEN = 'zeus-keyless';

// True for http://127.0.0.1:<gateway port>/<provider>/v1 base URLs.
export function isZeusGatewayUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  try {
    const u = new URL(value);
    const host = u.hostname.toLowerCase();
    if (host !== '127.0.0.1' && host !== 'localhost' && host !== '[::1]') return false;
    const base = Number(process.env.OD_ZEUS_PORT) || 17873;
    const port = Number(u.port);
    if (!(port >= base && port < base + 10)) return false;
    const id = u.pathname.split('/').filter(Boolean)[0];
    return !!id && ZEUS_PROVIDER_MAP.has(id);
  } catch {
    return false;
  }
}
