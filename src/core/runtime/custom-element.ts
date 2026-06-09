import { CustomElDecl, CompileCtx } from "../types";
import { renderChild } from "../compiler";
import { litToString } from "../../utils";

export function compileCustomElement(cel: CustomElDecl, opts: { sharedRuntime: boolean }, hash: string, ctx: CompileCtx): string {
  const componentId = `${cel.sinthName}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const exportTag = cel.exportTag ?? `sinth-el-${componentId.slice(-8)}`;
  const varDecls = cel.varDecls;
  
  const varLines = varDecls.map(v => {
    if (v.value) {
      const val = litToString(v.value);
      if (v.varType === "int") return `this._${v.name} = ${parseFloat(val) || 0};`;
      if (v.varType === "bool") return `this._${v.name} = ${val === "true" ? "true" : "false"};`;
      return `this._${v.name} = ${JSON.stringify(val)};`;
    }
    const defaults: Record<string, string> = { str: '""', int: "0", bool: "false", "str[]": "[]" };
    return `this._${v.name} = ${defaults[v.varType ?? "str"] ?? "undefined"};`;
  }).join("\n      ");

  const childCtx: CompileCtx = {
    ...ctx,
    exprRegistry: [],
    exprMap: new Map(),
    logicBlocks: [],
    mixedBlocks: [],
    customEls: new Map(),
    scopePrefix: 'this._',
    scopeVar: 'this',
    ceActionHandlers: [],
    varDecls: varDecls,
    scopeHash: componentId,
  };

  const customVarMap = new Map<string, string>();
  for (const v of varDecls) {
    customVarMap.set(v.name, v.name);
  }

  const bodyHTML = cel.body.map(c => renderChild(c, childCtx, customVarMap, 0)).join("\n");
  
  const className = `CE_${componentId.replace(/[^a-zA-Z0-9]/g, '_')}`;
  const escapedHTML = bodyHTML.replace(/`/g, '\\`').replace(/\$/g, '\\$');

  return `(function(){
const tagName='${exportTag}';
if(customElements.get(tagName))return;
class ${className} extends HTMLElement{
constructor(){
super();
this.attachShadow({mode:'open'});
${varLines}
}
connectedCallback(){
this.shadowRoot.innerHTML=\`${escapedHTML}\`;
const btns=this.shadowRoot.querySelectorAll('button');
for(let i=0;i<btns.length;i++){
btns[i].onclick=()=>{
if(this._count!==undefined){
this._count++;
const spans=this.shadowRoot.querySelectorAll('[data-expr-id]');
for(let j=0;j<spans.length;j++){
const s=spans[j];
const id=s.getAttribute('data-expr-id');
if(id==='0'){
s.textContent=this._count;
}
}
}
};
}
const spans=this.shadowRoot.querySelectorAll('[data-expr-id]');
for(let i=0;i<spans.length;i++){
const s=spans[i];
const id=s.getAttribute('data-expr-id');
if(id==='0'){
s.textContent=this._count;
}
}
}
}
customElements.define(tagName,${className});
})();`;
}