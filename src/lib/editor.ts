// Element-level editing for artboards. The artboard iframe is sandboxed (no same-origin), so the editor runtime is
// injected into the document while an artboard is in edit mode and talks to the app through postMessage.
import { create } from "zustand";
import { useStore } from "../store";

export interface ElStyles {
  color: string; bg: string; fs: number; fw: string; ta: string; br: number; bw: number; bc: string; op: number;
  pt: number; pr: number; pb: number; pl: number; gap: number; display: string; fd: string; w: number; h: number;
  autoW: boolean; autoH: boolean;
}
export interface ElInfo {
  path: number[]; tag: string; cls: string; text: string | null; html: string; s: ElStyles;
}

interface EditorState {
  sel: ElInfo | null;
  artboardId: string | null;
  startHtml: string;
  stack: string[];
  lastPush: number;
  begin: (id: string, html: string) => void;
  end: () => void;
  setSel: (s: ElInfo | null) => void;
  record: (prev: string) => void;
}

export const useEditor = create<EditorState>((set, get) => ({
  sel: null, artboardId: null, startHtml: "", stack: [], lastPush: 0,
  begin: (id, html) => set({ artboardId: id, startHtml: html, stack: [], sel: null, lastPush: 0 }),
  end: () => set({ artboardId: null, sel: null, stack: [], startHtml: "" }),
  setSel: (sel) => set({ sel }),
  record: (prev) => {
    const now = Date.now();
    if (now - get().lastPush < 900) return;
    set((s) => ({ stack: [...s.stack.slice(-49), prev], lastPush: now }));
  },
}));

/* ---- bridge: the mounted edit-mode iframe registers itself here ---- */
let target: Window | null = null;
export const editorBridge = {
  attach(w: Window | null) { target = w; },
  post(msg: Record<string, unknown>) { target?.postMessage({ zeus: "cmd", ...msg }, "*"); },
};

export const editor = {
  style: (style: Record<string, string>) => editorBridge.post({ op: "style", style }),
  text: (text: string) => editorBridge.post({ op: "text", text }),
  del: () => editorBridge.post({ op: "delete" }),
  duplicate: () => editorBridge.post({ op: "duplicate" }),
  parent: () => editorBridge.post({ op: "parent" }),
  move: (dir: -1 | 1) => editorBridge.post({ op: "move", dir }),
  undo: () => {
    const { stack, artboardId } = useEditor.getState();
    if (!artboardId || !stack.length) return false;
    const prev = stack[stack.length - 1];
    useEditor.setState({ stack: stack.slice(0, -1), sel: null });
    useStore.getState().updateArtboard(artboardId, { html: prev });
    return true;
  },
  /** Finish editing; the whole session becomes one entry in version history. */
  finish() {
    const { artboardId, startHtml } = useEditor.getState();
    if (artboardId) {
      const st = useStore.getState();
      const cur = st.artboards.find((a) => a.id === artboardId);
      if (cur && cur.html !== startHtml) {
        st.updateArtboard(artboardId, { html: startHtml });
        st.reviseArtboard(artboardId, cur.html);
      }
    }
    useEditor.getState().end();
    useStore.getState().patchUI({ editId: null });
  },
};

/* ---- runtime injected into the artboard document ---- */
const EDIT_JS = String.raw`(function(){
var P=window.parent,sel=null,hov=null,timer=0,editing=null,ACC="#d97757";
var st=document.createElement("style");st.setAttribute("data-zeus-edit","");
st.textContent="[data-zhov]{outline:1.5px solid "+ACC+"!important;outline-offset:-1px}[data-zsel]{outline:2px solid "+ACC+"!important;outline-offset:-2px}*{cursor:default!important}[contenteditable=true]{cursor:text!important;outline:2px solid "+ACC+"!important}";
document.head.appendChild(st);
var lab=document.createElement("div");lab.setAttribute("data-zeus-edit","");
lab.style.cssText="position:absolute;z-index:2147483647;pointer-events:none;background:"+ACC+";color:#fff;font:600 11px/1 system-ui,sans-serif;padding:4px 7px;border-radius:6px;display:none;white-space:nowrap";
document.body.appendChild(lab);
function pathOf(el){var p=[];while(el&&el!==document.body){var par=el.parentElement;if(!par)return null;p.unshift(Array.prototype.indexOf.call(par.children,el));el=par}return p}
function byPath(p){var el=document.body;for(var i=0;i<p.length;i++){el=el.children[p[i]];if(!el)return null}return el}
function px(v){return parseFloat(v)||0}
function simpleText(el){if(!el.childNodes.length)return false;return Array.prototype.every.call(el.childNodes,function(n){return n.nodeType===3||n.nodeName==="BR"||(n.nodeType===1&&/^(B|I|EM|STRONG|SPAN|SMALL|A)$/.test(n.nodeName)&&n.children.length===0)})}
function info(el){var cs=getComputedStyle(el),r=el.getBoundingClientRect();
return{path:pathOf(el)||[],tag:el.tagName.toLowerCase(),cls:(el.getAttribute("class")||"").replace(/\s+/g," ").trim().slice(0,60),
text:simpleText(el)?el.textContent.slice(0,600):null,html:el.outerHTML.replace(/ data-z(?:sel|hov)=""/g,"").slice(0,700),
s:{color:cs.color,bg:cs.backgroundColor,fs:px(cs.fontSize),fw:cs.fontWeight,ta:cs.textAlign,br:px(cs.borderTopLeftRadius),bw:px(cs.borderTopWidth),bc:cs.borderTopColor,op:cs.opacity===""?1:parseFloat(cs.opacity),
pt:px(cs.paddingTop),pr:px(cs.paddingRight),pb:px(cs.paddingBottom),pl:px(cs.paddingLeft),gap:px(cs.columnGap)||px(cs.rowGap),display:cs.display,fd:cs.flexDirection,
w:Math.round(r.width),h:Math.round(r.height),autoW:!el.style.width,autoH:!el.style.height}}}
function place(){if(!sel||!document.body.contains(sel)){lab.style.display="none";return}
var r=sel.getBoundingClientRect(),sx=window.scrollX,sy=window.scrollY;
lab.textContent=sel.tagName.toLowerCase()+(sel.className&&typeof sel.className==="string"?"."+sel.className.trim().split(/\s+/)[0]:"")+"  "+Math.round(r.width)+" x "+Math.round(r.height);
lab.style.display="block";lab.style.left=Math.max(0,r.left+sx)+"px";lab.style.top=Math.max(0,r.top+sy-22)+"px"}
function pick(el){if(sel)sel.removeAttribute("data-zsel");sel=el;if(el){el.setAttribute("data-zsel","");}place();
P.postMessage({zeus:"edit",type:"select",info:el?info(el):null},"*")}
function ser(){var c=document.documentElement.cloneNode(true);
c.querySelectorAll("[data-zeus-edit]").forEach(function(n){n.remove()});
c.querySelectorAll("[data-zsel],[data-zhov]").forEach(function(n){n.removeAttribute("data-zsel");n.removeAttribute("data-zhov")});
c.querySelectorAll("[contenteditable]").forEach(function(n){n.removeAttribute("contenteditable")});
c.querySelectorAll('[style=""]').forEach(function(n){n.removeAttribute("style")});
return"<!doctype html>"+c.outerHTML}
var prev=null;
function emit(){clearTimeout(timer);timer=setTimeout(function(){P.postMessage({zeus:"edit",type:"html",html:ser()},"*")},160)}
function touched(){emit();place();if(sel)P.postMessage({zeus:"edit",type:"select",info:info(sel)},"*")}
function target(e){var t=e.target;if(t===document.documentElement)t=document.body;if(t&&t.closest&&t.closest("[data-zeus-edit]"))return null;return t&&t.nodeType===1?t:null}
document.addEventListener("mouseover",function(e){var t=target(e);if(hov)hov.removeAttribute("data-zhov");hov=t;if(t&&t!==sel)t.setAttribute("data-zhov","")},true);
document.addEventListener("mouseout",function(e){if(hov){hov.removeAttribute("data-zhov");hov=null}},true);
document.addEventListener("click",function(e){if(editing&&e.target===editing)return;var t=target(e);e.preventDefault();e.stopPropagation();if(editing)endEdit();if(t){if(hov){hov.removeAttribute("data-zhov")}pick(t)}},true);
["mousedown","mouseup","pointerdown","submit","dragstart","auxclick"].forEach(function(n){document.addEventListener(n,function(e){if(editing&&e.target===editing)return;if(n==="submit"||n==="dragstart"||n==="auxclick")e.preventDefault();if(n!=="pointerdown"&&n!=="mousedown"&&n!=="mouseup")return;e.stopPropagation()},true)});
function endEdit(){if(!editing)return;editing.removeAttribute("contenteditable");editing=null;touched()}
document.addEventListener("dblclick",function(e){var t=target(e);if(!t||!simpleText(t))return;e.preventDefault();endEdit();editing=t;t.setAttribute("contenteditable","true");t.focus();var r=document.createRange();r.selectNodeContents(t);var s=getSelection();s.removeAllRanges();s.addRange(r)},true);
document.addEventListener("input",function(){emit();place();if(sel&&sel===editing)P.postMessage({zeus:"edit",type:"select",info:info(sel)},"*")},true);
document.addEventListener("keydown",function(e){
if(editing){if(e.key==="Escape"||(e.key==="Enter"&&!e.shiftKey)){e.preventDefault();endEdit()}return}
var mod=e.ctrlKey||e.metaKey;
if(mod&&e.key.toLowerCase()==="z"){e.preventDefault();P.postMessage({zeus:"edit",type:"undo"},"*");return}
if(!sel)return;
if(e.key==="Delete"||e.key==="Backspace"){e.preventDefault();run({op:"delete"})}
else if(mod&&e.key.toLowerCase()==="d"){e.preventDefault();run({op:"duplicate"})}
else if(e.key==="Escape"){pick(null)}
else if(e.key==="ArrowUp"&&e.altKey){e.preventDefault();run({op:"parent"})}
},true);
window.addEventListener("scroll",place,true);window.addEventListener("resize",place);
function run(d){var el=sel;if(!el||!document.body.contains(el))return;
if(d.op==="style"){for(var k in d.style){var v=d.style[k];if(v===""||v==null)el.style.removeProperty(k);else el.style.setProperty(k,v)}touched()}
else if(d.op==="text"){el.textContent=d.text;touched()}
else if(d.op==="delete"){if(el===document.body)return;var par=el.parentElement;el.remove();sel=null;lab.style.display="none";P.postMessage({zeus:"edit",type:"select",info:null},"*");emit();if(par&&par!==document.body)pick(par)}
else if(d.op==="duplicate"){if(el===document.body)return;var c=el.cloneNode(true);c.removeAttribute("data-zsel");c.removeAttribute("data-zhov");el.after(c);pick(c);emit()}
else if(d.op==="parent"){var p=el.parentElement;if(p&&p!==document.documentElement)pick(p)}
else if(d.op==="move"){var s=d.dir<0?el.previousElementSibling:el.nextElementSibling;if(!s||s.hasAttribute("data-zeus-edit")||s.tagName==="SCRIPT")return;if(d.dir<0)s.before(el);else s.after(el);pick(el);emit()}}
window.addEventListener("message",function(e){var d=e.data;if(d&&d.zeus==="cmd")run(d)});
P.postMessage({zeus:"edit",type:"ready"},"*");
})();`;

export function injectEditor(html: string): string {
  const tag = `<script data-zeus-edit>${EDIT_JS}</script>`;
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, tag + "</body>") : html + tag;
}
