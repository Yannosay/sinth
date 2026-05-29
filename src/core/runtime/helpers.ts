export function generateHelpers(opts: {
  needsExpr: boolean;
  needsIf: boolean;
  needsFor: boolean;
  needsDelay: boolean;
  needsMixed: boolean;
}): string {
  const { needsExpr, needsIf, needsFor, needsDelay, needsMixed } = opts;
  let helpers = "";

  if (needsExpr || needsIf || needsFor) {
    helpers += `
var sinthExpr = function(el) {
  try {
    let exprFn = __X[el.dataset.exprId];
    if (exprFn) el.textContent = exprFn({});
  } catch(e) {}
};
`;
  }

  if (needsIf || needsMixed) {
    helpers += `
function sinthReplaceInsert(t, anchor, ifId, replaceId) {
  if (anchor) {
    let cur = anchor.nextSibling;
    while (cur && cur !== t) { let nx = cur.nextSibling; cur.remove(); cur = nx; }
  } else {
    anchor = document.createElement('span');
    anchor.style.display = 'none';
    anchor.dataset.sinthIfAnchor = ifId;
    t.parentNode.insertBefore(anchor, t);
  }
  let _rp = null, _rpParent = null, _rpNext = null;
  if (replaceId) {
    if (anchor._sinthReplaced) {
      _rp = anchor._sinthReplaced;
      _rpParent = anchor._sinthReplacedParent;
      _rpNext = anchor._sinthReplacedNext;
      if (_rp.parentNode) _rp.parentNode.removeChild(_rp);
    } else {
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
  }
  let frag = document.createRange().createContextualFragment(t.innerHTML);
  frag.querySelectorAll('.sinth-expr').forEach(sinthExpr);
  if (${needsDelay}) {
    frag.querySelectorAll('[data-sinth-delay]').forEach(sinthDelay);
    frag.querySelectorAll('[data-sinth-delay-expr-id]').forEach(function(el) { sinthDelayExpr(el, {}); });
  }
  let fragFirst = frag.firstChild;
  let fragLast = frag.lastChild;
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
  if (el.dataset.sinthDelayDone) { return; }
  el.dataset.sinthDelayDone = '1';
  let ms = parseInt(el.dataset.sinthDelay) || 0;
  let hideEl = el.dataset.sinthDelayHide !== 'false';
  let show = function() {
    if (hideEl) el.style.display = '';
    el.querySelectorAll('.sinth-expr').forEach(sinthExpr);
  };
  if (hideEl) {
    el.style.display = 'none';
    if (ms > 0) setTimeout(show, ms);
    else show();
  } else {
    if (ms > 0) setTimeout(show, ms);
    else show();
  }
}
function sinthDelayExpr(el, _ctx) {
  if (el.dataset.sinthDelayDone) return;
  el.dataset.sinthDelayDone = '1';
  _ctx = _ctx || {};
  try {
    let fn = __X[el.dataset.sinthDelayExprId];
    let ms = fn ? parseInt(fn(_ctx)) || 0 : 0;
    let hideEl = el.dataset.sinthDelayHide !== 'false';
    let show = function() {
      if (hideEl) el.style.display = '';
      el.querySelectorAll('.sinth-expr').forEach(sinthExpr);
    };
    if (hideEl) {
      el.style.display = 'none';
      if (ms > 0) setTimeout(show, ms);
      else show();
    } else {
      if (ms > 0) setTimeout(show, ms);
      else show();
    }
  } catch(e) {}
}
`;
  }

  if (needsIf) {
    helpers += `
function sinthIfBlock(t) {
  let ifId = t.dataset.sinthIfId;
  let anchor = t.parentNode.querySelector('[data-sinth-if-anchor="' + ifId + '"]');
  let condFn = __X[t.dataset.sinthIfExpr];
  let cond = condFn ? condFn() : false;
  if (cond) {
    let elseA = t.parentNode.querySelector('[data-sinth-if-anchor="__else__' + ifId + '"]');
    if (elseA) {
      let c = elseA.nextSibling;
      while (c && c !== t) { let n = c.nextSibling; c.remove(); c = n; }
      elseA.remove();
    }
    if (t.dataset.sinthIfPersist === "true" && anchor) return;
    if (anchor && anchor._sinthReplaced && !t.dataset.sinthIfDelayHide) return;
    let _hasContent = anchor || t.parentNode.querySelector('[data-sinth-if-anchor="__else__' + ifId + '"]');
    if (t.dataset.sinthIfDelayHide === 'false' && t.dataset.sinthIfDelay && _hasContent) {
      let dms = parseInt(t.dataset.sinthIfDelay) || 0;
      setTimeout(function() {
        sinthReplaceInsert(t, anchor, ifId, t.dataset.sinthIfReplace);
      }, dms);
    } else {
      anchor = sinthReplaceInsert(t, anchor, ifId, t.dataset.sinthIfReplace);
    }
  } else {
    let runElse = function() {
      if (t.dataset.sinthIfPersist === "true") return;
      if (anchor) {
        if (anchor._sinthReplaced) {
          let insFirst = anchor._sinthInsertedFirst;
          let insLast = anchor._sinthInsertedLast;
          let rpParent = anchor._sinthReplacedParent;
          let rpNext = anchor._sinthReplacedNext;
          if (insFirst && insLast) {
            let cur = insFirst;
            while (cur && cur !== insLast) {
              let next = cur.nextSibling;
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
          if (anchor._sinthReplaced) {
            anchor._sinthReplaced.querySelectorAll('.sinth-expr').forEach(sinthExpr);
            if (anchor._sinthReplaced.dataset.sinthDelay) {
              delete anchor._sinthReplaced.dataset.sinthDelayDone;
              sinthDelay(anchor._sinthReplaced);
            }
            anchor._sinthReplaced = null;
            anchor._sinthReplacedParent = null;
            anchor._sinthReplacedNext = null;
            anchor._sinthInsertedFirst = null;
            anchor._sinthInsertedLast = null;
          }
        } else {
          let cur2 = anchor.nextSibling;
          while (cur2 && cur2 !== t) { let nx2 = cur2.nextSibling; cur2.remove(); cur2 = nx2; }
        }
        anchor.remove();
      }
      let elseT = t.nextElementSibling;
      if (elseT && elseT.hasAttribute('data-sinth-else')) {
        let elseIfId = elseT.dataset.sinthIfId;
        let ea = t.parentNode.querySelector('[data-sinth-if-anchor="__else__' + elseIfId + '"]');
        if (ea) {
          let cur3 = ea.nextSibling;
          while (cur3 && cur3 !== t) { let nx3 = cur3.nextSibling; cur3.remove(); cur3 = nx3; }
        } else {
          ea = document.createElement('span');
          ea.style.display = 'none';
          ea.dataset.sinthIfAnchor = '__else__' + elseIfId;
          t.parentNode.insertBefore(ea, t);
        }
        let ef = document.createRange().createContextualFragment(elseT.innerHTML);
        ef.querySelectorAll('.sinth-expr').forEach(sinthExpr);
        if (${needsDelay}) {
          ef.querySelectorAll('[data-sinth-delay]').forEach(sinthDelay);
          ef.querySelectorAll('[data-sinth-delay-expr-id]').forEach(function(el) { sinthDelayExpr(el, {}); });
        }
        let innerTemplates = ef.querySelectorAll('template[data-sinth-if-expr]');
        t.parentNode.insertBefore(ef, t);
        for (let i = 0; i < innerTemplates.length; i++) sinthIfBlock(innerTemplates[i]);
        ef.querySelectorAll('[data-sinth-delay]').forEach(function(el) {
          delete el.dataset.sinthDelayDone;
          sinthDelay(el);
        });
      } else {
        let ea2 = t.parentNode.querySelector('[data-sinth-if-anchor="__else__' + ifId + '"]');
        if (ea2) {
          let ec = ea2.nextSibling;
          while (ec && ec !== t) { let en = ec.nextSibling; ec.remove(); ec = en; }
          ea2.remove();
        }
        if (anchor) {
          let ac = anchor.nextSibling;
          while (ac && ac !== t) { let an = ac.nextSibling; ac.remove(); ac = an; }
        }
      }
    };
    let elseT = t.nextElementSibling;
    if (elseT && elseT.hasAttribute('data-sinth-else') && elseT.dataset.sinthIfDelayHide === 'false' && elseT.dataset.sinthIfDelay && anchor) {
      let edms = parseInt(elseT.dataset.sinthIfDelay) || 0;
      setTimeout(runElse, edms);
    } else {
      runElse();
    }
  }
}
`;
  }

  if (needsFor) {
    helpers += `
function hashString(str) {
  let hash = 0, i, chr;
  for (i = 0; i < str.length; i++) {
    chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return String(hash);
}
function sinthForBlock(t) {
  t.querySelectorAll('template[data-sinth-if-expr]').forEach(function(innerT) {
    innerT.dataset.sinthForHandled = '1';
  });
  let source = _sinthForData[t.dataset.sinthFor];
  if (source === undefined) source = [];
  let newHash = '';
  try { newHash = hashString(JSON.stringify(source)); } catch(e) { newHash = ''; }
  if (t.dataset.sinthForHash && t.dataset.sinthForHash === newHash) return;
  t.dataset.sinthForHash = newHash;
  let isObj = (typeof source === 'object' && source !== null && !Array.isArray(source));
  let entries;
  if (isObj) {
    entries = Object.entries(source);
  } else {
    if (!Array.isArray(source)) source = [];
    entries = source.map(function(item, index) { return [index, item]; });
  }
  let anchorId = t.dataset.sinthForExpr || t.dataset.sinthFor;
  let anchor = null;
  if (t.parentNode) {
    let all = t.parentNode.querySelectorAll('[data-sinth-for-anchor]');
    for (let i = 0; i < all.length; i++) {
      if (all[i].dataset.sinthForAnchor === anchorId) { anchor = all[i]; break; }
    }
  }
  if (anchor) {
    let cur2 = anchor.nextSibling;
    while (cur2 && cur2 !== t) { let nx2 = cur2.nextSibling; cur2.remove(); cur2 = nx2; }
    anchor.remove();
  }
  let fa = document.createElement('span');
  fa.style.display = 'none';
  fa.dataset.sinthForAnchor = anchorId;
  t.parentNode && t.parentNode.insertBefore(fa, t);
  let _loopIdx = 0;
  let tplContent = t.innerHTML;
  entries.forEach(function(entry) {
    let _k = entry[0], _v = entry[1];
    let _item = t.dataset.sinthItem || '__item__';
    let _key = t.dataset.sinthKey || null;
    let _idx = t.dataset.sinthIndex || null;
    _loopIdx++;
    let loopCtx = {};
    if (_item) loopCtx[_item] = _v;
    if (_key) loopCtx[_key] = _k;
    if (_idx) loopCtx[_idx] = _loopIdx - 1;
    let frag = document.createRange().createContextualFragment(tplContent);
    frag.querySelectorAll('.sinth-expr').forEach(function(el) {
      try { let fn = __X[el.dataset.exprId]; if (fn) el.textContent = fn(loopCtx); } catch(e) {}
      el.classList.remove('sinth-expr');
    });
    frag.querySelectorAll('[data-sinth-delay-expr-id]').forEach(function(el) {
      sinthDelayExpr(el, loopCtx);
    });    
    frag.querySelectorAll('[onclick*="_ctx."]').forEach(function(el) {
      var onclick = el.getAttribute('onclick');
      for (var key in loopCtx) {
        onclick = onclick.split('_ctx.' + key).join(JSON.stringify(loopCtx[key]));
      }
      el.setAttribute('onclick', onclick);
    });
    frag.querySelectorAll('template[data-sinth-if-expr]').forEach(function(ifT) {
      let condFn = __X[ifT.dataset.sinthIfExpr];
      let cond = condFn ? condFn(loopCtx) : false;
      if (cond) {
        let ifFrag = document.createRange().createContextualFragment(ifT.innerHTML);
        ifFrag.querySelectorAll('.sinth-expr').forEach(function(el2) {
          try { let fn2 = __X[el2.dataset.exprId]; if (fn2) el2.textContent = fn2(loopCtx); } catch(e) {}
          el2.classList.remove('sinth-expr');
        });
        ifT.replaceWith(ifFrag);
      } else {
        ifT.remove();
      }
    });
    t.parentNode && t.parentNode.insertBefore(frag, t);
  });
}
`;
  }

  return helpers;
}