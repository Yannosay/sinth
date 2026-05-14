import { VarDeclaration, MixedBlockEntry, SinthWarning } from "./types.ts";
import { litToString } from "../utils.ts";



export function buildRuntime(opts: {
  varDecls:     VarDeclaration[];
  bodyHTML:     string;
  logicBlocks:  string[];
  mixedBlocks:  MixedBlockEntry[];
  assignedVars: Set<string>;
  exprRegistry: string[];
  sharedRuntime: boolean;
  functionsJS:  string;   // ← new
}): string | { page: string; shared: string } {
  const { varDecls, bodyHTML, logicBlocks, mixedBlocks, assignedVars, exprRegistry, functionsJS } = opts;

  const needsExpr   = bodyHTML.includes("sinth-expr");
  const needsIf     = bodyHTML.includes("data-sinth-if");
  const needsFor    = bodyHTML.includes("data-sinth-for");
  const needsDelay  = bodyHTML.includes("data-sinth-delay") || bodyHTML.includes("data-sinth-delay-expr-id") || mixedBlocks.some(mb => mb.ifHTML.includes("data-sinth-delay") || mb.ifHTML.includes("data-sinth-delay-expr-id") || mb.elseHTML.includes("data-sinth-delay") || mb.elseHTML.includes("data-sinth-delay-expr-id"));
  const needsMixed  = mixedBlocks.length > 0;
  const needsLogic  = logicBlocks.length > 0;
  const needsRender = needsExpr || needsIf || needsFor || needsMixed || needsLogic;

  const varLines = varDecls.map(v => {
    if (!v.value) {
      if (!assignedVars.has(v.name)) {
        const defaults: Record<string, string> = { str: '""', int: "0", bool: "false", "str[]": "[]" };
        SinthWarning.emit(
          `Variable '${v.name}' is declared but never assigned. Defaulting to ${defaults[v.varType] ?? "undefined"}.`,
          v.loc,
        );
      }
      const defaults: Record<string, string> = { str: '""', int: "0", bool: "false", "str[]": "[]" };
      return `var ${v.name} = ${defaults[v.varType] ?? "undefined"};`;
    }
    const val = litToString(v.value);
    if (val.startsWith("__VAR__")) return `var ${v.name} = ${val.slice(7)};`;
    if (val.startsWith("__ARR__")) return `var ${v.name} = ${val.slice(7)};`;
    if (v.varType === "obj") return `var ${v.name} = ${val};`;
    if (v.varType === "str")  return `var ${v.name} = ${JSON.stringify(val)};`;
    if (v.varType === "str[]" && typeof val === 'string' && val.startsWith("__ARR__")) {
      try {
        const arr = JSON.parse(val.slice(7));
        return `var ${v.name} = ${JSON.stringify(arr)};`;
      } catch { return `var ${v.name} = ${val.slice(7)};`; }
    }
    return `var ${v.name} = ${val};`;
  }).join("\n");

  if (!needsRender && !needsDelay) {
    return varLines ? `// Sinth compiled runtime\n${varLines}` : "";
  }

  let helpers = "";

  if (needsExpr || needsIf || needsFor) {
    helpers += `
function sinthExpr(el) {
  try {
    var exprFn = __X[el.dataset.exprId];
    if (exprFn) el.textContent = exprFn({});
  } catch(e) {}
}
`;
  }

  if (needsIf || needsMixed) {
    helpers += `
function sinthReplaceInsert(t, anchor, ifId, replaceId) {
  if (anchor) {
    var cur = anchor.nextSibling;
    while (cur && cur !== t) { var nx = cur.nextSibling; cur.remove(); cur = nx; }
  } else {
    anchor = document.createElement('span');
    anchor.style.display = 'none';
    anchor.dataset.sinthIfAnchor = ifId;
    t.parentNode.insertBefore(anchor, t);
  }
  var _rp = null, _rpParent = null, _rpNext = null;
  if (replaceId) {
    _rp = document.getElementById(replaceId);
    if (_rp) {
      _rpParent = _rp.parentNode;
      _rpNext = _rp.nextSibling;
      _rp.parentNode.removeChild(_rp);
      anchor._sinthReplaced = _rp;
      anchor._sinthReplacedParent = _rpParent;
      anchor._sinthReplacedNext = _rpNext;
    }
  }
  var frag = document.createRange().createContextualFragment(t.innerHTML);
  frag.querySelectorAll('.sinth-expr').forEach(sinthExpr);
  if (${needsDelay}) {
    frag.querySelectorAll('[data-sinth-delay]').forEach(sinthDelay);
    frag.querySelectorAll('[data-sinth-delay-expr-id]').forEach(sinthDelayExpr);
  }
  var fragFirst = frag.firstChild;
  var fragLast = frag.lastChild;
  if (_rpParent && _rpNext) {
    _rpParent.insertBefore(frag, _rpNext);
  } else if (_rpParent) {
    _rpParent.appendChild(frag);
  } else {
    t.parentNode.insertBefore(frag, t);
  }
  if (replaceId && anchor) {
    anchor._sinthInsertedFirst = fragFirst;
    anchor._sinthInsertedLast = fragLast;
  }
  return anchor;
}
`;
  }

  if (needsDelay) {
    helpers += `
function sinthDelay(el) {
  if (el.dataset.sinthDelayDone) { el.style.display = ''; return; }
  el.dataset.sinthDelayDone = '1';
  var ms = parseInt(el.dataset.sinthDelay) || 0;
  el.style.display = 'none';
  if (ms > 0) setTimeout(function() { el.style.display = ''; }, ms);
  else el.style.display = '';
}
function sinthDelayExpr(el) {
  try {
    var fn = __X[el.dataset.sinthDelayExprId];
    var ms = fn ? parseInt(fn()) || 0 : 0;
    el.style.display = '';
    if (ms > 0) setTimeout(function() { el.style.display = ''; }, ms);
  } catch(e) {}
}
`;
  }

  if (needsIf) {
    helpers += `
function sinthIfBlock(t) {
  var ifId = t.dataset.sinthIfId;
  var anchor = t.parentNode.querySelector('[data-sinth-if-anchor="' + ifId + '"]');
  var condFn = __X[t.dataset.sinthIfExpr];
  var cond = condFn ? condFn() : false;
  if (cond) {
    anchor = sinthReplaceInsert(t, anchor, ifId, t.dataset.sinthIfReplace);
  } else {
    if (anchor) {
      if (anchor._sinthReplaced) {
        var insFirst = anchor._sinthInsertedFirst;
        var insLast = anchor._sinthInsertedLast;
        var rpParent = anchor._sinthReplacedParent;
        var rpNext = anchor._sinthReplacedNext;
        if (insFirst && insLast) {
          var cur = insFirst;
          while (cur && cur !== insLast) {
            var next = cur.nextSibling;
            cur.remove();
            cur = next;
          }
          if (insLast) insLast.remove();
        }
        if (rpParent && rpNext) {
          rpParent.insertBefore(anchor._sinthReplaced, rpNext);
        } else if (rpParent) {
          rpParent.appendChild(anchor._sinthReplaced);
        }
      } else {
        var cur2 = anchor.nextSibling;
        while (cur2 && cur2 !== t) { var nx2 = cur2.nextSibling; cur2.remove(); cur2 = nx2; }
      }
      anchor.remove();
    }
    var elseT = t.nextElementSibling;
    if (elseT && elseT.hasAttribute('data-sinth-else')) {
      var elseIfId = elseT.dataset.sinthIfId;
      var ea = t.parentNode.querySelector('[data-sinth-if-anchor="__else__' + elseIfId + '"]');
      if (ea) {
        var cur3 = ea.nextSibling;
        while (cur3 && cur3 !== t) { var nx3 = cur3.nextSibling; cur3.remove(); cur3 = nx3; }
      } else {
        ea = document.createElement('span');
        ea.style.display = 'none';
        ea.dataset.sinthIfAnchor = '__else__' + elseIfId;
        t.parentNode.insertBefore(ea, t);
      }
      var ef = document.createRange().createContextualFragment(elseT.innerHTML);
      ef.querySelectorAll('.sinth-expr').forEach(sinthExpr);
      if (${needsDelay}) {
        ef.querySelectorAll('[data-sinth-delay]').forEach(sinthDelay);
        ef.querySelectorAll('[data-sinth-delay-expr-id]').forEach(sinthDelayExpr);
      }
      t.parentNode.insertBefore(ef, t);
    } else {
      var ea2 = t.parentNode.querySelector('[data-sinth-if-anchor="__else__' + ifId + '"]');
      if (ea2) {
        var ec = ea2.nextSibling;
        while (ec && ec !== t) { var en = ec.nextSibling; ec.remove(); ec = en; }
        ea2.remove();
      }
    }
  }
}
`;
  }

  if (needsFor) {
    helpers += `
function hashString(str) {
  var hash = 0, i, chr;
  for (i = 0; i < str.length; i++) {
    chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return String(hash);
}
function sinthForBlock(t) {
  var source = window[t.dataset.sinthFor];
  if (source === undefined) source = [];
  var newHash = '';
  try { newHash = hashString(JSON.stringify(source)); } catch(e) { newHash = ''; }
  if (t.dataset.sinthForHash && t.dataset.sinthForHash === newHash) {
    return;
  }
  t.dataset.sinthForHash = newHash;
  var isObj = (typeof source === 'object' && source !== null && !Array.isArray(source));
  var entries;
  if (isObj) {
    entries = Object.entries(source);
  } else {
    if (!Array.isArray(source)) source = [];
    entries = source.map(function(item, index) { return [index, item]; });
  }
  var anchor = t.parentNode ? t.parentNode.querySelector('[data-sinth-for-anchor="' + t.dataset.sinthFor + '"]') : null;
  if (anchor) {
    var cur2 = anchor.nextSibling;
    while (cur2 && cur2 !== t) { var nx2 = cur2.nextSibling; cur2.remove(); cur2 = nx2; }
    anchor.remove();
  }
  var fa = document.createElement('span');
  fa.style.display = 'none';
  fa.dataset.sinthForAnchor = t.dataset.sinthFor;
  t.parentNode && t.parentNode.insertBefore(fa, t);
  var _loopIdx = 0;
  entries.forEach(function(entry) {
    var _k = entry[0];
    var _v = entry[1];
    var _item = (t.dataset && t.dataset.sinthItem) ? t.dataset.sinthItem : '__item__';
    var _key = t.dataset && t.dataset.sinthKey ? t.dataset.sinthKey : null;
    var _idx = t.dataset && t.dataset.sinthIndex ? t.dataset.sinthIndex : null;
    _loopIdx++;
    if (t.dataset.sinthIfReplace) {
      var _rp = document.getElementById(t.dataset.sinthIfReplace);
      if (_rp) _rp.parentNode.removeChild(_rp);
    }
    var frag = document.createRange().createContextualFragment(t.innerHTML);
    frag.querySelectorAll('.sinth-expr').forEach(function(el) {
      try {
        var exprFn = __X[el.dataset.exprId];
        if (!exprFn) return;
        var _ctx = {};
        if (_item) _ctx[_item] = _v;
        if (_key)  _ctx[_key]  = _k;
        if (_idx)  _ctx[_idx]  = _loopIdx - 1;
        el.textContent = exprFn(_ctx);
        el.classList.remove('sinth-expr');
      } catch(e) {}
    });
    frag.querySelectorAll('template[data-sinth-if-expr]').forEach(function(ifT) {
      var condFn = __X[ifT.dataset.sinthIfExpr];
      var _ctx = {};
      if (_item) _ctx[_item] = _v;
      if (_key)  _ctx[_key]  = _k;
      if (_idx)  _ctx[_idx]  = _loopIdx - 1;
      var cond = false;
      try { if (condFn) cond = condFn(_ctx); } catch(e) {}
      if (cond) {
        var ifContent = document.createRange().createContextualFragment(ifT.innerHTML);
        ifContent.querySelectorAll('.sinth-expr').forEach(function(el2) {
          try {
            var exprFn2 = __X[el2.dataset.exprId];
            if (exprFn2) el2.textContent = exprFn2(_ctx);
          } catch(e) {}
        });
        ifT.parentNode.insertBefore(ifContent, ifT);
      } else {
        var elseT = ifT.nextElementSibling;
        if (elseT && elseT.hasAttribute('data-sinth-else')) {
          var elseContent = document.createRange().createContextualFragment(elseT.innerHTML);
          elseContent.querySelectorAll('.sinth-expr').forEach(function(el2) {
            try {
              var exprFn2 = __X[el2.dataset.exprId];
              if (exprFn2) el2.textContent = exprFn2(_ctx);
            } catch(e) {}
          });
          ifT.parentNode.insertBefore(elseContent, ifT);
        }
      }
    });
    if (${needsDelay}) {
      frag.querySelectorAll('[data-sinth-delay]').forEach(sinthDelay);
      frag.querySelectorAll('[data-sinth-delay-expr-id]').forEach(sinthDelayExpr);
    }
    t.parentNode && t.parentNode.insertBefore(frag, t);
  });
}
`;
  }

  if (needsMixed) {
    helpers += `
function sinthMixedBlock(el, condId, ifJS, ifHTML, elseJS, elseHTML) {
  var condFn = __X[condId];
  var cond = condFn ? condFn() : false;
  if (cond) {
    if (ifJS) eval(ifJS);
    el.innerHTML = ifHTML;
  } else {
    if (elseJS) eval(elseJS);
    el.innerHTML = elseHTML;
  }
  el.querySelectorAll('.sinth-expr').forEach(sinthExpr);
  el.querySelectorAll('template[data-sinth-if-expr]').forEach(sinthIfBlock);
  if (${needsDelay}) {
    el.querySelectorAll('[data-sinth-delay]').forEach(sinthDelay);
    el.querySelectorAll('[data-sinth-delay-expr-id]').forEach(sinthDelayExpr);
  }
}
`;
  }

  const exprArrayJS = exprRegistry.length > 0
    ? `var __X = [${exprRegistry.map((js) => `function(_ctx){ return ${js}; }`).join(",")}];\n`
    : "";

  let renderBody = "";
  renderBody += `  var _sx = window.scrollX, _sy = window.scrollY;\n`;

  if (needsLogic) {
    renderBody += logicBlocks.map(b => b.replace(/^/gm, "  ")).join("\n") + "\n";
  }

  if (needsMixed) {
    for (const mb of mixedBlocks) {
      renderBody += `  (function() {
    var __el = document.getElementById(${JSON.stringify(mb.replaceId || mb.id)});
    if (__el) sinthMixedBlock(__el, ${mb.conditionJS}, ${JSON.stringify(mb.ifJS)}, ${JSON.stringify(mb.ifHTML)}, ${JSON.stringify(mb.elseJS)}, ${JSON.stringify(mb.elseHTML)});
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
  if (needsExpr) {
    renderBody += `  document.querySelectorAll('.sinth-expr').forEach(sinthExpr);\n`;
  }
  if (needsDelay) {
    renderBody += `  setTimeout(function() {
    document.querySelectorAll('[data-sinth-delay]').forEach(sinthDelay);
    document.querySelectorAll('[data-sinth-delay-expr-id]').forEach(sinthDelayExpr);
  }, 0);\n`;
  }
  renderBody += `  window.scrollTo(_sx, _sy);\n`;

  const renderFunc = needsRender ? `function sinthRender() {\n${renderBody}}\nsinthRender();` : "";

  const pageCode = `// Sinth page runtime
${varLines}
${functionsJS ? functionsJS + "\n" : ""}${exprArrayJS}
${renderFunc}`;

  if (opts.sharedRuntime && helpers.trim()) {
    const sharedCode = `// Sinth shared runtime
${helpers}`;
    return { page: pageCode, shared: sharedCode };
  }

  return `// Sinth compiled runtime
${varLines}
${functionsJS ? functionsJS + "\n" : ""}${helpers}
${exprArrayJS}
${renderFunc}`;
}