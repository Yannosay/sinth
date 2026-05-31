import { MixedBlockEntry } from "../types.ts";

export function buildRenderBody(opts: {
  bodyHTML: string;
  logicBlocks: string[];
  mixedBlocks: MixedBlockEntry[]
  needsLogic: boolean;
  needsMixed: boolean;
  needsIf: boolean;
  needsFor: boolean;
  needsExpr: boolean;
  needsDelay: boolean;
  exprVarUpdates?: string;
}): string {
  const { bodyHTML, logicBlocks, mixedBlocks, needsLogic, needsMixed, needsIf, needsFor, needsExpr, needsDelay, exprVarUpdates } = opts;
  let renderBody = "";
  renderBody += `  let _sx = window.scrollX, _sy = window.scrollY;\n`;

  if (needsLogic) {
    renderBody += logicBlocks.map(b => b.replace(/^/gm, "  ")).join("\n") + "\n";
  }

  if (needsMixed) {
    for (const mb of mixedBlocks) {
      const ifJS = mb.ifJS ? mb.ifJS.trim() : "";
      const elseJS = mb.elseJS ? mb.elseJS.trim() : "";
      renderBody += `  (function() {
    let __el = document.getElementById(${JSON.stringify(mb.replaceId || mb.id)});
    if (__el) {
      let __condFn = __X[${mb.conditionJS}];
      if (__condFn ? __condFn() : false) {
        ${ifJS}
        __el.innerHTML = ${JSON.stringify(mb.ifHTML)};
      } else {
        ${elseJS}
        __el.innerHTML = ${JSON.stringify(mb.elseHTML)};
      }
      __el.querySelectorAll('.sinth-expr').forEach(sinthExpr);
      __el.querySelectorAll('.sinth-expr').forEach(function(el) { el.classList.remove('sinth-expr'); });      
      __el.querySelectorAll('template[data-sinth-if-expr]').forEach(sinthIfBlock);
      ${needsDelay ? `__el.querySelectorAll('[data-sinth-delay]').forEach(sinthDelay);
      __el.querySelectorAll('[data-sinth-delay-expr-id]').forEach(function(el) { sinthDelayExpr(el, {}); });` : ""}
    }
  })();\n`;
    }
  }

  renderBody += `  document.querySelectorAll('[data-sinth-remove]').forEach(function(el) {
    let target = document.getElementById(el.dataset.sinthRemove);
    if (target) target.remove();
  });\n`;
  if (needsFor) {
    renderBody += `  document.querySelectorAll('template[data-sinth-for], template[data-sinth-for-expr]').forEach(sinthForBlock);\n`;
  }
  if (needsIf) {
    renderBody += `  document.querySelectorAll('template[data-sinth-if-expr]').forEach(function(t) { var p = t.parentElement; while(p && p.tagName !== 'TEMPLATE') p = p.parentElement; if (!p || (!p.hasAttribute('data-sinth-for') && !p.hasAttribute('data-sinth-for-expr'))) sinthIfBlock(t); });\n`;
  }
  renderBody += `  document.querySelectorAll('[data-sinth-value]').forEach(function(el) {
    try { if (document.activeElement !== el) { let v=el.dataset.sinthValue; el.value = __X[v] ? __X[v]({}) : ''; } } catch(e) {}
  });\n`;
  renderBody += `  document.querySelectorAll('[data-sinth-step]').forEach(function(el) {
    try { let s=el.dataset.sinthStep; el.step = __X[s] ? __X[s]({}) : 1; } catch(e) {}
  });\n`;
  renderBody += `  document.querySelectorAll('[data-sinth-checked]').forEach(function(el) {
    try { let c=el.dataset.sinthChecked; el.checked = __X[c] ? !!__X[c]({}) : false; } catch(e) {}
  });\n`;
  if (exprVarUpdates) {
    renderBody += `  ${exprVarUpdates}\n`;
  }
  if (bodyHTML.includes("data-sinth-checked-expr")) {
    renderBody += `  document.querySelectorAll('[data-sinth-checked-expr]').forEach(function(el) {
    try {
      let exprFn = __X[el.dataset.sinthCheckedExpr];
      if (exprFn) el.checked = !!exprFn({});
    } catch(e) {}
  });\n`;
  }
  if (needsDelay) {
    renderBody += `  document.querySelectorAll('[data-sinth-delay]').forEach(function(el) {
    let newContent = '';
    el.querySelectorAll('.sinth-expr').forEach(function(exprEl) {
      let exprFn = __X[exprEl.dataset.exprId];
      if (exprFn) newContent += exprFn({});
    });
    if (el._sinthLastContent === undefined) {
      el._sinthLastContent = newContent;
    } else if (el._sinthLastContent !== newContent) {
      el._sinthLastContent = newContent;
      delete el.dataset.sinthDelayDone;
    }
  });
  document.querySelectorAll('[data-sinth-delay-expr-id]').forEach(function(el) { sinthDelayExpr(el, {}); });\n`;
  }
  if (needsExpr) {
    renderBody += `  document.querySelectorAll('.sinth-expr').forEach(function(el) {
    let delayParent = el.closest('[data-sinth-delay]');
    if (!delayParent || delayParent.dataset.sinthDelayDone) {
      sinthExpr(el);
    }
  });\n`;
  }
  renderBody += `  document.querySelectorAll('[data-sinth-hide]').forEach(function(el) {
    let exprId = el.dataset.sinthHide;
    if (exprId) {
      try {
        let exprFn = __X[exprId];
        if (exprFn) el.style.display = exprFn({}) ? 'none' : '';
      } catch(e) {}
    } else {
      el.style.display = 'none';
    }
  });\n`;
  renderBody += `  document.querySelectorAll('[data-sinth-fullscreen]').forEach(function(el) {
    let exprId = el.dataset.sinthFullscreen;
    if (exprId) {
      try {
        let exprFn = __X[exprId];
        if (exprFn) {
          if (exprFn({})) {
            if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
          } else {
            if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen();
          }
        }
      } catch(e) {}
    }
  });\n`;
  if (needsDelay) {
    renderBody += `  setTimeout(function() {
    document.querySelectorAll('[data-sinth-delay]').forEach(sinthDelay);
    document.querySelectorAll('[data-sinth-delay-expr-id]').forEach(function(el) { sinthDelayExpr(el, {}); });
  }, 0);\n`;
  }
  renderBody += `  window.scrollTo(_sx, _sy);\n`;

  return renderBody;
}