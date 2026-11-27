// Sandbox-side bridge (Pillars 5 and 6). Injected into every preview iframe at render time, never persisted.
//
// Upstream  (sandbox -> host): { zeus: "sov", v: 1, type, boardId, ... }
//   ZEUS_RUNTIME_ERROR   { error: RuntimeErrorPayload }
//   ZEUS_PREVIEW_READY   { errors: number }
//   ZEUS_ELEMENT_SELECTED{ element }
//   ZEUS_INSPECT_MODE    { on: boolean }           (the sandbox turned inspect off, e.g. Escape)
// Downstream (host -> sandbox): { zeus: "sov-cmd", type: "ZEUS_INSPECT_MODE", on: boolean }
//
// The script is ES5 on purpose (runs in any WebView), uses no template literals, and tags every node it adds with
// data-zeus-edit so the editor, the serializer and stripKitBoilerplate all ignore it.

const BRIDGE_SOURCE = `(function(){
if(window.__zeusSov)return;window.__zeusSov=true;
var BID=__BID__;var CH="sov",CMD="sov-cmd";
function post(type,extra){try{var m={zeus:CH,v:1,type:type,boardId:BID};if(extra)for(var k in extra)m[k]=extra[k];parent.postMessage(m,"*");}catch(e){}}
function str(x){try{if(x instanceof Error)return x.message;if(typeof x==="string")return x;return JSON.stringify(x);}catch(e){return String(x);}}
var sent=0,fatalCount=0;
function report(e){if(sent>40)return;sent++;if(e.fatal)fatalCount++;post("ZEUS_RUNTIME_ERROR",{error:e});}
var SYNTAX=/SyntaxError|Unexpected token|Unexpected identifier|Unexpected end of input|Invalid or unexpected token|missing \\)|Unterminated|Identifier '.*' has already been declared/i;
window.addEventListener("error",function(ev){
var t=ev.target;
if(t&&t!==window&&(t.src||t.href)){report({kind:"resource",message:"Failed to load "+String(t.tagName||"resource").toLowerCase()+": "+(t.src||t.href),source:String(t.src||t.href),fatal:false,at:Date.now()});return;}
var msg=ev.message||str(ev.error);
report({kind:SYNTAX.test(msg)?"compile":"runtime",message:String(msg).slice(0,600),file:ev.filename||undefined,line:ev.lineno||undefined,column:ev.colno||undefined,stack:ev.error&&ev.error.stack?String(ev.error.stack).slice(0,800):undefined,fatal:true,at:Date.now()});
},true);
window.addEventListener("unhandledrejection",function(ev){
var r=ev.reason;report({kind:"promise",message:String(str(r)).slice(0,600),stack:r&&r.stack?String(r.stack).slice(0,800):undefined,fatal:true,at:Date.now()});
});
window.__ZEUS_REPORT_ERROR__=function(err,componentStack){report({kind:"react",message:String(str(err)).slice(0,600),stack:err&&err.stack?String(err.stack).slice(0,800):undefined,componentStack:componentStack?String(componentStack).slice(0,800):undefined,fatal:true,at:Date.now()});};
var oe=console.error,ow=console.warn,cn=0;
console.error=function(){try{var msg=Array.prototype.slice.call(arguments).map(str).join(" ").slice(0,900);
var rc=/The above error occurred in the <([^>]+)> component/.exec(msg);
if(rc){report({kind:"react",message:msg.split("\\n")[0].slice(0,300),componentStack:msg.slice(msg.indexOf("component")).slice(0,700),fatal:true,at:Date.now()});}
else if(cn++<8){report({kind:"console",message:msg.slice(0,400),fatal:false,at:Date.now()});}}catch(e){}
return oe.apply(console,arguments);};
console.warn=function(){try{if(cn++<8){report({kind:"console",message:Array.prototype.slice.call(arguments).map(str).join(" ").slice(0,300),fatal:false,at:Date.now()});}}catch(e){}
return ow.apply(console,arguments);};
var readySent=false;
function ready(){if(readySent)return;readySent=true;setTimeout(function(){post("ZEUS_PREVIEW_READY",{errors:fatalCount});},450);}
if(document.readyState==="complete")ready();else window.addEventListener("load",ready);

var inspecting=false,hl=null,lab=null,prevCursor="";
function overlay(){if(hl)return;
hl=document.createElement("div");hl.setAttribute("data-zeus-edit","inspect");
hl.style.cssText="position:fixed;z-index:2147483646;pointer-events:none;border:1px solid #D97757;background:rgba(217,119,87,.12);display:none;box-sizing:border-box;margin:0";
lab=document.createElement("div");lab.setAttribute("data-zeus-edit","inspect");
lab.style.cssText="position:fixed;z-index:2147483647;pointer-events:none;background:#D97757;color:#1b1c20;font:600 11px/1.2 ui-monospace,Menlo,Consolas,monospace;padding:3px 6px;border-radius:4px;display:none;white-space:nowrap;margin:0";
var host=document.body||document.documentElement;host.appendChild(hl);host.appendChild(lab);}
function ignorable(el){return !el||el.nodeType!==1||el===document.documentElement||el===document.body||(el.closest&&el.closest("[data-zeus-edit]"));}
function attrComponent(el){var a=el.closest&&el.closest("[data-zeus-component],[data-component],[data-component-name]");
return a?(a.getAttribute("data-zeus-component")||a.getAttribute("data-component")||a.getAttribute("data-component-name")||""):"";}
function fiberComponent(el){try{for(var k in el){if(k.indexOf("__reactFiber$")===0){var f=el[k];while(f){var t=f.type;if(t&&typeof t==="function"&&(t.displayName||t.name))return t.displayName||t.name;f=f.return;}}}}catch(e){}return "";}
function cls(el){return typeof el.className==="string"?el.className.trim().split(/\\s+/).filter(Boolean):[];}
function label(el){var c=attrComponent(el);var k=cls(el).slice(0,2);var r=el.getBoundingClientRect();
return (c?c+" ":"")+el.tagName.toLowerCase()+(el.id?"#"+el.id:"")+(k.length?"."+k.join("."):"")+"  "+Math.round(r.width)+"x"+Math.round(r.height);}
function domPath(el){var parts=[];
while(el&&el.nodeType===1&&el!==document.documentElement){var t=el.tagName.toLowerCase();
if(el===document.body){parts.unshift("body");break;}
var p=el.parentElement;
if(p){var n=0,idx=1;for(var i=0;i<p.children.length;i++){if(p.children[i].tagName===el.tagName){n++;if(p.children[i]===el)idx=n;}}if(n>1)t+=":nth-of-type("+idx+")";}
if(el.id){parts.unshift(t+"#"+el.id);break;}
parts.unshift(t);el=el.parentElement;}
return parts.join(" > ");}
var STYLE_KEYS=["color","background-color","font-size","font-weight","font-family","line-height","letter-spacing","padding","margin","border-radius","border","display","gap","width","height"];
function snapshot(el){var cs=getComputedStyle(el);var styles={};
for(var i=0;i<STYLE_KEYS.length;i++){var v=cs.getPropertyValue(STYLE_KEYS[i]);if(v)styles[STYLE_KEYS[i]]=String(v).slice(0,60);}
var src=el.closest&&el.closest("[data-zeus-source],[data-od-source-path]");
var r=el.getBoundingClientRect();
return {tag:el.tagName.toLowerCase(),component:attrComponent(el)||fiberComponent(el)||undefined,id:el.id||"",classes:cls(el),
text:(el.textContent||"").replace(/\\s+/g," ").trim().slice(0,120),styles:styles,domPath:domPath(el),
sourceLocator:src?(src.getAttribute("data-zeus-source")||src.getAttribute("data-od-source-path")||""):"",
outerHtml:el.outerHTML.slice(0,900),rect:{x:r.left,y:r.top,w:r.width,h:r.height}};}
function show(el){if(ignorable(el)){hl.style.display="none";lab.style.display="none";return;}
var r=el.getBoundingClientRect();
hl.style.display="block";hl.style.left=r.left+"px";hl.style.top=r.top+"px";hl.style.width=r.width+"px";hl.style.height=r.height+"px";
lab.textContent=label(el);lab.style.display="block";
var ly=r.top-22;if(ly<2)ly=r.bottom+4;lab.style.top=ly+"px";lab.style.left=Math.max(2,Math.min(r.left,window.innerWidth-180))+"px";}
function onMove(ev){if(inspecting)show(ev.target);}
function onClick(ev){if(!inspecting)return;ev.preventDefault();ev.stopPropagation();
var el=ev.target;if(ignorable(el))return;
post("ZEUS_ELEMENT_SELECTED",{element:snapshot(el)});setInspect(false,true);}
function onKey(ev){if(inspecting&&ev.key==="Escape"){setInspect(false,true);}}
function setInspect(on,notify){if(on===inspecting)return;inspecting=on;
if(on){overlay();prevCursor=document.documentElement.style.cursor;document.documentElement.style.cursor="crosshair";}
else{document.documentElement.style.cursor=prevCursor;if(hl){hl.style.display="none";lab.style.display="none";}}
if(notify)post("ZEUS_INSPECT_MODE",{on:on});}
document.addEventListener("mousemove",onMove,true);
document.addEventListener("click",onClick,true);
document.addEventListener("keydown",onKey,true);
window.addEventListener("scroll",function(){if(hl){hl.style.display="none";lab.style.display="none";}},true);
window.addEventListener("message",function(ev){var d=ev.data;if(d&&d.zeus===CMD&&d.type==="ZEUS_INSPECT_MODE")setInspect(!!d.on,false);});
if(__INSPECT__){var go=function(){setInspect(true,false);};if(document.body)go();else document.addEventListener("DOMContentLoaded",go);}
})();`;

export function buildSandboxBridge(opts: { boardId: string; inspect?: boolean }): string {
  const bid = JSON.stringify(opts.boardId).replace(/</g, "\\u003c");
  const body = BRIDGE_SOURCE.replace("__BID__", () => bid).replace("__INSPECT__", opts.inspect ? "true" : "false");
  return `<script data-zeus-edit="bridge">${body}</script>`;
}
