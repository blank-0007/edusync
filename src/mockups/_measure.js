/* Dev-only layout checker. Load in every mockup; run with URL hash #measure.
   chrome --headless --dump-dom "file://.../01-library.html#measure"
   Replaces the DOM with a short report of clipped / out-of-frame / overflowing boxes. */
(function () {
  function sel(el) {
    var bits = [];
    while (el && el !== document.body) {
      var s = el.tagName.toLowerCase();
      if (el.id) { bits.unshift(s + '#' + el.id); break; }
      var cls = (el.className && typeof el.className === 'string') ? el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
      if (cls) s += '.' + cls;
      bits.unshift(s);
      el = el.parentElement;
      if (bits.length > 3) break;
    }
    return bits.join('>');
  }
  window.addEventListener('load', function () {
    if (location.hash !== '#measure') return;
    var out = [];
    var app = document.querySelector('.app');
    if (!app) { out.push('NO .app'); }
    var ar = app ? app.getBoundingClientRect() : { left: 0, top: 0, right: 0, bottom: 0 };
    var all = document.querySelectorAll('.app *');
    for (var i = 0; i < all.length; i++) {
      var el = all[i], cs = getComputedStyle(el);
      var r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && (r.right > ar.right + 1 || r.bottom > ar.bottom + 1 || r.left < ar.left - 1 || r.top < ar.top - 1)) {
        out.push('OUT  ' + sel(el) + '  l=' + Math.round(r.left) + ' t=' + Math.round(r.top) + ' r=' + Math.round(r.right) + ' b=' + Math.round(r.bottom));
      }
      if (el.clientHeight > 0 && el.scrollHeight > el.clientHeight + 1 && (cs.overflowY === 'hidden' || cs.overflow === 'hidden')) {
        out.push('CLIPY ' + sel(el) + '  sh=' + el.scrollHeight + ' ch=' + el.clientHeight);
      }
      if (el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1 && (cs.overflowX === 'hidden' || cs.overflow === 'hidden')) {
        out.push('CLIPX ' + sel(el) + '  sw=' + el.scrollWidth + ' cw=' + el.clientWidth);
      }
    }
    ['.app','.exam-head','.qrail','.exam-body','.exam-wrap','.exam-foot','.rail','.qcard','.ansbox','.body','.colstack'].forEach(function(sel){
      var el=document.querySelector(sel); if(!el) return;
      var r=el.getBoundingClientRect();
      out.push('KEY  '+sel+'  t='+Math.round(r.top)+' b='+Math.round(r.bottom)+' h='+Math.round(r.height)+' l='+Math.round(r.left)+' r='+Math.round(r.right));
    });
    var pre = document.createElement('pre');
    pre.id = 'report';
    pre.textContent = out.length ? out.join('  ||  ') : 'CLEAN';
    document.body.innerHTML = '';
    document.body.appendChild(pre);
  });
})();
