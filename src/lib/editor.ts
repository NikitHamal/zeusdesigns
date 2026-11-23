// Element-level visual DOM editor for artboards (Figma / Onlook style).
// The artboard iframe is sandboxed, so the editor runtime is injected into the document while an artboard is in edit mode
// and communicates with the host app through postMessage.
import { create } from "zustand";
import { useStore } from "../store";
import { getDS } from "./designSystems";
import { harden } from "./harness";

export interface ElStyles {
  color: string; bg: string; fs: number; fw: string; ff: string; ta: string;
  br: number; bw: number; bc: string; op: number;
  pt: number; pr: number; pb: number; pl: number;
  mt: number; mb: number;
  gap: number; display: string; fd: string; jc: string; ai: string;
  w: number; h: number; wMode: "auto" | "fill" | "fixed"; hMode: "auto" | "fill" | "fixed";
  autoW: boolean; autoH: boolean;
}

export interface ElInfo {
  path: number[];
  tag: string;
  cls: string;
  text: string | null;
  hasIcon: boolean;
  html: string;
  outerHtml: string;
  s: ElStyles;
}

export interface LayerNode {
  path: number[];
  tag: string;
  cls: string;
  label: string;
  hidden: boolean;
  children: LayerNode[];
}

export type InspectorTab = "design" | "insert" | "layers" | "code";

interface EditorState {
  sel: ElInfo | null;
  tree: LayerNode[];
  artboardId: string | null;
  tab: InspectorTab;
  insertOpen: boolean;
  leftRailOpen: boolean;
  draggingBlockId: string | null;
  startHtml: string;
  stack: string[];
  redoStack: string[];
  lastPush: number;
  begin: (id: string, html: string, tab?: InspectorTab) => void;
  end: () => void;
  setSel: (s: ElInfo | null) => void;
  setTree: (t: LayerNode[]) => void;
  setTab: (t: InspectorTab) => void;
  setInsertOpen: (open: boolean) => void;
  setLeftRailOpen: (open: boolean) => void;
  setDraggingBlockId: (id: string | null) => void;
  record: (prev: string) => void;
}

export const useEditor = create<EditorState>((set, get) => ({
  sel: null,
  tree: [],
  artboardId: null,
  tab: "design",
  insertOpen: false,
  leftRailOpen: false,
  draggingBlockId: null,
  startHtml: "",
  stack: [],
  redoStack: [],
  lastPush: 0,
  begin: (id, html, tab = "design") =>
    set({ artboardId: id, startHtml: html, stack: [], redoStack: [], sel: null, tree: [], lastPush: 0, tab }),
  end: () => set({ artboardId: null, sel: null, tree: [], stack: [], redoStack: [], startHtml: "", draggingBlockId: null }),
  setSel: (sel) => set({ sel }),
  setTree: (tree) => set({ tree }),
  setTab: (tab) => set({ tab }),
  setInsertOpen: (insertOpen) => set({ insertOpen }),
  setLeftRailOpen: (leftRailOpen) => set({ leftRailOpen }),
  setDraggingBlockId: (draggingBlockId) => set({ draggingBlockId }),
  record: (prev) => {
    const now = Date.now();
    if (now - get().lastPush < 450) return;
    set((s) => ({ stack: [...s.stack.slice(-49), prev], redoStack: [], lastPush: now }));
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
  selectPath: (path: number[]) => editorBridge.post({ op: "selectPath", path }),
  toggleHide: (path: number[]) => editorBridge.post({ op: "toggleHide", path }),
  deletePath: (path: number[]) => editorBridge.post({ op: "deletePath", path }),
  duplicatePath: (path: number[]) => editorBridge.post({ op: "duplicatePath", path }),
  movePath: (path: number[], dir: -1 | 1) => editorBridge.post({ op: "movePath", path, dir }),
  toggleClass: (cls: string, exclusiveGroup?: string[]) => editorBridge.post({ op: "toggleClass", cls, exclusiveGroup }),
  swapIcon: (iconName: string) => {
    const ds = getDS(useStore.getState().settings.designSystemId);
    const wrapped = harden(`<body><i data-i="${iconName}"></i></body>`, ds, { partial: true }).html;
    const svg = /<svg[\s\S]*?<\/svg>/i.exec(wrapped)?.[0];
    if (svg) editorBridge.post({ op: "swapIcon", svg });
  },
  wrap: (dir: "row" | "column" | "card") => editorBridge.post({ op: "wrap", dir }),
  replaceHtml: (html: string) => editorBridge.post({ op: "replaceHtml", html }),
  insertHtml: (html: string, where: "after" | "inside" | "append" = "after") => {
    const ds = getDS(useStore.getState().settings.designSystemId);
    // Resolve <i data-i="..."> icons before injecting into the live DOM
    const wrapped = harden(`<body>${html}</body>`, ds, { partial: true }).html;
    const inner = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(wrapped)?.[1] ?? html;
    editorBridge.post({ op: "insertHtml", html: inner, where });
  },
  undo: () => {
    const { stack, redoStack, artboardId } = useEditor.getState();
    if (!artboardId || !stack.length) return false;
    const cur = useStore.getState().artboards.find((a) => a.id === artboardId);
    const prev = stack[stack.length - 1];
    useEditor.setState({
      stack: stack.slice(0, -1),
      redoStack: cur ? [...redoStack, cur.html] : redoStack,
      sel: null,
    });
    useStore.getState().updateArtboard(artboardId, { html: prev });
    return true;
  },
  redo: () => {
    const { stack, redoStack, artboardId } = useEditor.getState();
    if (!artboardId || !redoStack.length) return false;
    const cur = useStore.getState().artboards.find((a) => a.id === artboardId);
    const next = redoStack[redoStack.length - 1];
    useEditor.setState({
      redoStack: redoStack.slice(0, -1),
      stack: cur ? [...stack, cur.html] : stack,
      sel: null,
    });
    useStore.getState().updateArtboard(artboardId, { html: next });
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
st.textContent="[data-zhov]{outline:1.5px dashed "+ACC+"!important;outline-offset:-1px}[data-zsel]{outline:2px solid "+ACC+"!important;outline-offset:-2px}*{cursor:default!important}[contenteditable=true]{cursor:text!important;outline:2px solid "+ACC+"!important}";
document.head.appendChild(st);
var lab=document.createElement("div");lab.setAttribute("data-zeus-edit","");
lab.style.cssText="position:absolute;z-index:2147483647;pointer-events:auto;background:"+ACC+";color:#fff;font:600 10.5px/1 system-ui,sans-serif;padding:3px 6px;border-radius:6px;display:none;white-space:nowrap;align-items:center;gap:4px";
var dropLine=document.createElement("div");dropLine.setAttribute("data-zeus-edit","");
dropLine.style.cssText="position:absolute;z-index:2147483647;pointer-events:none;display:none;background:"+ACC+";height:3px;border-radius:2px";
document.body.appendChild(dropLine);
var grip=document.createElement("span");grip.setAttribute("data-zeus-edit","");grip.textContent="⠿";grip.title="Drag to reorder element";
grip.style.cssText="cursor:grab!important;padding:1px 3px;border-radius:3px;background:rgba(255,255,255,0.22);font:700 11px/1 system-ui,sans-serif";
grip.addEventListener("pointerdown",function(ev){
  ev.preventDefault();ev.stopPropagation();
  if(!sel||sel===document.body)return;
  var dropTarget=null,dropAfter=true;
  function mv(e2){
    var elAt=document.elementFromPoint(e2.clientX,e2.clientY);
    if(!elAt||elAt===sel||sel.contains(elAt)||elAt.closest("[data-zeus-edit]")){dropLine.style.display="none";dropTarget=null;return}
    var cand=elAt;
    while(cand&&cand.parentElement&&cand.parentElement!==sel.parentElement&&cand!==document.body){
      if(cand.parentElement===sel.parentElement)break;
      cand=cand.parentElement;
    }
    if(!cand||cand===document.body||cand===sel||sel.contains(cand)){dropLine.style.display="none";dropTarget=null;return}
    dropTarget=cand;
    var r=cand.getBoundingClientRect(),sx=window.scrollX,sy=window.scrollY;
    dropAfter=(e2.clientY-r.top)>(r.height/2);
    dropLine.style.display="block";
    dropLine.style.left=(r.left+sx)+"px";
    dropLine.style.width=Math.max(24,r.width)+"px";
    dropLine.style.top=(dropAfter?(r.bottom+sy):(r.top+sy-3))+"px";
  }
  function up(){
    window.removeEventListener("pointermove",mv);window.removeEventListener("pointerup",up);
    dropLine.style.display="none";
    if(dropTarget&&sel&&dropTarget!==sel&&!sel.contains(dropTarget)){
      if(dropAfter)dropTarget.after(sel);else dropTarget.before(sel);
      pick(sel);touched();
    }
  }
  window.addEventListener("pointermove",mv);window.addEventListener("pointerup",up);
});
lab.appendChild(grip);
var labTxt=document.createElement("span");labTxt.setAttribute("data-zeus-edit","");lab.appendChild(labTxt);
function mkAct(txt,title,fn){
  var b=document.createElement("button");b.setAttribute("data-zeus-edit","");b.type="button";b.textContent=txt;b.title=title;
  b.style.cssText="all:unset;cursor:pointer!important;padding:2px 4px;border-radius:4px;background:rgba(255,255,255,0.18);color:#fff;font:700 10px/1 system-ui,sans-serif";
  b.addEventListener("click",function(ev){ev.preventDefault();ev.stopPropagation();fn()});
  lab.appendChild(b);
}
mkAct("↑","Move up ([)",function(){run({op:"move",dir:-1})});
mkAct("↓","Move down (])",function(){run({op:"move",dir:1})});
mkAct("+Txt","Insert text after",function(){run({op:"insertHtml",html:'<div class="z-sub" style="font-size:14px;color:var(--text)">New text label</div>',where:"after"})});
mkAct("+Btn","Insert button after",function(){run({op:"insertHtml",html:'<button class="z-btn sm">Action</button>',where:"after"})});
mkAct("⊞Row","Wrap Auto-Layout Row (Shift+A)",function(){run({op:"wrap",dir:"row"})});
mkAct("⊞Col","Wrap Auto-Layout Column",function(){run({op:"wrap",dir:"column"})});
mkAct("⧉","Duplicate (Ctrl+D)",function(){run({op:"duplicate"})});
mkAct("✕","Delete (Del)",function(){run({op:"delete"})});
document.body.appendChild(lab);
var box=document.createElement("div");box.setAttribute("data-zeus-edit","");
box.style.cssText="position:absolute;z-index:2147483646;pointer-events:none;display:none;border:1.5px solid "+ACC;
["n","s","e","w","ne","nw","se","sw"].forEach(function(dir){
  var h=document.createElement("div");h.setAttribute("data-zeus-edit","");h.dataset.dir=dir;
  var pos=
    dir==="e"?"right:-5px;top:50%;transform:translateY(-50%);cursor:ew-resize":
    dir==="w"?"left:-5px;top:50%;transform:translateY(-50%);cursor:ew-resize":
    dir==="s"?"bottom:-5px;left:50%;transform:translateX(-50%);cursor:ns-resize":
    dir==="n"?"top:-5px;left:50%;transform:translateX(-50%);cursor:ns-resize":
    dir==="se"?"right:-5px;bottom:-5px;cursor:nwse-resize":
    dir==="nw"?"left:-5px;top:-5px;cursor:nwse-resize":
    dir==="ne"?"right:-5px;top:-5px;cursor:nesw-resize":
    "left:-5px;bottom:-5px;cursor:nesw-resize";
  h.style.cssText="position:absolute;width:8px;height:8px;border-radius:2px;background:#fff;border:1.5px solid "+ACC+";pointer-events:auto;"+pos;
  h.addEventListener("pointerdown",function(ev){
    ev.preventDefault();ev.stopPropagation();
    if(!sel)return;
    var r0=sel.getBoundingClientRect(),x0=ev.clientX,y0=ev.clientY;
    function mv(e2){
      if(!sel)return;
      var dx=e2.clientX-x0,dy=e2.clientY-y0;
      if(dir.indexOf("e")>=0)sel.style.width=Math.max(24,Math.round(r0.width+dx))+"px";
      if(dir.indexOf("w")>=0)sel.style.width=Math.max(24,Math.round(r0.width-dx))+"px";
      if(dir.indexOf("s")>=0)sel.style.height=Math.max(20,Math.round(r0.height+dy))+"px";
      if(dir.indexOf("n")>=0)sel.style.height=Math.max(20,Math.round(r0.height-dy))+"px";
      place();
    }
    function up(){window.removeEventListener("pointermove",mv);window.removeEventListener("pointerup",up);touched()}
    window.addEventListener("pointermove",mv);window.addEventListener("pointerup",up);
  });
  box.appendChild(h);
});
document.body.appendChild(box);
function pathOf(el){var p=[];while(el&&el!==document.body){var par=el.parentElement;if(!par)return null;p.unshift(Array.prototype.indexOf.call(par.children,el));el=par}return p}
function byPath(p){var el=document.body;for(var i=0;i<p.length;i++){el=el.children[p[i]];if(!el)return null}return el}
function px(v){return parseFloat(v)||0}
function simpleText(el){if(!el.childNodes.length)return false;return Array.prototype.every.call(el.childNodes,function(n){return n.nodeType===3||n.nodeName==="BR"||(n.nodeType===1&&/^(B|I|EM|STRONG|SPAN|SMALL|A)$/.test(n.nodeName)&&n.children.length===0)})}
function cleanOuter(el){var c=el.cloneNode(true);c.removeAttribute("data-zsel");c.removeAttribute("data-zhov");c.removeAttribute("contenteditable");if(c.querySelectorAll){c.querySelectorAll("[data-zsel],[data-zhov],[contenteditable]").forEach(function(n){n.removeAttribute("data-zsel");n.removeAttribute("data-zhov");n.removeAttribute("contenteditable")})}return c.outerHTML}
function info(el){var cs=getComputedStyle(el),r=el.getBoundingClientRect(),sw=el.style.width||"",sh=el.style.height||"";
var clean=cleanOuter(el);
var hasIc=el.tagName.toLowerCase()==="svg"||!!(el.querySelector&&el.querySelector("svg.z-i,svg"));
return{path:pathOf(el)||[],tag:el.tagName.toLowerCase(),cls:(el.getAttribute("class")||"").replace(/\s+/g," ").trim().slice(0,80),
text:simpleText(el)?el.textContent.slice(0,600):null,hasIcon:hasIc,html:clean.slice(0,700),outerHtml:clean.slice(0,8000),
s:{color:cs.color,bg:cs.backgroundColor,fs:px(cs.fontSize),fw:cs.fontWeight,ff:cs.fontFamily,ta:cs.textAlign,
br:px(cs.borderTopLeftRadius),bw:px(cs.borderTopWidth),bc:cs.borderTopColor,op:cs.opacity===""?1:parseFloat(cs.opacity),
pt:px(cs.paddingTop),pr:px(cs.paddingRight),pb:px(cs.paddingBottom),pl:px(cs.paddingLeft),
mt:px(cs.marginTop),mb:px(cs.marginBottom),
gap:px(cs.columnGap)||px(cs.rowGap),display:cs.display,fd:cs.flexDirection,jc:cs.justifyContent,ai:cs.alignItems,
w:Math.round(r.width),h:Math.round(r.height),
wMode:sw==="100%"?"fill":sw&&sw!=="auto"&&sw!=="fit-content"?"fixed":"auto",
hMode:sh==="100%"?"fill":sh&&sh!=="auto"&&sh!=="fit-content"?"fixed":"auto",
autoW:!sw||sw==="auto"||sw==="fit-content",autoH:!sh||sh==="auto"||sh==="fit-content"}}}
function buildTree(root,depth){
  if(depth>6)return[];
  var out=[];
  var ch=root.children;
  for(var i=0;i<ch.length;i++){
    var el=ch[i];
    if(el.hasAttribute("data-zeus-edit")||el.tagName==="SCRIPT"||el.tagName==="STYLE")continue;
    var tag=el.tagName.toLowerCase();
    var cls=(el.getAttribute("class")||"").trim().split(/\s+/).filter(Boolean)[0]||"";
    var txt=simpleText(el)?(el.textContent||"").trim().slice(0,28):"";
    var label=txt?txt:(cls?"."+cls:tag);
    out.push({path:pathOf(el)||[],tag:tag,cls:cls,label:label,hidden:el.style.display==="none",children:buildTree(el,depth+1)});
  }
  return out;
}
function sendTree(){P.postMessage({zeus:"edit",type:"tree",tree:buildTree(document.body,0)},"*")}
function place(){if(!sel||!document.body.contains(sel)||sel===document.body){lab.style.display="none";box.style.display="none";return}
var r=sel.getBoundingClientRect(),sx=window.scrollX,sy=window.scrollY;
labTxt.textContent=sel.tagName.toLowerCase()+(sel.className&&typeof sel.className==="string"&&sel.className.trim()?"."+sel.className.trim().split(/\s+/)[0]:"")+" · "+Math.round(r.width)+"×"+Math.round(r.height);
lab.style.display="inline-flex";lab.style.left=Math.max(0,r.left+sx)+"px";lab.style.top=Math.max(0,r.top+sy-24)+"px";
box.style.display="block";box.style.left=(r.left+sx)+"px";box.style.top=(r.top+sy)+"px";box.style.width=Math.max(4,r.width)+"px";box.style.height=Math.max(4,r.height)+"px"}
function pick(el){if(sel)sel.removeAttribute("data-zsel");sel=el;if(el&&el!==document.body){el.setAttribute("data-zsel","");}place();
P.postMessage({zeus:"edit",type:"select",info:el&&el!==document.body?info(el):null},"*")}
function ser(){var c=document.documentElement.cloneNode(true);
c.querySelectorAll("[data-zeus-edit]").forEach(function(n){n.remove()});
c.querySelectorAll("[data-zsel],[data-zhov]").forEach(function(n){n.removeAttribute("data-zsel");n.removeAttribute("data-zhov")});
c.querySelectorAll("[contenteditable]").forEach(function(n){n.removeAttribute("contenteditable")});
c.querySelectorAll('[style=""]').forEach(function(n){n.removeAttribute("style")});
return"<!doctype html>"+c.outerHTML}
function emit(){clearTimeout(timer);timer=setTimeout(function(){P.postMessage({zeus:"edit",type:"html",html:ser()},"*");sendTree()},120)}
function touched(){emit();place();if(sel&&sel!==document.body)P.postMessage({zeus:"edit",type:"select",info:info(sel)},"*")}
function target(e){var t=e.target;if(t===document.documentElement)t=document.body;if(t&&t.closest&&t.closest("[data-zeus-edit]"))return null;if(t&&t.closest){var sv=t.closest("svg");if(sv)return sv}return t&&t.nodeType===1?t:null}
document.addEventListener("mouseover",function(e){var t=target(e);if(hov)hov.removeAttribute("data-zhov");hov=t;if(t&&t!==sel&&t!==document.body)t.setAttribute("data-zhov","")},true);
document.addEventListener("mouseout",function(e){if(hov){hov.removeAttribute("data-zhov");hov=null}},true);
document.addEventListener("click",function(e){if(editing&&e.target===editing)return;var t=target(e);if(!t)return;e.preventDefault();e.stopPropagation();if(editing)endEdit();if(hov)hov.removeAttribute("data-zhov");pick(t)},true);
["mousedown","mouseup","pointerdown","submit","dragstart","auxclick"].forEach(function(n){document.addEventListener(n,function(e){if(e.target&&e.target.closest&&e.target.closest("[data-zeus-edit]"))return;if(editing&&e.target===editing)return;if(n==="submit"||n==="dragstart"||n==="auxclick")e.preventDefault();if(n!=="pointerdown"&&n!=="mousedown"&&n!=="mouseup")return;e.stopPropagation()},true)});
function endEdit(){if(!editing)return;editing.removeAttribute("contenteditable");editing=null;touched()}
document.addEventListener("dblclick",function(e){var t=target(e);if(!t||!simpleText(t))return;e.preventDefault();endEdit();editing=t;t.setAttribute("contenteditable","true");t.focus();var r=document.createRange();r.selectNodeContents(t);var s=getSelection();s.removeAllRanges();s.addRange(r)},true);
document.addEventListener("input",function(){emit();place();if(sel&&sel===editing)P.postMessage({zeus:"edit",type:"select",info:info(sel)},"*")},true);
document.addEventListener("keydown",function(e){
if(editing){if(e.key==="Escape"||(e.key==="Enter"&&!e.shiftKey)){e.preventDefault();endEdit()}return}
var mod=e.ctrlKey||e.metaKey;
if(mod&&e.key.toLowerCase()==="z"){e.preventDefault();P.postMessage({zeus:"edit",type:e.shiftKey?"redo":"undo"},"*");return}
if(mod&&e.key.toLowerCase()==="y"){e.preventDefault();P.postMessage({zeus:"edit",type:"redo"},"*");return}
if(!sel||sel===document.body)return;
if(e.shiftKey&&e.key.toLowerCase()==="a"){e.preventDefault();var cs0=getComputedStyle(sel);if(/flex/.test(cs0.display)){sel.style.flexDirection=cs0.flexDirection==="column"?"row":"column";touched()}else{run({op:"wrap",dir:"row"})}return}
if(mod&&e.key.toLowerCase()==="g"){e.preventDefault();run({op:"wrap",dir:"card"});return}
if(e.key==="["){e.preventDefault();run({op:"move",dir:-1});return}
if(e.key==="]"){e.preventDefault();run({op:"move",dir:1});return}
if(e.key==="Enter"){e.preventDefault();if(simpleText(sel)){editing=sel;sel.setAttribute("contenteditable","true");sel.focus()}else if(sel.firstElementChild){pick(sel.firstElementChild)}return}
if(e.key==="Delete"||e.key==="Backspace"){e.preventDefault();run({op:"delete"})}
else if(mod&&e.key.toLowerCase()==="d"){e.preventDefault();run({op:"duplicate"})}
else if(e.key==="Escape"){pick(null)}
else if(e.key==="ArrowUp"&&e.altKey){e.preventDefault();run({op:"parent"})}
else if(e.key==="ArrowUp"&&!e.altKey){e.preventDefault();run({op:"move",dir:-1})}
else if(e.key==="ArrowDown"&&!e.altKey){e.preventDefault();run({op:"move",dir:1})}
},true);
window.addEventListener("scroll",place,true);window.addEventListener("resize",place);
function run(d){
  if(d.op==="selectPath"){var n=byPath(d.path||[]);if(n){pick(n);n.scrollIntoView({block:"nearest",behavior:"smooth"})}return}
  if(d.op==="toggleHide"){var h=byPath(d.path||[]);if(h){h.style.display=h.style.display==="none"?"":"none";touched()}return}
  if(d.op==="deletePath"){var dp=byPath(d.path||[]);if(dp&&dp!==document.body){var par0=dp.parentElement;dp.remove();if(sel===dp){sel=null;lab.style.display="none";box.style.display="none";P.postMessage({zeus:"edit",type:"select",info:null},"*")}emit();if(par0&&par0!==document.body)pick(par0)}return}
  if(d.op==="duplicatePath"){var dup=byPath(d.path||[]);if(dup&&dup!==document.body){var cl=dup.cloneNode(true);cl.removeAttribute("data-zsel");cl.removeAttribute("data-zhov");dup.after(cl);pick(cl);emit()}return}
  if(d.op==="movePath"){var mp=byPath(d.path||[]);if(mp&&mp!==document.body){var sb=d.dir<0?mp.previousElementSibling:mp.nextElementSibling;if(sb&&!sb.hasAttribute("data-zeus-edit")&&sb.tagName!=="SCRIPT"&&sb.tagName!=="STYLE"){if(d.dir<0)sb.before(mp);else sb.after(mp);pick(mp);emit()}}return}
  if(d.op==="insertHtml"){
    document.querySelectorAll("[data-zeus-empty-frame]").forEach(function(x){x.remove()});
    var tmp=document.createElement("div");tmp.innerHTML=d.html||"";
    var node=tmp.firstElementChild;if(!node)return;
    if(sel&&sel!==document.body&&document.body.contains(sel)&&d.where!=="append"){
      if(d.where==="inside")sel.appendChild(node);
      else sel.after(node);
    }else{
      var page=document.querySelector(".z-page,.z-main,.scroll,main,.z-screen")||document.body;
      page.appendChild(node);
    }
    pick(node);touched();return;
  }
  var el=sel;if(!el||!document.body.contains(el))return;
  if(d.op==="style"){for(var k in d.style){var v=d.style[k];if(v===""||v==null)el.style.removeProperty(k);else el.style.setProperty(k,v)}touched()}
  else if(d.op==="text"){el.textContent=d.text;touched()}
  else if(d.op==="toggleClass"){
    if(Array.isArray(d.exclusiveGroup))d.exclusiveGroup.forEach(function(c){if(c)el.classList.remove(c)});
    if(d.cls){if(Array.isArray(d.exclusiveGroup))el.classList.add(d.cls);else el.classList.toggle(d.cls)}
    touched();
  }
  else if(d.op==="swapIcon"){
    var targetSvg=el.tagName.toLowerCase()==="svg"?el:(el.querySelector&&el.querySelector("svg.z-i,svg"));
    if(targetSvg&&d.svg){
      var t3=document.createElement("div");t3.innerHTML=d.svg;
      var newSvg=t3.firstElementChild;
      if(newSvg){
        var oldCls=targetSvg.getAttribute("class");
        if(oldCls)newSvg.setAttribute("class",oldCls);
        targetSvg.replaceWith(newSvg);
        if(el===targetSvg)pick(newSvg);else touched();
      }
    }
  }
  else if(d.op==="replaceHtml"){
    if(el===document.body)return;
    var t2=document.createElement("div");t2.innerHTML=d.html||"";
    var rep=t2.firstElementChild;if(!rep)return;
    el.replaceWith(rep);pick(rep);touched();
  }
  else if(d.op==="wrap"){
    if(el===document.body)return;
    var w=document.createElement("div");
    w.className=d.dir==="card"?"z-card z-col":d.dir==="column"?"z-col":"z-row z-between";
    el.before(w);w.appendChild(el);pick(w);touched();
  }
  else if(d.op==="delete"){if(el===document.body)return;var par=el.parentElement;el.remove();sel=null;lab.style.display="none";box.style.display="none";P.postMessage({zeus:"edit",type:"select",info:null},"*");emit();if(par&&par!==document.body)pick(par)}
  else if(d.op==="duplicate"){if(el===document.body)return;var c=el.cloneNode(true);c.removeAttribute("data-zsel");c.removeAttribute("data-zhov");el.after(c);pick(c);emit()}
  else if(d.op==="parent"){var p=el.parentElement;if(p&&p!==document.documentElement&&p!==document.body)pick(p)}
  else if(d.op==="move"){var s=d.dir<0?el.previousElementSibling:el.nextElementSibling;if(!s||s.hasAttribute("data-zeus-edit")||s.tagName==="SCRIPT"||s.tagName==="STYLE")return;if(d.dir<0)s.before(el);else s.after(el);pick(el);emit()}
}
window.addEventListener("message",function(e){var d=e.data;if(d&&d.zeus==="cmd")run(d)});
P.postMessage({zeus:"edit",type:"ready"},"*");
sendTree();
})();`;

export function injectEditor(html: string): string {
  const tag = `<script data-zeus-edit>${EDIT_JS}</script>`;
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, tag + "</body>") : html + tag;
}
