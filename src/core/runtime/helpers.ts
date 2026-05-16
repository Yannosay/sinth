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
    frag.querySelectorAll('[data-sinth-delay-expr-id]').forEach(function(el) { sinthDelayExpr(el, {}); });
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
  if (el.dataset.sinthDelayDone) { return; }
  el.dataset.sinthDelayDone = '1';
  var ms = parseInt(el.dataset.sinthDelay) || 0;
  if (el.dataset.sinthDelayHide !== 'false') {
    el.style.display = 'none';
  }
  var show = function() {
    el.style.display = '';
    el.querySelectorAll('.sinth-expr').forEach(sinthExpr);
  };
  if (ms > 0) setTimeout(show, ms);
  else show();
}
function sinthDelayExpr(el, _ctx) {
  _ctx = _ctx || {};
  try {
    var fn = __X[el.dataset.sinthDelayExprId];
    var ms = fn ? parseInt(fn(_ctx)) || 0 : 0;
    var show = function() {
      el.style.display = '';
      el.querySelectorAll('.sinth-expr').forEach(sinthExpr);
    };
    if (ms > 0) setTimeout(show, ms);
    else show();
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
    var _hasContent = anchor || t.parentNode.querySelector('[data-sinth-if-anchor="__else__' + ifId + '"]');
    if (t.dataset.sinthIfDelayHide === 'false' && t.dataset.sinthIfDelay && _hasContent) {
      var dms = parseInt(t.dataset.sinthIfDelay) || 0;
      setTimeout(function() {
        sinthReplaceInsert(t, anchor, ifId, t.dataset.sinthIfReplace);
      }, dms);
    } else {
      anchor = sinthReplaceInsert(t, anchor, ifId, t.dataset.sinthIfReplace);
    }
  } else {
    var runElse = function() {
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
          if (anchor._sinthReplaced && anchor._sinthReplaced.dataset.sinthDelay) {
            delete anchor._sinthReplaced.dataset.sinthDelayDone;
            sinthDelay(anchor._sinthReplaced);
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
          ef.querySelectorAll('[data-sinth-delay-expr-id]').forEach(function(el) { sinthDelayExpr(el, {}); });
        }
        t.parentNode.insertBefore(ef, t);
        ef.querySelectorAll('[data-sinth-delay]').forEach(function(el) {
          delete el.dataset.sinthDelayDone;
          sinthDelay(el);
        });
      } else {
        var ea2 = t.parentNode.querySelector('[data-sinth-if-anchor="__else__' + ifId + '"]');
        if (ea2) {
          var ec = ea2.nextSibling;
          while (ec && ec !== t) { var en = ec.nextSibling; ec.remove(); ec = en; }
          ea2.remove();
        }
      }
    };
    var elseT = t.nextElementSibling;
    if (elseT && elseT.hasAttribute('data-sinth-else') && elseT.dataset.sinthIfDelayHide === 'false' && elseT.dataset.sinthIfDelay && anchor) {
      var edms = parseInt(elseT.dataset.sinthIfDelay) || 0;
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
    var loopCtx = {};
    if (_item) loopCtx[_item] = _v;
    if (_key) loopCtx[_key] = _k;
    if (_idx) loopCtx[_idx] = _loopIdx - 1;
    var frag = document.createRange().createContextualFragment(t.innerHTML);
    frag.querySelectorAll('.sinth-expr').forEach(function(el) {
      try {
        var exprFn = __X[el.dataset.exprId];
        if (exprFn) el.textContent = exprFn(loopCtx);
      } catch(e) {}
      el.classList.remove('sinth-expr');
    });
    frag.querySelectorAll('template[data-sinth-if-expr]').forEach(function(ifT) {
      var condFn = __X[ifT.dataset.sinthIfExpr];
      var cond = false;
      try { if (condFn) cond = condFn(loopCtx); } catch(e) {}
      if (cond) {
        var ifContent = document.createRange().createContextualFragment(ifT.innerHTML);
        ifContent.querySelectorAll('.sinth-expr').forEach(function(el2) {
          try {
            var exprFn2 = __X[el2.dataset.exprId];
            if (exprFn2) el2.textContent = exprFn2(loopCtx);
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
              if (exprFn2) el2.textContent = exprFn2(loopCtx);
            } catch(e) {}
          });
          ifT.parentNode.insertBefore(elseContent, ifT);
        }
      }
    });
    if (${needsDelay}) {
      frag.querySelectorAll('[data-sinth-delay]').forEach(sinthDelay);
      frag.querySelectorAll('[data-sinth-delay-expr-id]').forEach(function(el) { sinthDelayExpr(el, loopCtx); });
    }
    t.parentNode && t.parentNode.insertBefore(frag, t);
  });
}
`;
  }

  return helpers;
}