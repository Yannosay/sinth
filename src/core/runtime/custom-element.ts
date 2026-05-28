import { CustomElDecl, CompileCtx } from "../types.ts";
import { renderChild } from "../compiler.ts";
import { litToString } from "../../utils.ts";

export function compileCustomElement(cel: CustomElDecl, opts: { sharedRuntime: boolean }, hash: string, ctx: CompileCtx): string {
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
    scopePrefix: 'host._',
    scopeVar: 'host',
  };

  const customVarMap = new Map<string, string>();
  for (const v of varDecls) {
    customVarMap.set(v.name, `__VAR__${v.name}`);
  }

  const bodyHTML = cel.body.map(c => renderChild(c, childCtx, customVarMap, 0)).join("\n");

  const escapedHTML = bodyHTML
    .replace(/sinthRender\(\)/g, 'host._render()')
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$')
    .replace(/__VAR__(\w+)/g, 'host._$$1');

  const needsExpr = bodyHTML.includes("sinth-expr");
  const needsIf = bodyHTML.includes("data-sinth-if");

  const exprArrayJS = childCtx.exprRegistry.length > 0
    ? `let __X = [${childCtx.exprRegistry.map(js => {
        const replaced = varDecls.reduce((acc, v) => {
          const regex = new RegExp(`\\b${v.name}\\b(?![.\\(])`, 'g');
          return acc.replace(regex, `_ctx.host._${v.name}`);
        }, js);
        return `function(_ctx){ return ${replaced}; }`;
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

  function render(host) {
    ${needsExpr ? `host.shadowRoot.querySelectorAll('.sinth-expr').forEach(function(el) { sinthExpr(el, host); });` : ""}
    ${needsIf ? `
    var templates = host.shadowRoot.querySelectorAll('template[data-sinth-if-expr]');
    var seen = {};
    templates.forEach(function(t) {
      var ifId = t.dataset.sinthIfId;
      if (seen[ifId]) return;
      seen[ifId] = true;
      var condFn = __X[t.dataset.sinthIfExpr];
      var cond = condFn ? condFn({host: host}) : false;
      var elseT = host.shadowRoot.querySelector('template[data-sinth-else][data-sinth-if-id="' + ifId + '"]');
      var sourceT = cond ? t : elseT;
      var anchor = host.shadowRoot.querySelector('[data-sinth-if-anchor="' + ifId + '"]');
      if (sourceT) {
        if (!anchor) {
          anchor = document.createElement('span');
          anchor.style.display = 'none';
          anchor.dataset.sinthIfAnchor = ifId;
          t.parentNode.insertBefore(anchor, t);
        }
        var c = anchor.nextSibling;
        while (c && c !== t) { var n = c.nextSibling; c.remove(); c = n; }
        var frag = document.createRange().createContextualFragment(sourceT.innerHTML);
        frag.querySelectorAll('.sinth-expr').forEach(function(el) { sinthExpr(el, host); });
        t.parentNode.insertBefore(frag, t);
      } else {
        if (anchor) {
          var c = anchor.nextSibling;
          while (c && c !== t) { var n = c.nextSibling; c.remove(); c = n; }
          anchor.remove();
        }
      }
    });
    ` : ""}
    host.shadowRoot.querySelectorAll('[data-sinth-value]').forEach(function(el) {
      try { if (document.activeElement !== el) { let v = el.dataset.sinthValue; el.value = __X[v] ? __X[v]({host: host}) : ''; } } catch(e) {}
    });
  }

  class ${cel.sinthName} extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      ${varLines}
    }
    connectedCallback() {
      var host = this;
      this._render = function() { render(host); };
      this.shadowRoot.innerHTML = \`${escapedHTML}\`;
      var _ceHandlers = [${(childCtx.ceActionHandlers || []).join(',')}];
      this.shadowRoot.querySelectorAll('[data-sinth-ce-click],[data-sinth-ce-input],[data-sinth-ce-change],[data-sinth-ce-submit]').forEach(function(el) {
        var attrs = el.attributes;
        for (var i = 0; i < attrs.length; i++) {
          var name = attrs[i].name;
          if (name.indexOf('data-sinth-ce-') === 0) {
            var eventType = name.substring('data-sinth-ce-'.length);
            var idx = parseInt(attrs[i].value);
            el.addEventListener(eventType, function(e) { _ceHandlers[idx](e, host); });
          }
        }
      });
      render(this);
    }
  }
  customElements.define('${cel.exportTag}', ${cel.sinthName});
})();`;
}