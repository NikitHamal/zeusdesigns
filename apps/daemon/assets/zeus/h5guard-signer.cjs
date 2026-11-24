const fs = require('fs');
const path = require('path');
const vm = require('vm');

const GUARD_FILE = path.join(__dirname, 'h5guard.js');

function buildCtx() {
  const noop = () => {};
  const w = {
    location: { href: 'https://longcat.chat/t', host: 'longcat.chat', hostname: 'longcat.chat', protocol: 'https:', origin: 'https://longcat.chat', pathname: '/t', search: '', hash: '' },
    navigator: {
      userAgent: process.env.H5GUARD_UA || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
      language: 'en-US', languages: ['en-US', 'en'], platform: 'Win32', cookieEnabled: true, webdriver: false,
    },
    document: {
      cookie: '', referrer: '', title: 'LongCat AI',
      addEventListener: noop, removeEventListener: noop,
      createElement: () => ({ style: {}, setAttribute: noop, appendChild: noop, attachEvent: noop, getContext: () => null }),
      getElementsByTagName: () => [],
      documentElement: { style: {} },
      body: { appendChild: noop, style: {} },
      attachEvent: noop, hidden: false, visibilityState: 'visible',
    },
    screen: { width: 1920, height: 1080, colorDepth: 24, availWidth: 1920, availHeight: 1040 },
    history: { length: 2, pushState: noop, replaceState: noop },
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    sessionStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    crypto: require('crypto').webcrypto,
    performance: { now: () => Date.now(), timing: { navigationStart: Date.now() } },
    setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0, clearInterval: noop,
    console,
    XMLHttpRequest: function () { this.open = noop; this.send = noop; this.setRequestHeader = noop; this.addEventListener = noop; },
    Headers, Response, Request, URL, URLSearchParams, TextEncoder, TextDecoder,
    addEventListener: noop, removeEventListener: noop, attachEvent: noop,
  };
  w.fetch = async (input, init) => { captured.push({ input: String(input), init: JSON.parse(JSON.stringify(init || {})) }); return new Response("{}", { status: 200 }); };
  w.window = w; w.self = w; w.top = w;
  return vm.createContext(w);
}

let ctx = null;
let H5guard = null;
let captured = [];
let signQueue = Promise.resolve();

function loadGuard() {
  const code = fs.readFileSync(GUARD_FILE, 'utf8');
  ctx = buildCtx();
  vm.runInContext(code, ctx, { timeout: 20000 });
  H5guard = ctx.window.H5guard;
  H5guard.init({
    xhrHook: true,
    fetchHook: true,
    domains: ['longcat.chat', 'longcat.ai', 'www.longcat.ai'],
    openId: '',
    geo: false,
  });
}

async function signRequest(url, method, body) {
  captured.length = 0;
  const init = { method: method || 'POST', headers: { 'Content-Type': 'application/json' } };
  if (body && (method || 'POST').toUpperCase() !== 'GET') init.body = body;
  await ctx.window.fetch(url, init);
  if (!captured.length) throw new Error('hook did not fire');
  return { url: captured[0].input, headers: captured[0].init.headers || {} };
}


// In-process signer: lazily boots the H5guard SDK inside a vm context and signs
// requests serially. Returns { url, headers } carrying mtgsig + csec params.
let booted = false;
module.exports.sign = async function sign(url, method, body) {
  if (!booted) { loadGuard(); booted = true; }
  const job = signQueue.then(() => signRequest(url, method, body));
  signQueue = job.catch(() => undefined);
  return job;
};
