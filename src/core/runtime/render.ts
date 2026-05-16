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
}): string {
  const { bodyHTML, logicBlocks, mixedBlocks, needsLogic, needsMixed, needsIf, needsFor, needsExpr, needsDelay } = opts;
  let renderBody = "";
  renderBody += `  var _sx = window.scrollX, _sy = window.scrollY;\n`;

  if (needsLogic) {
    renderBody += logicBlocks.map(b => b.replace(/^/gm, "  ")).join("\n") + "\n";
  }

  if (needsMixed) {
    for (const mb of mixedBlocks) {
      const ifJS = mb.ifJS ? mb.ifJS.trim() : "";
      const elseJS = mb.elseJS ? mb.elseJS.trim() : "";
      renderBody += `  (function() {
    var __el = document.getElementById(${JSON.stringify(mb.replaceId || mb.id)});
    if (__el) {
      var __condFn = __X[${mb.conditionJS}];
      if (__condFn ? __condFn() : false) {
        ${ifJS}
        __el.innerHTML = ${JSON.stringify(mb.ifHTML)};
      } else {
        ${elseJS}
        __el.innerHTML = ${JSON.stringify(mb.elseHTML)};
      }
      __el.querySelectorAll('.sinth-expr').forEach(sinthExpr);
      __el.querySelectorAll('template[data-sinth-if-expr]').forEach(sinthIfBlock);
      ${needsDelay ? `__el.querySelectorAll('[data-sinth-delay]').forEach(sinthDelay);
      __el.querySelectorAll('[data-sinth-delay-expr-id]').forEach(function(el) { sinthDelayExpr(el, {}); });` : ""}
    }
  })();\n`;
    }
  }

  renderBody += `  document.querySelectorAll('[data-sinth-remove]').forEach(function(el) {
    var target = document.getElementById(el.dataset.sinthRemove);
    if (target) target.remove();
  });\n`;

  if (needsIf) {
    renderBody += `  document.querySelectorAll('template[data-sinth-if-expr]').forEach(sinthIfBlock);\n`;
  }
  if (needsFor) {
    renderBody += `  document.querySelectorAll('template[data-sinth-for]').forEach(sinthForBlock);\n`;
  }
  renderBody += `  document.querySelectorAll('[data-sinth-value]').forEach(function(el) {
    try { el.value = window[el.dataset.sinthValue] || ''; } catch(e) {}
  });\n`;
  renderBody += `  document.querySelectorAll('[data-sinth-checked]').forEach(function(el) {
    try { el.checked = !!window[el.dataset.sinthChecked]; } catch(e) {}
  });\n`;
  if (bodyHTML.includes("data-sinth-checked-expr")) {
    renderBody += `  document.querySelectorAll('[data-sinth-checked-expr]').forEach(function(el) {
    try {
      var exprFn = __X[el.dataset.sinthCheckedExpr];
      if (exprFn) el.checked = !!exprFn({});
    } catch(e) {}
  });\n`;
  }
  if (needsExpr) {
    renderBody += `  document.querySelectorAll('.sinth-expr').forEach(sinthExpr);\n`;
  }
  renderBody += `  document.querySelectorAll('[data-sinth-hide]').forEach(function(el) {
    var exprId = el.dataset.sinthHide;
    if (exprId) {
      try {
        var exprFn = __X[exprId];
        if (exprFn) el.style.display = exprFn({}) ? 'none' : '';
      } catch(e) {}
    } else {
      el.style.display = 'none';
    }
  });\n`;
  if (needsDelay) {
    renderBody += `  setTimeout(function() {
    document.querySelectorAll('[data-sinth-delay]').forEach(sinthDelay);
  }, 0);\n`;
  }
  renderBody += `  window.scrollTo(_sx, _sy);\n`;

  return renderBody;
}