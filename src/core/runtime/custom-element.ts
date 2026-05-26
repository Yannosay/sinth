import { CustomElDecl, CompileCtx } from "../types.ts";
import { renderChild } from "../compiler.ts";
import { litToString } from "../../utils.ts";

export function compileCustomElement(cel: CustomElDecl, opts: { sharedRuntime: boolean }, hash: string, ctx: CompileCtx): string {
  const varDecls = cel.varDecls;
  const varNames = varDecls.map(v => v.name);
  
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
  };

  const bodyHTML = cel.body.map(c => renderChild(c, childCtx, new Map(), 0)).join("\n");
  
  function replaceVarsOutsideStrings(text: string, varNames: string[], replacement: (name: string) => string): string {
    const varPattern = varNames.join('|');
    const regex = new RegExp(`("[^"]*"|'[^']*'|\`[^\`]*\`)|\\b(${varPattern})\\b`, 'g');
    const parts: string[] = [];
    let lastIndex = 0;
    let match;
    
    while ((match = regex.exec(text)) !== null) {
      parts.push(text.substring(lastIndex, match.index));
      if (match[1]) {
        parts.push(match[1]);
      } else if (match[2]) {
        parts.push(replacement(match[2]));
      }
      lastIndex = regex.lastIndex;
    }
    parts.push(text.substring(lastIndex));
    return parts.join('');
  }

  let rewrittenHTML = bodyHTML;
  rewrittenHTML = rewrittenHTML.replace(/onclick="([^"]+)"/g, (match, content) => {
    const replaced = replaceVarsOutsideStrings(content, varNames, (name) => `host._${name}`);
    return `data-sinth-click="${replaced}"`;
  });
  rewrittenHTML = replaceVarsOutsideStrings(rewrittenHTML, varNames, (name) => `host._${name}`);
  rewrittenHTML = rewrittenHTML.replace(/sinthRender\(\)/g, 'host._render()');
  
  const escapedHTML = rewrittenHTML.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');

  const needsExpr = bodyHTML.includes("sinth-expr");
  const needsIf = bodyHTML.includes("data-sinth-if");

  const exprArrayJS = childCtx.exprRegistry.length > 0
    ? `let __X = [${childCtx.exprRegistry.map(js => {
        return `function(_ctx){ return ${replaceVarsOutsideStrings(js, varNames, (name) => `_ctx.host._${name}`)}; }`;
      }).join(",")}];\n`
    : "";

  return `// Sinth Custom Element: ${cel.exportTag}
(function() {
  ${exprArrayJS}

  var sinthExpr = function(el, host) {
    try {
      let exprFn = __X[el.dataset.exprId];
      if (exprFn) el.textContent = exprFn({host: host});
    } catch(e) {}
  };

  ${needsIf ? `
  function sinthIfBlock(t) {
    let ifId = t.dataset.sinthIfId;
    let condFn = __X[t.dataset.sinthIfExpr];
    let cond = condFn ? condFn() : false;
    if (cond) {
      let anchor = t.parentNode.querySelector('[data-sinth-if-anchor="' + ifId + '"]');
      if (!anchor) {
        anchor = document.createElement('span');
        anchor.style.display = 'none';
        anchor.dataset.sinthIfAnchor = ifId;
        t.parentNode.insertBefore(anchor, t);
      }
      let frag = document.createRange().createContextualFragment(t.innerHTML);
      frag.querySelectorAll('.sinth-expr').forEach(sinthExpr);
      t.parentNode.insertBefore(frag, t);
    } else {
      let anchor = t.parentNode.querySelector('[data-sinth-if-anchor="' + ifId + '"]');
      if (anchor) {
        let c = anchor.nextSibling;
        while (c && c !== t) { let n = c.nextSibling; c.remove(); c = n; }
        anchor.remove();
      }
    }
  }
  ` : ""}

  function render(host) {
    ${needsExpr ? `host.shadowRoot.querySelectorAll('.sinth-expr').forEach(function(el) { sinthExpr(el, host); });` : ""}
    ${needsIf ? `host.shadowRoot.querySelectorAll('template[data-sinth-if-expr]').forEach(sinthIfBlock);` : ""}
  }

  class ${cel.sinthName} extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      ${varLines}
    }
    connectedCallback() {
      var self = this;
      this._render = function() { render(self); };
      this.shadowRoot.innerHTML = \`${escapedHTML}\`;
      this.shadowRoot.querySelectorAll('[data-sinth-click]').forEach(function(el) {
        var fn = new Function('host', el.getAttribute('data-sinth-click'));
        el.addEventListener('click', function() { fn(self); });
      });
      render(this);
    }
  }
  customElements.define('${cel.exportTag}', ${cel.sinthName});
})();`;
}