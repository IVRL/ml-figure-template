/*! ml-figure-template v0.0.1 — https://github.com/IVRL/ml-figure-template */
(function() {

  var VERSION = '0.0.1';

  // Global defaults — can be overridden per-diagram via "defaults" in the JSON config
  const DEFAULTS = {
    strokeColor:   '#94a3b8',   // arrow stroke color
    strokeWidth:   2,           // arrow stroke width (px)
    markerWidth:   8,           // arrowhead spread perpendicular to arrow (in strokeWidth units)
    markerHeight:  10,          // arrowhead length along arrow direction (in strokeWidth units)
    pathTension:   0.3,         // Catmull-Rom tension for foreground paths (0 = straight, 0.5 = very curvy)
    pathWidth:     4,           // foreground path stroke width (px)
    pathColor:     '#7c3aed',   // foreground path color
    crossedColor:  '#dc2626'    // color of the × overlay on crossed-out labels
  };

  // Expand `data-row-gaps` on .mlfig-grid elements into real gap rows.
  // The attribute is a comma/space separated list of pixel values, one per
  // content row (use 0 to skip). The library inserts a `Npx` row between
  // each content row in grid-template-rows and an all-`.` row in
  // grid-template-areas, so each grid item stays in its original named cell.
  function expandRowGaps(grid) {
    if (grid.dataset._rowGapsExpanded) return;
    var raw = grid.dataset.rowGaps;
    if (!raw) return;
    var gaps = raw.split(/[\s,]+/).filter(Boolean).map(function(v){ return parseFloat(v) || 0; });
    var cs = grid.style.gridTemplateRows || getComputedStyle(grid).gridTemplateRows;
    var rows = cs.trim().split(/\s+/);
    var areasRaw = grid.style.gridTemplateAreas || getComputedStyle(grid).gridTemplateAreas;
    var areas = areasRaw.match(/"[^"]*"/g) || [];
    if (!rows.length || !areas.length) return;
    var colCount = areas[0].replace(/"/g,'').trim().split(/\s+/).length;
    var gapArea = '"' + new Array(colCount).fill('.').join(' ') + '"';
    var newRows = [];
    var newAreas = [];
    for (var i = 0; i < rows.length; i++) {
      newRows.push(rows[i]);
      newAreas.push(areas[i] || gapArea);
      var g = gaps[i];
      if (g && i < rows.length - 1) {
        newRows.push(g + 'px');
        newAreas.push(gapArea);
      }
    }
    grid.style.gridTemplateRows = newRows.join(' ');
    grid.style.gridTemplateAreas = newAreas.join(' ');
    grid.dataset._rowGapsExpanded = '1';
  }

  function ensureCredit(container) {
    var creditId = (container.id || 'mlfig') + '-credit';
    if (!document.getElementById(creditId)) {
      var creditEl = document.createElement('div');
      creditEl.id = creditId;
      creditEl.className = 'mlfig-credit';
      creditEl.innerHTML = '<span class="mlfig-credit-icon">i</span><span class="mlfig-credit-text">'
        + 'Diagram made with <a href="https://github.com/IVRL/ml-figure-template" target="_blank">IVRL/ml-figure-template</a>.<br>'
        + '<a href="https://github.com/IVRL/ml-figure-template/blob/main/LICENSE" target="_blank">Free to use with attribution</a>.<br>'
        + 'Template &copy; 2026 EPFL-IVRL and Martin Everaert'
        + '</span>';
      container.appendChild(creditEl);
    }
  }

  function ensureSaveButton(container) {
    var saveId = (container.id || 'mlfig') + '-save';
    if (document.getElementById(saveId)) return;
    var wrap = document.createElement('div');
    wrap.id = saveId;
    wrap.className = 'mlfig-save';
    wrap.setAttribute('role', 'button');
    wrap.setAttribute('tabindex', '0');
    wrap.setAttribute('aria-label', 'Save diagram as SVG');
    wrap.setAttribute('title', 'Save diagram as SVG');
    wrap.innerHTML = '<span class="mlfig-save-icon">'
      + '<svg viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">'
      + '<path d="M7 2 V9 M4 6 L7 9 L10 6 M3 11 H11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>'
      + '</svg></span>'
      + '<span class="mlfig-save-text">Save as SVG</span>';
    var onActivate = function (e) {
      e.preventDefault();
      e.stopPropagation();
      saveSvg(container);
    };
    wrap.addEventListener('click', onActivate);
    wrap.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') onActivate(e);
    });
    container.appendChild(wrap);
  }

  function showErrorBadge(container, message) {
    var id = (container.id || 'mlfig') + '-error';
    var el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      el.className = 'mlfig-error';
      el.innerHTML = '<span class="mlfig-error-icon">!</span><span class="mlfig-error-text"></span>';
      container.appendChild(el);
    }
    el.querySelector('.mlfig-error-text').innerHTML = message;
  }

  function clearErrorBadge(container) {
    var el = document.getElementById((container.id || 'mlfig') + '-error');
    if (el) el.remove();
  }

  function drawFigure(container) {
    // Expand variable row gaps on any .mlfig-grid children
    var grids = container.querySelectorAll('.mlfig-grid[data-row-gaps]');
    for (var gi = 0; gi < grids.length; gi++) expandRowGaps(grids[gi]);

    // Create or reuse the background SVG
    var svg = container.querySelector('.mlfig-svg');
    if (!svg) {
      svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'mlfig-svg');
      container.insertBefore(svg, container.firstChild);
    }

    // Read config from <script type="application/json"> inside the container
    const configEl = container.querySelector('script[type="application/json"]');
    if (!configEl) return;
    let cfg;
    var raw = configEl.textContent;
    try { cfg = JSON.parse(raw); } catch(e) {
      // Show the line/col where the error is, with context
      var m = e.message.match(/position (\d+)/);
      if (m) {
        var pos = parseInt(m[1]);
        var before = raw.substring(0, pos);
        var line = before.split('\n').length;
        var col = pos - before.lastIndexOf('\n');
        var lines = raw.split('\n');
        var snippet = lines[line - 1] ? lines[line - 1].trim() : '';
        console.warn('[ml-figure-template] Invalid JSON in #' + container.id + ' at line ' + line + ':' + col + '\n  → ' + snippet + '\n  ' + e.message);
      } else {
        console.warn('[ml-figure-template] Invalid JSON in #' + container.id + ': ' + e.message);
      }
      showErrorBadge(container, 'JSON config error<br>check the browser console for details.');
      ensureCredit(container);
      return;
    }
    clearErrorBadge(container);

    // Count config errors raised during this drawFigure pass so we can surface
    // them via the error badge at the end (each call also logs to the console).
    var configErrors = 0;
    function warnCfg(msg) { console.warn(msg); configErrors++; }

    // Per-diagram defaults override global defaults
    const diagDefaults = cfg.defaults || {};
    const defaultStrokeColor  = diagDefaults.strokeColor  || DEFAULTS.strokeColor;
    const defaultStrokeWidth  = diagDefaults.strokeWidth  || DEFAULTS.strokeWidth;
    const defaultMarkerWidth  = diagDefaults.markerWidth  || DEFAULTS.markerWidth;
    const defaultMarkerHeight = diagDefaults.markerHeight || DEFAULTS.markerHeight;
    // refX inset: small overlap (in marker units) so the line connects slightly inside the arrowhead base
    const defaultRefInset     = diagDefaults.refInset     || 2;

    const defaultPathTension  = diagDefaults.pathTension  !== undefined ? diagDefaults.pathTension : DEFAULTS.pathTension;
    const defaultPathWidth    = diagDefaults.pathWidth    || DEFAULTS.pathWidth;
    const defaultPathColor    = diagDefaults.pathColor    || DEFAULTS.pathColor;
    const defaultCrossedColor = diagDefaults.crossedColor || DEFAULTS.crossedColor;

    // Reset spacer before measuring to prevent feedback loop
    const oldSpacer = document.getElementById(container.id + '-scroll-spacer');
    if (oldSpacer) oldSpacer.style.width = '0px';

    const cRect = container.getBoundingClientRect();
    svg.setAttribute('width', cRect.width);
    svg.setAttribute('height', cRect.height);
    svg.innerHTML = '';

    // Labels overlay — real HTML divs for selectable text
    const labelsId = (container.id || 'mlfig') + '-labels';
    let labelsEl = document.getElementById(labelsId);
    if (!labelsEl) {
      labelsEl = document.createElement('div');
      labelsEl.id = labelsId;
      labelsEl.style.position = 'absolute';
      labelsEl.style.top = '0';
      labelsEl.style.left = '0';
      labelsEl.style.width = '100%';
      labelsEl.style.height = '100%';
      labelsEl.style.pointerEvents = 'none';
      labelsEl.style.zIndex = '2';
      container.appendChild(labelsEl);
    }
    labelsEl.innerHTML = '';

    // Arrowhead marker (scoped per diagram to avoid cross-SVG conflicts)
    const mid = container.id || ('mlfig-' + Math.random().toString(36).slice(2,8));
    const defs = document.createElementNS('http://www.w3.org/2000/svg','defs');
    svg.appendChild(defs);

    // Shared marker factory used by both arrow SVG and foreground-path SVG.
    // targetDefs: the <defs> element to append the marker to
    // prefix:     unique string prefix for the marker id (avoids cross-SVG conflicts)
    // cache:      object to store created marker ids (avoids duplicates)
    // color:      fill color of the arrowhead
    // reverse:    if true, the arrowhead points backwards (for biDirectional arrows)
    function createMarker(targetDefs, prefix, cache, color, reverse, mw, mh) {
      mw = mw || defaultMarkerWidth;
      mh = mh || defaultMarkerHeight;
      const key = (color || 'default') + (reverse ? '-rev' : '') + '-' + mw + 'x' + mh;
      if (cache[key]) return 'url(#' + cache[key] + ')';
      const id = prefix + key.replace(/[^a-z0-9]/gi, '');
      const m = document.createElementNS('http://www.w3.org/2000/svg','marker');
      // SVG markerWidth/Height = length/spread along/perpendicular to arrow
      const ml = mh, ms = mw, ms2 = ms / 2;
      m.setAttribute('id', id);
      m.setAttribute('markerWidth', ml);
      m.setAttribute('markerHeight', ms);
      m.setAttribute('refX', reverse ? ml - defaultRefInset : defaultRefInset);
      m.setAttribute('refY', ms2);
      m.setAttribute('orient','auto');
      m.setAttribute('markerUnits','strokeWidth');
      const p = document.createElementNS('http://www.w3.org/2000/svg','polygon');
      p.setAttribute('points', reverse
        ? ml+' 0, 0 '+ms2+', '+ml+' '+ms
        : '0 0, '+ml+' '+ms2+', 0 '+ms);
      p.setAttribute('fill', color);
      m.appendChild(p);
      targetDefs.appendChild(m);
      cache[key] = id;
      return 'url(#' + id + ')';
    }

    const markerCache = {};
    const markerRef = createMarker(defs, 'ah-' + mid + '-', markerCache, defaultStrokeColor, false);

    function pos(id) {
      // Scoped to the .mlfig container so multiple diagrams on the same page
      // can reuse short block ids (e.g. "input", "add") without colliding.
      const el = container.querySelector('#' + CSS.escape(id));
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        cx: r.left + r.width/2 - cRect.left,
        cy: r.top + r.height/2 - cRect.top,
        t: r.top - cRect.top,
        b: r.bottom - cRect.top,
        l: r.left - cRect.left,
        r: r.right - cRect.left,
        w: r.width, h: r.height
      };
    }

    // side: 'top' | 'bottom' | 'left' | 'right' | 'center'.
    // offsetX / offsetY shift the anchor point on each axis.
    function sideXY(p, side, offsetX, offsetY, alignId) {
      var a = alignId ? pos(alignId) : null;
      // Offsets accept numbers (px) or strings like "50%" / "-25%".
      // Percentages resolve against the target element's width (X) or height (Y).
      function resolve(v, basis) {
        if (typeof v === 'string' && v.slice(-1) === '%') return (parseFloat(v) / 100) * basis;
        return v || 0;
      }
      var ox = resolve(offsetX, p.w);
      var oy = resolve(offsetY, p.h);
      switch (side) {
        case 'top':    return [a ? a.cx : p.cx + ox, p.t + oy];
        case 'bottom': return [a ? a.cx : p.cx + ox, p.b + oy];
        case 'left':   return [p.l + ox, a ? a.cy : p.cy + oy];
        case 'right':  return [p.r + ox, a ? a.cy : p.cy + oy];
        default:       return [p.cx + ox, p.cy + oy];
      }
    }

    function applyStyle(el, opts) {
      var color = opts.color || defaultStrokeColor;
      var d = opts._defs || defs;
      var c = opts._cache || markerCache;
      var p = opts._prefix || ('ah-' + mid + '-');
      el.setAttribute('stroke', color);
      el.setAttribute('stroke-width', opts.strokeWidth);
      if (opts.dashed) el.setAttribute('stroke-dasharray', opts.dashed);
      if (!opts.noArrow) {
        var mref = opts.color ? createMarker(d, p, c, opts.color, false, opts.markerWidth, opts.markerHeight) : markerRef;
        el.setAttribute('marker-end', mref);
      }
      if (opts.biDirectional) {
        el.setAttribute('marker-start', createMarker(d, p, c, color, true, opts.markerWidth, opts.markerHeight));
      }
    }


    // Shorten a segment [x1,y1]->[x2,y2] by len at the end (dir=1) or start (dir=-1)
    function shorten(x1, y1, x2, y2, len, dir) {
      var dx = x2-x1, dy = y2-y1;
      var l = Math.sqrt(dx*dx+dy*dy) || 1;
      var r = len / l;
      if (dir > 0) { return [x2 - dx*r, y2 - dy*r]; } // shorten end
      else         { return [x1 + dx*r, y1 + dy*r]; } // shorten start
    }

    function drawLine(x1,y1,x2,y2,opts) {
      opts = opts || {};
      // Shorten ends that have markers
      if (!opts.noArrow) {
        var e = shorten(x1,y1,x2,y2, (opts.markerHeight - defaultRefInset) * opts.strokeWidth, 1);
        x2 = e[0]; y2 = e[1];
      }
      if (opts.biDirectional) {
        var s = shorten(x1,y1,x2,y2, (opts.markerHeight - defaultRefInset) * opts.strokeWidth, -1);
        x1 = s[0]; y1 = s[1];
      }
      var line = document.createElementNS('http://www.w3.org/2000/svg','line');
      line.setAttribute('x1',x1); line.setAttribute('y1',y1);
      line.setAttribute('x2',x2); line.setAttribute('y2',y2);
      applyStyle(line, opts);
      return line;
    }

    function drawPolyline(points,opts) {
      opts = opts || {};
      var pts = points.slice();
      // Shorten last segment for end marker
      if (!opts.noArrow && pts.length >= 2) {
        var last = pts[pts.length-1], prev = pts[pts.length-2];
        var e = shorten(prev[0],prev[1],last[0],last[1], (opts.markerHeight - defaultRefInset) * opts.strokeWidth, 1);
        pts[pts.length-1] = e;
      }
      // Shorten first segment for start marker
      if (opts.biDirectional && pts.length >= 2) {
        var first = pts[0], next = pts[1];
        var s = shorten(first[0],first[1],next[0],next[1], (opts.markerHeight - defaultRefInset) * opts.strokeWidth, -1);
        pts[0] = s;
      }
      var pathData = 'M ' + pts[0].join(',');
      for (var i=1; i<pts.length; i++) pathData += ' L ' + pts[i].join(',');
      var path = document.createElementNS('http://www.w3.org/2000/svg','path');
      path.setAttribute('d', pathData);
      path.setAttribute('fill','none');
      applyStyle(path, opts);
      return path;
    }

    // anchor: controls which edge of the rotated text touches the anchor point
    //   'top' = label above anchor, 'bottom' = label below anchor
    //   'left'/'right' = same idea horizontally
    //   default (undefined) = centered at anchor
    function addRotatedLabel(g, x, y, text, angle, opts) {
      opts = opts || {};
      var div = document.createElement('div');
      div.className = 'mlfig-svg-label-html';
      div.style.position = 'absolute';
      div.style.left = x + 'px';
      div.style.top = y + 'px';
      div.style.transform = 'translate(-50%, -50%) rotate(' + angle + 'deg)';
      div.style.display = 'flex';
      div.style.alignItems = 'center';
      div.style.justifyContent = 'center';
      div.style.pointerEvents = 'auto';
      if (opts.color) { div.style.color = opts.color; div.style.opacity = '1'; }
      if (opts.opacity) div.style.opacity = opts.opacity;
      if (opts.fontSize) div.style.fontSize = opts.fontSize;
      if (opts.id) div.id = opts.id;
      div.innerHTML = text;
      labelsEl.appendChild(div);

      // Shift so the specified edge (not center) lands at the anchor point
      var anchor = opts.anchor;
      if (anchor) {
        var w = div.offsetWidth, h = div.offsetHeight;
        var rad = Math.abs(angle) * Math.PI / 180;
        var vW = w * Math.abs(Math.cos(rad)) + h * Math.abs(Math.sin(rad));
        var vH = w * Math.abs(Math.sin(rad)) + h * Math.abs(Math.cos(rad));
        if (anchor === 'top')         div.style.top  = (y - vH / 2) + 'px';
        else if (anchor === 'bottom') div.style.top  = (y + vH / 2) + 'px';
        else if (anchor === 'left')   div.style.left = (x - vW / 2) + 'px';
        else if (anchor === 'right')  div.style.left = (x + vW / 2) + 'px';
      }
    }

    // align: 'left'|'right'|'center' — controls which edge touches the anchor point
    // 'left' means text starts at x (goes right), 'right' means text ends at x (goes left)
    function addLabel(g, x, y, text, opts) {
      opts = opts || {};
      var align = opts.align || 'center';
      var div = document.createElement('div');
      div.className = 'mlfig-svg-label-html';
      div.style.pointerEvents = 'auto';
      div.style.textAlign = align;
      if (opts.color) { div.style.color = opts.color; div.style.opacity = '1'; }
      if (opts.fontSize) div.style.fontSize = opts.fontSize;
      if (opts.id) div.id = opts.id;
      div.innerHTML = text;

      // Position the container (wrapper if crossed, div itself otherwise)
      function positionEl(el) {
        el.style.position = 'absolute';
        el.style.top = (y - 10) + 'px';
        if (align === 'center') {
          el.style.left = x + 'px';
          el.style.transform = 'translateX(-50%)';
        } else if (align === 'right') {
          el.style.right = (cRect.width - x) + 'px';
        } else {
          el.style.left = x + 'px';
        }
      }

      if (opts.crossed) {
        var wrapper = document.createElement('div');
        wrapper.style.pointerEvents = 'auto';
        positionEl(wrapper);
        div.style.position = 'relative';
        div.style.display = 'inline-block';
        var xSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        xSvg.style.position = 'absolute';
        xSvg.style.inset = '-4px';
        xSvg.style.width = 'calc(100% + 8px)';
        xSvg.style.height = 'calc(100% + 8px)';
        xSvg.style.pointerEvents = 'none';
        xSvg.style.zIndex = '15';
        var l1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        l1.setAttribute('x1', '10%'); l1.setAttribute('y1', '10%');
        l1.setAttribute('x2', '90%'); l1.setAttribute('y2', '90%');
        l1.setAttribute('stroke', opts.crossedColor || defaultCrossedColor);
        l1.setAttribute('stroke-width', '3');
        l1.setAttribute('vector-effect', 'non-scaling-stroke');
        var l2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        l2.setAttribute('x1', '90%'); l2.setAttribute('y1', '10%');
        l2.setAttribute('x2', '10%'); l2.setAttribute('y2', '90%');
        l2.setAttribute('stroke', opts.crossedColor || defaultCrossedColor);
        l2.setAttribute('stroke-width', '3');
        l2.setAttribute('vector-effect', 'non-scaling-stroke');
        xSvg.appendChild(l1);
        xSvg.appendChild(l2);
        wrapper.appendChild(div);
        wrapper.appendChild(xSvg);
        labelsEl.appendChild(wrapper);
      } else {
        positionEl(div);
        labelsEl.appendChild(div);
      }
    }

    // ── Bounding boxes (drawn first so they render behind arrows) ──

    var boxes = cfg.boundingBoxes || [];
    for (var i = 0; i < boxes.length; i++) {
      var box = boxes[i];
      var padX = box.paddingX !== undefined ? box.paddingX : (box.padding || 6);
      var padY = box.paddingY !== undefined ? box.paddingY : (box.padding || 6);
      var hIds = box.hExtent || [];
      var vIds = box.vExtent || [];
      var minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity;
      for (var j=0; j<hIds.length; j++) { var p=pos(hIds[j]); if(!p){ warnCfg('[ml-figure-template] Box' + (box.label ? ' "' + box.label + '"' : '') + ': hExtent element "' + hIds[j] + '" not found'); continue; } if(p.l<minX)minX=p.l; if(p.r>maxX)maxX=p.r; }
      for (var j=0; j<vIds.length; j++) { var p=pos(vIds[j]); if(!p){ warnCfg('[ml-figure-template] Box' + (box.label ? ' "' + box.label + '"' : '') + ': vExtent element "' + vIds[j] + '" not found'); continue; } if(p.t<minY)minY=p.t; if(p.b>maxY)maxY=p.b; }
      if (minX===Infinity || minY===Infinity) continue;
      minX -= padX; maxX += padX;

      var rect = document.createElementNS('http://www.w3.org/2000/svg','rect');
      rect.setAttribute('x', minX);
      rect.setAttribute('y', minY - padY);
      rect.setAttribute('width', maxX - minX);
      rect.setAttribute('height', maxY - minY + padY*2);
      rect.setAttribute('rx', '10');
      rect.setAttribute('ry', '10');
      rect.setAttribute('fill', box.filled ? (box.fillColor || '#f5f5f5') : 'none');
      rect.setAttribute('stroke', box.color || '#f59e0b');
      rect.setAttribute('stroke-width', box.filled ? '1' : '2');
      rect.setAttribute('stroke-dasharray', box.filled ? 'none' : '8 4');
      rect.setAttribute('opacity', box.filled ? '0.5' : '0.6');
      layerSvg(box).appendChild(rect);

      if (box.label) {
        var lp = box.labelPosition || 'left';
        var lColor = box.color || '#f59e0b';
        var lOpts = { color: lColor, opacity: '0.8', fontSize: '12px' };
        if (lp === 'bottom') {
          addLabel(svg, (minX + maxX) / 2, maxY + padY + 14, box.label, lOpts);
        } else if (lp === 'top') {
          addLabel(svg, (minX + maxX) / 2, minY - padY - 4, box.label, lOpts);
        } else {
          addRotatedLabel(svg, minX + 14, (minY + maxY) / 2, box.label, 90, lOpts);
        }
      }
    }

    // ── Draw arrows from config ──

    var arrows = cfg.arrows || [];
    for (var i = 0; i < arrows.length; i++) {
      var a = arrows[i];
      var fp = pos(a.from), tp = pos(a.to);
      if (!fp || !tp) {
        warnCfg('[ml-figure-template] Arrow "' + a.from + '" → "' + a.to + '": ' + (!fp ? '"' + a.from + '"' : '"' + a.to + '"') + ' not found');
        continue;
      }

      var fromSide = a.fromSide || 'bottom';
      var toSide   = a.toSide   || 'top';
      var from = sideXY(fp, fromSide, a.fromOffsetX, a.fromOffsetY, a.fromAlign);
      var to   = sideXY(tp, toSide,   a.toOffsetX,   a.toOffsetY,   a.toAlign);

      var g = document.createElementNS('http://www.w3.org/2000/svg','g');
      g.classList.add('mlfig-svg-arrow');
      var aDefs = layerDefs(a);
      var aCache = layerMarkerCache(a);
      var aPrefix = 'ah-' + (a.layer === 'fg' ? fgSvgId : mid) + '-';
      var opts = {
        noArrow: a.noArrow, color: a.color, dashed: a.dashed, biDirectional: a.biDirectional,
        strokeWidth:  a.strokeWidth  || defaultStrokeWidth,
        markerWidth:  a.markerWidth  || defaultMarkerWidth,
        markerHeight: a.markerHeight || defaultMarkerHeight,
        _defs: aDefs, _cache: aCache, _prefix: aPrefix
      };

      if (a.route === 'arc') {
        // Curved arrow using quadratic bezier
        // Control point = the corner of the equivalent L-shape
        var vFirst = a.verticalFirst !== undefined ? a.verticalFirst
          : (fromSide === 'bottom' || fromSide === 'top');
        var cx, cy;
        if (vFirst) {
          cx = from[0]; cy = to[1];
        } else {
          cx = to[0]; cy = from[1];
        }
        // Shorten endpoints along tangent to account for marker size
        var startX = from[0], startY = from[1];
        var endX = to[0], endY = to[1];
        if (opts.biDirectional) {
          var t0dx = cx - from[0], t0dy = cy - from[1];
          var t0len = Math.sqrt(t0dx*t0dx + t0dy*t0dy) || 1;
          startX += (t0dx/t0len) * (opts.markerHeight - defaultRefInset) * opts.strokeWidth;
          startY += (t0dy/t0len) * (opts.markerHeight - defaultRefInset) * opts.strokeWidth;
        }
        if (!opts.noArrow) {
          var t1dx = to[0] - cx, t1dy = to[1] - cy;
          var t1len = Math.sqrt(t1dx*t1dx + t1dy*t1dy) || 1;
          endX -= (t1dx/t1len) * (opts.markerHeight - defaultRefInset) * opts.strokeWidth;
          endY -= (t1dy/t1len) * (opts.markerHeight - defaultRefInset) * opts.strokeWidth;
        }
        var pathData = 'M ' + startX + ',' + startY + ' Q ' + cx + ',' + cy + ' ' + endX + ',' + endY;
        var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', pathData);
        path.setAttribute('fill', 'none');
        applyStyle(path, opts);
        g.appendChild(path);
        if (a.label) {
          var lx = 0.25*from[0] + 0.5*cx + 0.25*to[0] + (a.labelOffsetX || 0);
          var ly = 0.25*from[1] + 0.5*cy + 0.25*to[1] - 8 + (a.labelOffsetY || 0);
          addLabel(g, lx, ly, a.label, { color: a.color, fontSize: a.labelFontSize, id: a.labelId, crossed: a.labelCrossed });
        }
      } else if (a.route === 'u') {
        // U-shape: from center/any → out to one side → vertical → into target side
        var bo = a.bendOffset || 30;
        var outX;
        if (toSide === 'right') {
          outX = Math.max(from[0], to[0]) + bo;
        } else if (toSide === 'left') {
          outX = Math.min(from[0], to[0]) - bo;
        } else {
          outX = from[0] + bo;
        }
        var pts = [from, [outX, from[1]], [outX, to[1]], to];
        g.appendChild(drawPolyline(pts, opts));
        if (a.label) {
          var vx = pts[1][0] + (a.labelSide === 'left' ? -10 : 10);
          var vy = (pts[1][1] + pts[2][1]) / 2;
          addRotatedLabel(g, vx, vy, a.label, -90, { color: a.color, id: a.labelId, crossed: a.labelCrossed });
        }
      } else if (a.route === 'l') {
        var bo = a.bendOffset || 0;
        var pts;
        var vFirst = a.verticalFirst !== undefined ? a.verticalFirst
          : (fromSide === 'bottom' || fromSide === 'top');
        if (vFirst) {
          pts = [from, [from[0] + bo, to[1]], to];
        } else {
          pts = [from, [to[0] + bo, from[1]], to];
        }
        g.appendChild(drawPolyline(pts, opts));
        if (a.label) {
          if (vFirst) {
            // Vertical first segment: rotated label centered on it
            var vx = from[0] + (a.labelSide === 'left' ? -10 : 10);
            var vy = (from[1] + pts[1][1]) / 2;
            addRotatedLabel(g, vx, vy, a.label, -90, { color: a.color, id: a.labelId, crossed: a.labelCrossed });
          } else {
            // Horizontal first: label on the first segment, centered above/below
            var lo2 = a.labelOffset || 8;
            var lx = (from[0] + pts[1][0]) / 2;
            var ly = from[1] + (a.labelSide === 'bottom' ? lo2 : -lo2);
            addLabel(g, lx, ly, a.label, { id: a.labelId, crossed: a.labelCrossed });
          }
        }
      } else if (!a.route || a.route === 's' || a.route === 'straight') {
        // Straight arrow
        g.appendChild(drawLine(from[0], from[1], to[0], to[1], opts));
        if (a.label) {
          var lo = a.labelOffset || 8;
          var isV = Math.abs(from[0]-to[0]) < 5;
          var isH = Math.abs(from[1]-to[1]) < 5;
          var lx = (from[0]+to[0])/2;
          var ly = (from[1]+to[1])/2;
          var al = 'center';
          var side = a.labelSide || '';
          if (isV) {
            lx += (side === 'left' ? -lo : lo);
            al = side === 'left' ? 'right' : 'left';
          } else if (isH) {
            if (side === 'top')         ly -= lo;
            else if (side === 'bottom') ly += lo;
            else if (side === 'left')   lx -= lo;
            else if (side === 'right')  lx += lo;
            else                        ly -= lo;
          } else {
            if (a.labelSide === 'left') { lx -= lo; al = 'right'; }
            else { lx += lo; al = 'left'; }
            ly -= lo;
          }
          if (a.labelRotate) {
            addRotatedLabel(g, lx, ly, a.label, a.labelRotate, { anchor: side, color: a.color, fontSize: a.labelFontSize, id: a.labelId, crossed: a.labelCrossed });
          } else {
            addLabel(g, lx, ly, a.label, { align: al, color: a.color, fontSize: a.labelFontSize, id: a.labelId, crossed: a.labelCrossed });
          }
        }
      }
      layerSvg(a).appendChild(g);
    }

    // ── Layer labels ──

    var layerLabels = cfg.layerLabels || [];
    for (var i = 0; i < layerLabels.length; i++) {
      var ll = layerLabels[i];
      var parentEl = container.querySelector('#' + CSS.escape(ll.parent));
      if (!parentEl) { warnCfg('[ml-figure-template] Layer label: parent "' + ll.parent + '" not found'); continue; }
      var oldLabels = parentEl.querySelectorAll('.mlfig-layer-label');
      for (var j = oldLabels.length-1; j >= 0; j--) oldLabels[j].remove();
      for (var j = 0; j < ll.targets.length; j++) {
        var t = ll.targets[j];
        var tPos = pos(t.alignWith);
        if (!tPos) { warnCfg('[ml-figure-template] Layer label: alignWith "' + t.alignWith + '" not found'); continue; }
        var lbl = document.createElement('span');
        lbl.className = 'mlfig-layer-label';
        lbl.textContent = t.text;
        lbl.style.left = (tPos.cx - pos(ll.parent).l) + 'px';
        parentEl.appendChild(lbl);
      }
    }

    // ── Tooltip column widths ──
    // For [data-tip-fill-col] elements, measure the grid column width
    // by temporarily stretching, then set --col-width for the tooltip.
    var grid = container.querySelector('.mlfig-grid');
    if (grid) {
      var tips = grid.querySelectorAll('[data-tip][data-tip-fill-col]');
      for (var j = 0; j < tips.length; j++) {
        var el = tips[j];
        var oldJS = el.style.justifySelf;
        var oldW = el.style.width;
        el.style.justifySelf = 'stretch';
        el.style.width = 'auto';
        var colW = el.offsetWidth;
        el.style.justifySelf = oldJS;
        el.style.width = oldW;
        el.style.setProperty('--col-width', colW + 'px');
      }
    }

    // ── Foreground SVG (above blocks, z-index 10) — used when layer: "fg" ──

    var fgSvgId = mid + '-fg-svg';
    var fgSvg = document.getElementById(fgSvgId);
    if (!fgSvg) {
      fgSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      fgSvg.id = fgSvgId;
      fgSvg.setAttribute('class', 'mlfig-svg');
      fgSvg.style.zIndex = '10';
      container.appendChild(fgSvg);
    }
    fgSvg.setAttribute('width', cRect.width);
    fgSvg.setAttribute('height', cRect.height);
    fgSvg.innerHTML = '';

    var fgDefs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    fgSvg.appendChild(fgDefs);
    var fgMarkerCache = {};

    // Helper: pick the right SVG based on layer property
    function layerSvg(element) { return element.layer === 'fg' ? fgSvg : svg; }
    function layerDefs(element) { return element.layer === 'fg' ? fgDefs : defs; }
    function layerMarkerCache(element) { return element.layer === 'fg' ? fgMarkerCache : markerCache; }

    // ── Paths (smooth bezier curves) ──

    var paths = cfg.paths || [];
    if (paths.length > 0) {
      for (var i = 0; i < paths.length; i++) {
        var pc = paths[i];
        var pts = [];
        var waypoints = pc.points || [];
        for (var j = 0; j < waypoints.length; j++) {
          var wp = waypoints[j];
          var p = pos(wp.id);
          if (!p) { warnCfg('[ml-figure-template] Path waypoint "' + wp.id + '" not found'); continue; }
          if (wp.x !== undefined && wp.y !== undefined) {
            // Absolute offset from element's top-left
            pts.push([p.l + wp.x, p.t + wp.y]);
          } else {
            pts.push(sideXY(p, wp.side || 'center', wp.offsetX, wp.offsetY));
          }
        }
        if (pts.length < 2) continue;

        // Generate smooth path using Catmull-Rom to cubic Bezier conversion
        // Arrow shortening is applied to the LAST segment using the curve's actual
        // tangent direction (not the chord), so the marker orientation matches the
        // curve's slope exactly.
        var pathData = 'M ' + pts[0][0] + ',' + pts[0][1];
        var tension = pc.tension !== undefined ? pc.tension : defaultPathTension;
        var sw = pc.strokeWidth || defaultPathWidth;
        var shrink = pc.arrow ? ((pc.markerHeight || defaultMarkerHeight) - defaultRefInset) * sw : 0;

        if (pts.length === 2) {
          // Straight line: shorten along the chord
          if (shrink > 0) {
            var sdx = pts[1][0] - pts[0][0], sdy = pts[1][1] - pts[0][1];
            var sdist = Math.sqrt(sdx * sdx + sdy * sdy) || 1;
            pathData += ' L ' + (pts[1][0] - sdx / sdist * shrink) + ',' + (pts[1][1] - sdy / sdist * shrink);
          } else {
            pathData += ' L ' + pts[1][0] + ',' + pts[1][1];
          }
        } else {
          for (var j = 0; j < pts.length - 1; j++) {
            var p0 = pts[j === 0 ? 0 : j - 1];
            var p1 = pts[j];
            var p2 = pts[j + 1];
            var p3 = pts[j + 2 < pts.length ? j + 2 : pts.length - 1];

            // Last segment: dampen tension to reduce Catmull-Rom overshoot at the endpoint.
            var t = (j === pts.length - 2) ? tension / 4 : tension;

            var cp1x = p1[0] + (p2[0] - p0[0]) * t;
            var cp1y = p1[1] + (p2[1] - p0[1]) * t;
            var cp2x = p2[0] - (p3[0] - p1[0]) * t;
            var cp2y = p2[1] - (p3[1] - p1[1]) * t;

            var endX = p2[0], endY = p2[1];

            // Last segment + arrow: shorten along the actual tangent direction at the endpoint.
            // The tangent of a cubic Bezier at t=1 is (endpoint - cp2). Shifting both the
            // endpoint and cp2 by the same offset preserves the tangent direction exactly.
            if (j === pts.length - 2 && shrink > 0) {
              var tdx = endX - cp2x, tdy = endY - cp2y;
              var tlen = Math.sqrt(tdx * tdx + tdy * tdy) || 1;
              var nx = tdx / tlen, ny = tdy / tlen;
              endX -= nx * shrink;
              endY -= ny * shrink;
              cp2x -= nx * shrink;
              cp2y -= ny * shrink;
            }

            pathData += ' C ' + cp1x + ',' + cp1y + ' ' + cp2x + ',' + cp2y + ' ' + endX + ',' + endY;
          }
        }

        var pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        pathEl.setAttribute('d', pathData);
        pathEl.setAttribute('fill', 'none');
        pathEl.setAttribute('stroke', pc.color || defaultPathColor);
        pathEl.setAttribute('stroke-width', pc.strokeWidth || defaultPathWidth);
        if (pc.dashed) pathEl.setAttribute('stroke-dasharray', pc.dashed);
        pathEl.setAttribute('stroke-linecap', 'round');
        if (pc.arrow) {
          var pDefs = layerDefs(pc);
          var pCache = layerMarkerCache(pc);
          var pPrefix = (pc.layer === 'fg' ? fgSvgId : mid) + '-m-';
          pathEl.setAttribute('marker-end', createMarker(pDefs, pPrefix, pCache, pc.color || defaultPathColor, false, pc.markerWidth, pc.markerHeight));
        }
        layerSvg(pc).appendChild(pathEl);
      }
    }

    // ── Scroll spacer ──
    // SVG content (arrows, bounding boxes with padding) may extend beyond
    // the container's natural width. An invisible spacer div ensures the
    // parent overflow-x:auto container scrolls far enough to reveal it all.

    var svgMaxX = 0;
    // Check bounding box rects for the rightmost painted edge
    var svgRects = svg.querySelectorAll('rect');
    for (var j = 0; j < svgRects.length; j++) {
      var rx = parseFloat(svgRects[j].getAttribute('x')) + parseFloat(svgRects[j].getAttribute('width'));
      if (rx > svgMaxX) svgMaxX = rx;
    }
    var spacerId = container.id + '-scroll-spacer';
    var spacer = document.getElementById(spacerId);
    if (!spacer) {
      spacer = document.createElement('div');
      spacer.id = spacerId;
      spacer.style.height = '1px';
      spacer.style.pointerEvents = 'none';
      spacer.style.marginTop = '-1px';
      container.appendChild(spacer);
    }
    spacer.style.width = Math.ceil(svgMaxX) + 'px';

    // ── Credit watermark ──
    ensureCredit(container);

    // ── Save-as-SVG button ──
    ensureSaveButton(container);

    // ── Print vars ──
    container.style.setProperty('--mlfig-w', cRect.width + 'px');
    container.style.setProperty('--mlfig-z', Math.min(1, 650 / cRect.width));

    // Surface any config errors raised during this pass via the error badge.
    if (configErrors > 0) {
      showErrorBadge(container, configErrors + ' config error' + (configErrors > 1 ? 's' : '') + '<br>check the browser console for details.');
    }
  }

  // ── Export a diagram as a standalone SVG file ──
  // Wraps the .mlfig container's live DOM in an <svg><foreignObject>. Rather
  // than try to inline stylesheet rules (which is blocked by CORS for
  // cross-origin sheets and fails entirely on file://), we copy each
  // element's computed style onto the clone. To keep size sane, each
  // property is compared against (a) the UA default for a fresh same-tag
  // element in a blank sandbox, and (b) the parent's computed value when
  // the property is inherited — both cases are skipped.
  var _styleSandbox = null;
  var _defaultStyleCache = {};
  // Properties always skipped in the exported SVG: logical duplicates of
  // physical properties, transition/animation state (no effect in a static
  // file), origin values (only matter when transform is applied), most
  // vendor prefixes, and the SVG `d` computed value (already an attribute).
  var _skipProps = {
    // logical-property duplicates of physical box-model properties
    'block-size': 1, 'inline-size': 1,
    'min-block-size': 1, 'min-inline-size': 1,
    'max-block-size': 1, 'max-inline-size': 1,
    'border-block-start-color': 1, 'border-block-end-color': 1,
    'border-inline-start-color': 1, 'border-inline-end-color': 1,
    'border-block-start-style': 1, 'border-block-end-style': 1,
    'border-inline-start-style': 1, 'border-inline-end-style': 1,
    'border-block-start-width': 1, 'border-block-end-width': 1,
    'border-inline-start-width': 1, 'border-inline-end-width': 1,
    'border-start-start-radius': 1, 'border-start-end-radius': 1,
    'border-end-start-radius': 1, 'border-end-end-radius': 1,
    'padding-block-start': 1, 'padding-block-end': 1,
    'padding-inline-start': 1, 'padding-inline-end': 1,
    'margin-block-start': 1, 'margin-block-end': 1,
    'margin-inline-start': 1, 'margin-inline-end': 1,
    'inset-block-start': 1, 'inset-block-end': 1,
    'inset-inline-start': 1, 'inset-inline-end': 1,
    // no effect in a static snapshot
    'perspective-origin': 1, 'transform-origin': 1,
    'transition': 1, 'transition-behavior': 1, 'transition-delay': 1,
    'transition-duration': 1, 'transition-property': 1, 'transition-timing-function': 1,
    'animation': 1, 'animation-delay': 1, 'animation-direction': 1,
    'animation-duration': 1, 'animation-fill-mode': 1, 'animation-iteration-count': 1,
    'animation-name': 1, 'animation-play-state': 1, 'animation-timing-function': 1,
    // SVG path data is already serialized as the `d` attribute
    'd': 1
  };
  // Properties whose typical "no-op" value differs from the UA default.
  // Skip the property when it equals the listed value.
  var _noopValues = {
    'min-width': 'auto', 'min-height': 'auto',
    'overflow-x': 'visible', 'overflow-y': 'visible',
    'overflow-block': 'visible', 'overflow-inline': 'visible'
  };
  // `top`/`right`/`bottom`/`left` only have an effect on positioned
  // elements. When `position` is `static` or `relative` with value `0px`
  // they can be safely dropped.
  var _insetProps = { 'top': 1, 'right': 1, 'bottom': 1, 'left': 1 };
  // SVG presentation properties: redundant with the same-named SVG
  // attributes (which the library sets). Skipping them on SVG elements
  // drops a lot of `style="stroke:...;stroke-width:...;fill:..."`.
  var _svgPresProps = {
    'fill': 1, 'fill-opacity': 1, 'fill-rule': 1,
    'stroke': 1, 'stroke-width': 1, 'stroke-opacity': 1,
    'stroke-dasharray': 1, 'stroke-dashoffset': 1,
    'stroke-linecap': 1, 'stroke-linejoin': 1, 'stroke-miterlimit': 1,
    'marker': 1, 'marker-end': 1, 'marker-mid': 1, 'marker-start': 1,
    'vector-effect': 1, 'clip-rule': 1, 'shape-rendering': 1,
    'color-interpolation': 1, 'color-interpolation-filters': 1,
    'color-rendering': 1, 'dominant-baseline': 1, 'text-anchor': 1,
    'paint-order': 1
  };
  var _svgNS = 'http://www.w3.org/2000/svg';
  // Properties whose resolved value is commonly `currentColor` — if they
  // equal the element's own `color`, they're redundant.
  var _currentColorProps = {
    'border-top-color': 1, 'border-right-color': 1, 'border-bottom-color': 1, 'border-left-color': 1,
    'outline-color': 1, 'column-rule-color': 1, 'text-decoration-color': 1,
    'caret-color': 1, 'text-emphasis-color': 1,
    '-webkit-text-fill-color': 1, '-webkit-text-stroke-color': 1
  };
  // CSS properties that inherit from the parent. Custom properties (--*)
  // are always inherited and are handled separately.
  var _inheritedProps = {
    'azimuth': 1, 'border-collapse': 1, 'border-spacing': 1, 'caption-side': 1,
    'caret-color': 1, 'color': 1, 'cursor': 1, 'direction': 1, 'empty-cells': 1,
    'font': 1, 'font-family': 1, 'font-feature-settings': 1, 'font-kerning': 1,
    'font-language-override': 1, 'font-optical-sizing': 1, 'font-palette': 1,
    'font-size': 1, 'font-size-adjust': 1, 'font-stretch': 1, 'font-style': 1,
    'font-synthesis': 1, 'font-synthesis-small-caps': 1, 'font-synthesis-style': 1,
    'font-synthesis-weight': 1, 'font-variant': 1, 'font-variant-alternates': 1,
    'font-variant-caps': 1, 'font-variant-east-asian': 1, 'font-variant-emoji': 1,
    'font-variant-ligatures': 1, 'font-variant-numeric': 1, 'font-variant-position': 1,
    'font-weight': 1, 'hyphens': 1, 'image-orientation': 1, 'image-rendering': 1,
    'letter-spacing': 1, 'line-break': 1, 'line-height': 1, 'list-style': 1,
    'list-style-image': 1, 'list-style-position': 1, 'list-style-type': 1,
    'math-depth': 1, 'math-shift': 1, 'math-style': 1, 'orphans': 1,
    'overflow-wrap': 1, 'paint-order': 1, 'pointer-events': 1, 'print-color-adjust': 1,
    'quotes': 1, 'ruby-align': 1, 'ruby-position': 1, 'speak': 1, 'tab-size': 1,
    'text-align': 1, 'text-align-last': 1, 'text-anchor': 1, 'text-autospace': 1,
    'text-decoration-skip-ink': 1, 'text-emphasis': 1, 'text-emphasis-color': 1,
    'text-emphasis-position': 1, 'text-emphasis-style': 1, 'text-indent': 1,
    'text-justify': 1, 'text-rendering': 1, 'text-shadow': 1, 'text-size-adjust': 1,
    'text-spacing-trim': 1, 'text-transform': 1, 'text-underline-offset': 1,
    'text-underline-position': 1, 'text-wrap': 1, 'text-wrap-mode': 1, 'text-wrap-style': 1,
    'visibility': 1, 'white-space': 1, 'white-space-collapse': 1, 'widows': 1,
    'word-break': 1, 'word-spacing': 1, 'word-wrap': 1, 'writing-mode': 1,
    // SVG inherited
    'clip-rule': 1, 'color-interpolation': 1, 'color-interpolation-filters': 1,
    'color-rendering': 1, 'fill': 1, 'fill-opacity': 1, 'fill-rule': 1,
    'marker': 1, 'marker-end': 1, 'marker-mid': 1, 'marker-start': 1,
    'shape-rendering': 1, 'stroke': 1, 'stroke-dasharray': 1, 'stroke-dashoffset': 1,
    'stroke-linecap': 1, 'stroke-linejoin': 1, 'stroke-miterlimit': 1,
    'stroke-opacity': 1, 'stroke-width': 1, 'glyph-orientation-horizontal': 1,
    'glyph-orientation-vertical': 1, 'kerning': 1, 'dominant-baseline': 1,
    // Webkit inherited color props
    '-webkit-font-smoothing': 1, '-webkit-locale': 1, '-webkit-tap-highlight-color': 1,
    '-webkit-text-fill-color': 1, '-webkit-text-stroke': 1, '-webkit-text-stroke-color': 1,
    '-webkit-text-stroke-width': 1, '-webkit-text-orientation': 1, '-webkit-writing-mode': 1,
    '-webkit-border-horizontal-spacing': 1, '-webkit-border-vertical-spacing': 1,
    '-webkit-line-break': 1, '-webkit-rtl-ordering': 1, '-webkit-text-decorations-in-effect': 1,
    '-webkit-text-security': 1, '-webkit-user-modify': 1
  };
  function getStyleSandbox() {
    if (_styleSandbox) return _styleSandbox;
    var iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden;pointer-events:none';
    document.body.appendChild(iframe);
    var doc = iframe.contentDocument;
    doc.open();
    doc.write('<!DOCTYPE html><html><head></head><body></body></html>');
    doc.close();
    _styleSandbox = doc;
    return doc;
  }
  function getDefaultStyle(tagName, ns) {
    var key = (ns || '') + '|' + tagName;
    if (_defaultStyleCache[key]) return _defaultStyleCache[key];
    var doc = getStyleSandbox();
    var el = ns ? doc.createElementNS(ns, tagName) : doc.createElement(tagName);
    doc.body.appendChild(el);
    var cs = doc.defaultView.getComputedStyle(el);
    var snap = {};
    for (var i = 0; i < cs.length; i++) snap[cs[i]] = cs.getPropertyValue(cs[i]);
    _defaultStyleCache[key] = snap;
    return snap;
  }
  // Insert newlines + indentation before block-level tags. Browsers
  // collapse whitespace between block elements so layout is preserved.
  // The indenter walks the string, tracks tag-open/close depth, and
  // only breaks before a whitelist of structural tags.
  var _breakTags = /^(svg|g|defs|marker|foreignObject|style|div|polygon|line|path|rect|br)$/;
  function prettyPrintSvg(xml) {
    var out = '';
    var depth = 0;
    var i = 0;
    var len = xml.length;
    while (i < len) {
      if (xml.charCodeAt(i) !== 60 /* '<' */) {
        out += xml[i++];
        continue;
      }
      // Find end of tag, respecting attribute values
      var end = i + 1;
      var inQuote = 0;
      while (end < len) {
        var c = xml.charCodeAt(end);
        if (inQuote) { if (c === inQuote) inQuote = 0; }
        else if (c === 34 /* " */ || c === 39 /* ' */) inQuote = c;
        else if (c === 62 /* > */) break;
        end++;
      }
      var tag = xml.slice(i, end + 1);
      var isClose = tag.charCodeAt(1) === 47; // </
      var isSelfClose = tag.charCodeAt(tag.length - 2) === 47; // />
      var isDecl = tag.charCodeAt(1) === 33 || tag.charCodeAt(1) === 63; // <! <?
      // Extract tag name
      var nameStart = isClose ? 2 : 1;
      var nameEnd = nameStart;
      while (nameEnd < tag.length) {
        var cc = tag.charCodeAt(nameEnd);
        if (cc === 32 || cc === 62 || cc === 47 || cc === 9 || cc === 10) break;
        nameEnd++;
      }
      var name = tag.slice(nameStart, nameEnd);
      var shouldBreak = !isDecl && _breakTags.test(name);
      if (isClose) depth--;
      if (shouldBreak && out.length > 0) {
        out += '\n' + '  '.repeat(Math.max(0, depth));
      }
      out += tag;
      if (!isClose && !isSelfClose && !isDecl) depth++;
      i = end + 1;
    }
    return out;
  }

  function inlineComputedStyles(src, dst, parentCs) {
    if (!src || !dst || src.nodeType !== 1) return;
    var cs = getComputedStyle(src);
    var defaults = getDefaultStyle(src.localName || src.tagName.toLowerCase(), src.namespaceURI);
    var color = cs.getPropertyValue('color');
    var position = cs.getPropertyValue('position');
    var isPositioned = position === 'absolute' || position === 'fixed' || position === 'sticky';
    var isSvg = src.namespaceURI === _svgNS;
    var decl = '';
    for (var i = 0; i < cs.length; i++) {
      var prop = cs[i];
      if (_skipProps[prop]) continue;
      // SVG presentation attrs are redundant on SVG nodes — the library
      // sets the equivalent attribute, which is what actually paints.
      if (isSvg && _svgPresProps[prop]) continue;
      // Skip most vendor-prefixed properties: they're rarely meaningful in
      // a static export. A few (kept via _inheritedProps) matter for text.
      if (prop.charCodeAt(0) === 45 && prop.charCodeAt(1) !== 45 && !_inheritedProps[prop]) continue;
      var val = cs.getPropertyValue(prop);
      if (val === defaults[prop]) continue;
      if (_noopValues[prop] === val) continue;
      // top/right/bottom/left have no effect unless the element is positioned.
      if (_insetProps[prop] && !isPositioned) continue;
      // Skip color shadows that equal the element's own color (currentColor).
      if (_currentColorProps[prop] && val === color) continue;
      // Skip inherited (or custom) properties whose value matches the parent.
      if (parentCs && ((prop.charCodeAt(0) === 45 && prop.charCodeAt(1) === 45) || _inheritedProps[prop]) && val === parentCs.getPropertyValue(prop)) {
        continue;
      }
      decl += prop + ':' + val + ';';
    }
    var existing = dst.getAttribute('style') || '';
    if (decl || existing) dst.setAttribute('style', decl + existing);
    var srcKids = src.children;
    var dstKids = dst.children;
    var n = Math.min(srcKids.length, dstKids.length);
    for (var k = 0; k < n; k++) inlineComputedStyles(srcKids[k], dstKids[k], cs);
  }

  function saveSvg(container, filename) {
    var ref = container;
    if (typeof container === 'string') {
      container = document.getElementById(container) || document.querySelector(container);
    }
    if (!container) {
      console.warn('[ml-figure-template] saveSvg: container not found', ref);
      return;
    }

    // Re-layout before measuring so the backing SVG matches current size
    drawFigure(container);
    var rect = container.getBoundingClientRect();
    // Use scrollWidth/Height so content that overflows the container bounds
    // (e.g. labels/paths positioned via the scroll spacer) isn't clipped.
    var w = Math.ceil(Math.max(rect.width, container.scrollWidth));
    var h = Math.ceil(Math.max(rect.height, container.scrollHeight));
    if (!w || !h) {
      console.warn('[ml-figure-template] saveSvg: container has zero size', container, w, h);
      return;
    }

    var clone = container.cloneNode(true);
    // Inline computed styles before removing nodes so the clone's child
    // indexes still line up 1:1 with the live container's children.
    inlineComputedStyles(container, clone);
    var drop = clone.querySelectorAll('.mlfig-credit, .mlfig-save, .mlfig-error, .mlfig-tooltip, script');
    for (var i = 0; i < drop.length; i++) drop[i].remove();
    // Flatten the clone's positioning but keep its natural size — the
    // internal grid has pinned pixel column widths from the computed-style
    // snapshot, so pinning the outer clone to the larger scrollWidth would
    // not actually expand the grid. Content that overflowed the container
    // in the live DOM will still overflow visibly into the foreignObject,
    // whose width/height already use scrollWidth/scrollHeight.
    clone.style.position = 'relative';
    clone.style.left = '0';
    clone.style.top = '0';
    clone.style.margin = '0';
    clone.style.overflow = 'visible';

    var svgNS = 'http://www.w3.org/2000/svg';
    var xhtmlNS = 'http://www.w3.org/1999/xhtml';
    // Overlay the credit inside the existing bottom padding of the
    // container — no extra canvas needed.
    var totalH = h;
    var out = document.createElementNS(svgNS, 'svg');
    out.setAttribute('xmlns', svgNS);
    out.setAttribute('width', w);
    out.setAttribute('height', totalH);
    out.setAttribute('viewBox', '0 0 ' + w + ' ' + totalH);

    var fo = document.createElementNS(svgNS, 'foreignObject');
    fo.setAttribute('x', '0');
    fo.setAttribute('y', '0');
    fo.setAttribute('width', w);
    fo.setAttribute('height', h);
    var wrapper = document.createElementNS(xhtmlNS, 'div');
    wrapper.appendChild(clone);
    fo.appendChild(wrapper);
    out.appendChild(fo);

    // Discreet credit line at the bottom of the exported SVG.
    var creditText = document.createElementNS(svgNS, 'text');
    creditText.setAttribute('x', '4');
    creditText.setAttribute('y', String(h - 14));
    creditText.setAttribute('font-family', "'SF Mono', Monaco, monospace");
    creditText.setAttribute('font-size', '10');
    creditText.setAttribute('fill', '#f1f5f9');
    creditText.textContent = '\u00A9 2026 IVRL/ml-figure-template';
    out.appendChild(creditText);

    var xml;
    try {
      xml = new XMLSerializer().serializeToString(out);
    } catch (e) {
      console.warn('[ml-figure-template] saveSvg: XMLSerializer failed', e);
      return;
    }
    xml = prettyPrintSvg(xml);
    var creditComment =
      '<!--\n' +
      '  Diagram made with ml-figure-template\n' +
      '  https://github.com/IVRL/ml-figure-template\n' +
      '  Free to use with attribution — see\n' +
      '  https://github.com/IVRL/ml-figure-template/blob/main/LICENSE\n' +
      '  Template \u00A9 2026 EPFL-IVRL and Martin Everaert\n' +
      '-->\n';
    xml = '<?xml version="1.0" encoding="UTF-8"?>\n' + creditComment + xml;
    var blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename || (container.id || 'diagram') + '.svg';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  window.MLFigureTemplate = window.MLFigureTemplate || {};
  window.MLFigureTemplate.version = VERSION;
  window.MLFigureTemplate.saveSvg = saveSvg;

  // ── Init: find all .mlfig containers and draw ──

  function initAll() {
    var diagrams = document.querySelectorAll('.mlfig');
    diagrams.forEach(function(d) { drawFigure(d); });
    createTooltips();
  }

  function onReady() { document.fonts.ready.then(initAll); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady);
  } else {
    onReady();
  }
  window.addEventListener('resize', initAll);

  // ── Create tooltip DOM elements from data-tip attributes ──
  // This replaces CSS pseudo-element tooltips so that HTML/MathML renders correctly.
  // Tooltips are appended to the .mlfig container (not inside the [data-tip] element)
  // so they sit above the foreground SVG in the stacking order.
  var tipsCreated = false;
  var activeTooltipEl = null;
  var activeArrowEl = null;

  function createTooltips() {
    if (tipsCreated) return;
    tipsCreated = true;
    // Create a single shared tooltip + arrow in each .mlfig container
    document.querySelectorAll('.mlfig').forEach(function(root) {
      var tooltip = document.createElement('div');
      tooltip.className = 'mlfig-tooltip mlfig-tooltip-shared';
      tooltip.style.position = 'absolute';
      tooltip.style.zIndex = '200';
      root.appendChild(tooltip);

      var arrow = document.createElement('div');
      arrow.className = 'mlfig-tooltip-arrow mlfig-tooltip-arrow-shared';
      arrow.style.position = 'absolute';
      arrow.style.zIndex = '200';
      root.appendChild(arrow);
    });
  }

  function showTooltip(tipEl) {
    if (!tipEl) return;
    var root = tipEl.closest('.mlfig');
    if (!root) return;
    var tooltip = root.querySelector('.mlfig-tooltip-shared');
    var arrow = root.querySelector('.mlfig-tooltip-arrow-shared');
    if (!tooltip || !arrow) return;

    var tipText = tipEl.getAttribute('data-tip');
    tooltip.innerHTML = tipText.replace(/\n/g, '<br>');

    var rootRect = root.getBoundingClientRect();
    var elRect = tipEl.getBoundingClientRect();
    var isBottom = tipEl.getAttribute('data-tip-position') === 'bottom';
    // Resolve --col-width relative to the element's own width
    var colWidthRaw = getComputedStyle(tipEl).getPropertyValue('--col-width').trim();
    var tooltipWidth;
    if (colWidthRaw) {
      // Temporarily set width on a hidden measurer inside the element to resolve percentages
      var measurer = document.createElement('div');
      measurer.style.cssText = 'position:absolute;visibility:hidden;height:0;width:' + colWidthRaw;
      tipEl.appendChild(measurer);
      tooltipWidth = measurer.offsetWidth + 'px';
      tipEl.removeChild(measurer);
    } else {
      tooltipWidth = elRect.width + 'px';
    }

    // Position tooltip
    tooltip.style.width = tooltipWidth;
    tooltip.style.left = (elRect.left + elRect.width / 2 - rootRect.left) + 'px';
    tooltip.style.transform = 'translateX(-50%)';
    tooltip.style.opacity = '1';
    tooltip.style.visibility = 'visible';

    // Position arrow
    arrow.style.left = (elRect.left + elRect.width / 2 - rootRect.left) + 'px';
    arrow.style.transform = 'translateX(-50%)';
    arrow.style.opacity = '1';
    arrow.style.visibility = 'visible';

    if (isBottom) {
      tooltip.style.top = (elRect.bottom - rootRect.top + 8) + 'px';
      tooltip.style.bottom = 'auto';
      arrow.style.top = (elRect.bottom - rootRect.top + 2) + 'px';
      arrow.style.bottom = 'auto';
      arrow.style.borderTop = 'none';
      arrow.style.borderBottom = '6px solid var(--text-primary)';
    } else {
      tooltip.style.top = 'auto';
      tooltip.style.bottom = (rootRect.bottom - elRect.top + 8) + 'px';
      arrow.style.top = 'auto';
      arrow.style.bottom = (rootRect.bottom - elRect.top + 2) + 'px';
      arrow.style.borderTop = '6px solid var(--text-primary)';
      arrow.style.borderBottom = 'none';
    }

    activeTooltipEl = tooltip;
    activeArrowEl = arrow;
  }

  function hideTooltip(tipEl) {
    if (!tipEl) return;
    var root = tipEl.closest('.mlfig');
    if (!root) return;
    var tooltip = root.querySelector('.mlfig-tooltip-shared');
    var arrow = root.querySelector('.mlfig-tooltip-arrow-shared');
    if (tooltip) { tooltip.style.opacity = '0'; tooltip.style.visibility = 'hidden'; }
    if (arrow) { arrow.style.opacity = '0'; arrow.style.visibility = 'hidden'; }
  }

  // Adjust container padding so bottom tooltips aren't clipped by overflow-y: clip
  function adjustForTooltip(tipEl) {
    if (!tipEl) return;
    var root = tipEl.closest('.mlfig');
    if (!root) return;
    var tooltip = root.querySelector('.mlfig-tooltip-shared');
    if (!tooltip) return;
    var container = tipEl.closest('[style*="overflow-y"]') || tipEl.closest('.container');
    if (!container) return;
    var cRect = container.getBoundingClientRect();
    var tRect = tooltip.getBoundingClientRect();
    var overflow = tRect.bottom - cRect.bottom;
    if (overflow > 0) {
      container.style.paddingBottom = (overflow + 16) + 'px';
    }
  }
  function resetContainerPadding(tipEl) {
    if (!tipEl) return;
    var container = tipEl.closest('[style*="overflow-y"]') || tipEl.closest('.container');
    if (container) container.style.paddingBottom = '';
  }

  // Tooltip management — only one tooltip visible at a time
  // Works for both hover (desktop) and tap (touch)
  var hoverTarget = null;
  var pinnedTarget = null;
  var isTouch = false;

  document.addEventListener('touchstart', function() {
    isTouch = true;
  }, { passive: true });

  document.addEventListener('mouseover', function(e) {
    if (isTouch) return;
    var target = e.target.closest('[data-tip]');
    if (target === hoverTarget) return;
    if (hoverTarget && hoverTarget !== pinnedTarget) { hideTooltip(hoverTarget); resetContainerPadding(hoverTarget); }
    hoverTarget = target;
    if (target) { showTooltip(target); adjustForTooltip(target); }
  });
  document.addEventListener('mouseout', function(e) {
    if (isTouch) return;
    if (!hoverTarget) return;
    var related = e.relatedTarget;
    if (related && hoverTarget.contains(related)) return;
    if (hoverTarget !== pinnedTarget) { hideTooltip(hoverTarget); resetContainerPadding(hoverTarget); }
    hoverTarget = null;
  });
  document.addEventListener('click', function(e) {
    var target = e.target.closest('[data-tip]');
    // Clicking outside any tip: unpin and deactivate
    if (!target) {
      if (pinnedTarget) { hideTooltip(pinnedTarget); resetContainerPadding(pinnedTarget); pinnedTarget = null; }
      return;
    }
    // Clicking the pinned target: unpin it
    if (target === pinnedTarget) {
      pinnedTarget = null;
      hideTooltip(target);
      resetContainerPadding(target);
      return;
    }
    // Clicking a new target: unpin old, pin new
    if (pinnedTarget) { hideTooltip(pinnedTarget); resetContainerPadding(pinnedTarget); }
    pinnedTarget = target;
    showTooltip(target);
    adjustForTooltip(target);
  });
})();
