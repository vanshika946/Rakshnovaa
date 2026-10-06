(function () {
  'use strict';

  /* ---------- Data ---------- */
  var TYPES = {
    flood: {
      name: 'Flood', icon: '🌊',
      f: ['Rainfall intensity', 'Low-lying terrain and river proximity', 'Population exposure', 'Soil saturation'],
      act: 'Close riverside roads, open pumping stations and move residents to higher ground.',
      safe: 'Elevated schools and community halls on higher ground, away from the river channel.',
      list: ['Issue flood warning via SMS and sirens', 'Move people from low-lying blocks', 'Deploy boats and pumps', 'Cut power to flooded substations', 'Open relief shelters with clean water']
    },
    quake: {
      name: 'Earthquake', icon: '🏚️',
      f: ['Seismic activity level', 'Fault-line proximity and ground type', 'Population exposure', 'Building vulnerability'],
      act: 'Inspect structures, keep people in open areas and stage search-and-rescue teams.',
      safe: 'Open grounds and stadiums away from buildings, power lines and slopes.',
      list: ['Activate search-and-rescue teams', 'Check gas lines and shut off supply', 'Inspect bridges and hospitals', 'Set up open-ground assembly points', 'Prepare for aftershocks']
    },
    fire: {
      name: 'Fire', icon: '🔥',
      f: ['Fire intensity and spread', 'Vegetation dryness and terrain', 'Population exposure', 'Wind and humidity'],
      act: 'Create firebreaks, deploy fire crews and evacuate downwind settlements.',
      safe: 'Paved or cleared areas upwind of the fire, such as sports fields and town centres.',
      list: ['Dispatch fire crews and water tankers', 'Evacuate downwind settlements', 'Cut firebreaks along the spread path', 'Distribute masks and clear air shelters', 'Keep roads open for fire engines']
    },
    weather: {
      name: 'Extreme weather', icon: '🌪️',
      f: ['Storm or heat intensity', 'Exposure of the area to open terrain or coast', 'Population exposure', 'Forecast instability'],
      act: 'Secure loose structures, suspend outdoor activity and open cooling or storm shelters.',
      safe: 'Reinforced public buildings and designated cyclone or heat shelters.',
      list: ['Broadcast weather advisory', 'Suspend outdoor work and school travel', 'Open storm or cooling shelters', 'Secure power and telecom lines', 'Check on elderly and vulnerable residents']
    }
  };

  var LV = [
    { n: 'Low', c: 'low', p: 'P4', pt: 'Routine' },
    { n: 'Moderate', c: 'moderate', p: 'P3', pt: 'Elevated' },
    { n: 'High', c: 'high', p: 'P2', pt: 'Urgent' },
    { n: 'Critical', c: 'critical', p: 'P1', pt: 'Immediate' }
  ];
  var EVAC = [
    'No evacuation needed. Keep emergency kits ready.',
    'Advisory only: prepare vulnerable residents and keep routes clear.',
    'Recommended evacuation of high-exposure blocks within 3 hours.',
    'Mandatory immediate evacuation of the affected area.'
  ];
  var STATUS = ['Normal', 'Watch', 'Warning', 'Emergency'];
  var ALERT_STATUS = ['No alert', 'Watch', 'Warning', 'Emergency alert'];
  var SEV_TXT = ['', 'Minor', 'Moderate', 'Significant', 'Severe', 'Extreme'];
  var SEV_F = [0, 25, 45, 65, 85, 100];

  var LOCS = [
    { id: 'delta', name: 'Rivermouth Delta', x: 52, y: 38, pop: 420000, dom: 'flood', aff: { flood: 95, quake: 30, fire: 15, weather: 60 } },
    { id: 'ridge', name: 'Kestrel Ridge', x: 20, y: 26, pop: 180000, dom: 'quake', aff: { flood: 20, quake: 88, fire: 55, weather: 40 } },
    { id: 'ash', name: 'Ashfall Valley', x: 80, y: 46, pop: 95000, dom: 'fire', aff: { flood: 10, quake: 35, fire: 80, weather: 45 } },
    { id: 'harbor', name: 'Harbor District', x: 30, y: 70, pop: 610000, dom: 'flood', aff: { flood: 62, quake: 40, fire: 30, weather: 70 } },
    { id: 'north', name: 'Northgate Plains', x: 74, y: 16, pop: 260000, dom: 'weather', aff: { flood: 35, quake: 20, fire: 60, weather: 55 } },
    { id: 'salt', name: 'Saltmarsh Bay', x: 12, y: 54, pop: 140000, dom: 'quake', aff: { flood: 50, quake: 50, fire: 12, weather: 65 } }
  ];

  var CONTACT_NOTE = 'Sample contacts';

  /* ---------- State ---------- */
  var state = {
    drift: { flood: 62, quake: 55, fire: 60, weather: 50 },
    noise: {},
    focus: null,       // {kind:'analysis'} or {kind:'zone', id}
    analysis: null,
    zoneId: null,
    alerts: [],
    checks: {}
  };
  LOCS.forEach(function (l) { state.noise[l.id] = 0; });

  var $ = function (id) { return document.getElementById(id); };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var rnd = function (a, b) { return a + Math.random() * (b - a); };
  var fmt = function (n) { return Math.round(n).toLocaleString('en-IN'); };
  function lvl(s) { return s < 30 ? 0 : s < 55 ? 1 : s < 78 ? 2 : 3; }
  function locById(id) { return LOCS.filter(function (l) { return l.id === id; })[0]; }

  function zoneScore(l) {
    return Math.round(clamp(0.62 * l.aff[l.dom] + 0.2 * state.drift[l.dom] + state.noise[l.id], 5, 99));
  }
  function zoneAffected(l, s) { return Math.round(l.pop * Math.pow(s / 100, 2) * 0.35 / 100) * 100; }
  function typeScore(t) {
    var best = null;
    LOCS.forEach(function (l) {
      if (l.dom === t) { var s = zoneScore(l); if (!best || s > best.s) best = { s: s, l: l }; }
    });
    return best;
  }

  /* ---------- Risk model ---------- */
  function analyze(type, loc, sev, dens) {
    var parts = [
      0.38 * SEV_F[sev],
      0.32 * loc.aff[type],
      0.20 * dens,
      0.10 * state.drift[type]
    ];
    var total = parts.reduce(function (a, b) { return a + b; }, 0);
    var score = Math.round(clamp(total + rnd(-3, 3), 5, 99));
    var labels = TYPES[type].f;
    var factors = parts.map(function (p, i) {
      return { name: labels[i], share: Math.round(p / total * 100) };
    }).sort(function (a, b) { return b.share - a.share; });
    var affected = Math.round(loc.pop * Math.pow(score / 100, 2) * (0.4 + 0.6 * dens / 100) / 100) * 100;
    return { type: type, loc: loc, sev: sev, dens: dens, score: score, level: lvl(score), factors: factors, affected: affected };
  }

  /* ---------- Rendering ---------- */
  function ctx() {
    if (state.focus && state.focus.kind === 'analysis' && state.analysis) {
      var a = state.analysis;
      return { type: a.type, loc: a.loc, score: a.score, level: a.level, affected: a.affected, factors: a.factors, src: 'analysis' };
    }
    var l = state.focus && state.focus.kind === 'zone' ? locById(state.zoneId) : null;
    if (!l) {
      l = LOCS.slice().sort(function (a, b) { return zoneScore(b) - zoneScore(a); })[0];
    }
    var s = zoneScore(l);
    var lb = TYPES[l.dom].f;
    return {
      type: l.dom, loc: l, score: s, level: lvl(s), affected: zoneAffected(l, s),
      factors: [{ name: lb[1], share: 40 }, { name: lb[3], share: 25 }], src: l === null ? 'top' : (state.focus ? 'zone' : 'top')
    };
  }

  function renderHeader() {
    var max = 0;
    LOCS.forEach(function (l) { max = Math.max(max, zoneScore(l)); });
    if (state.analysis) max = Math.max(max, state.analysis.score);
    var L = lvl(max);
    $('statusPill').dataset.lv = LV[L].c;
    $('statusText').textContent = STATUS[L];
  }

  function renderStats() {
    var max = 0, people = 0, zones = 0;
    LOCS.forEach(function (l) {
      var s = zoneScore(l);
      max = Math.max(max, s);
      people += zoneAffected(l, s);
      if (s >= 55) zones++;
    });
    var L = lvl(max);
    $('sRisk').textContent = max + '%';
    $('sPeople').textContent = fmt(people);
    $('sAlerts').textContent = state.alerts.length;
    $('sZones').textContent = zones;
    $('sPrio').textContent = LV[L].p;
    $('sPrioTxt').textContent = LV[L].pt;
  }

  var INSIGHT = {
    flood: ['River levels are stable and drainage is coping.', 'Rising water in {l}; drains are close to capacity.', 'Rapid rise expected around {l}; low-lying streets likely to flood.', 'Flood waters are overwhelming {l}; immediate action required.'],
    quake: ['Only minor tremors detected across the region.', 'Elevated tremor activity near {l}; inspect older buildings.', 'Strong seismic signals near {l}; aftershocks likely.', 'Major seismic event pattern at {l}; rescue teams needed now.'],
    fire: ['Vegetation moisture is adequate; fire danger is low.', 'Dry fuel near {l}; watch for small outbreaks.', 'Wind-driven spread likely around {l}; prepare downwind evacuation.', 'Fast-moving fire front near {l}; evacuate downwind areas.'],
    weather: ['Conditions are within the seasonal normal.', 'Unstable system building toward {l}; monitor closely.', 'Severe storm or heat conditions likely over {l}.', 'Extreme conditions at {l}; shelter orders recommended.']
  };

  function renderOverview() {
    var h = '';
    Object.keys(TYPES).forEach(function (t) {
      var b = typeScore(t);
      if (!b) { b = { s: Math.round(state.drift[t] * 0.4), l: LOCS[0] }; }
      var L = lvl(b.s), T = TYPES[t];
      h += '<button class="card" type="button" data-t="' + t + '" data-lv="' + LV[L].c + '" title="Load into analyzer">' +
        '<div class="row"><span>' + T.icon + ' ' + T.name + '</span><span class="badge">' + LV[L].n + '</span></div>' +
        '<div class="pct">' + b.s + '%</div>' +
        '<dl><dt>Affected area</dt><dd>' + b.l.name + '</dd><dt>Alert status</dt><dd>' + ALERT_STATUS[L] + '</dd></dl>' +
        '<p>' + INSIGHT[t][L].replace('{l}', b.l.name) + '</p></button>';
    });
    $('overview').innerHTML = h;
  }

  function buildMarkers() {
    var h = '';
    LOCS.forEach(function (l) {
      h += '<button class="mk" type="button" data-id="' + l.id + '" style="left:' + l.x + '%;top:' + l.y + '%" aria-label="' + l.name + '">' +
        '<span>' + l.name + '</span></button>';
    });
    $('markers').innerHTML = h;
  }

  function renderMarkers() {
    var ms = $('markers').children;
    for (var i = 0; i < ms.length; i++) {
      var l = locById(ms[i].dataset.id);
      ms[i].dataset.lv = LV[lvl(zoneScore(l))].c;
      ms[i].classList.toggle('sel', l.id === state.zoneId);
    }
  }

  function renderZone() {
    var el = $('zoneDetail');
    var l = locById(state.zoneId);
    if (!l) {
      el.removeAttribute('data-lv');
      el.innerHTML = '<p class="empty">Select a marker on the map to see zone details.</p>';
      return;
    }
    var s = zoneScore(l), L = lvl(s), T = TYPES[l.dom];
    el.dataset.lv = LV[L].c;
    el.innerHTML = '<h3>' + l.name + '</h3><dl>' +
      '<dt>Disaster</dt><dd>' + T.icon + ' ' + T.name + '</dd>' +
      '<dt>Risk score</dt><dd>' + s + '% (' + LV[L].n + ')</dd>' +
      '<dt>Population affected</dt><dd>' + fmt(zoneAffected(l, s)) + '</dd>' +
      '<dt>Response</dt><dd>' + EVAC[L] + ' ' + T.act + '</dd></dl>';
  }

  function relTime(ts) {
    var m = Math.max(0, Math.round((Date.now() - ts) / 60000));
    return m < 1 ? 'just now' : m + ' min ago';
  }

  function renderAlerts() {
    if (!state.alerts.length) {
      $('alerts').innerHTML = '<p class="empty">No active alerts.</p>';
      return;
    }
    $('alerts').innerHTML = state.alerts.map(function (a) {
      return '<article class="alert' + (a.isNew ? ' new' : '') + '" data-lv="' + LV[a.level].c + '">' +
        '<header><span>' + TYPES[a.type].icon + ' ' + TYPES[a.type].name + ' · ' + a.loc + '</span><time>' + relTime(a.ts) + '</time></header>' +
        '<div class="meta">Severity: ' + LV[a.level].n + ' (' + a.score + '%)</div>' +
        '<div>' + EVAC[a.level] + ' ' + TYPES[a.type].act + '</div></article>';
    }).join('');
  }

  function pushAlert(type, loc, score, isNew) {
    state.alerts.unshift({ type: type, loc: loc.name, score: score, level: lvl(score), ts: isNew ? Date.now() : Date.now() - Math.round(rnd(5, 150)) * 60000, isNew: !!isNew });
    state.alerts = state.alerts.slice(0, 7);
  }

  function seedAlerts() {
    state.alerts = [];
    LOCS.slice().sort(function (a, b) { return zoneScore(a) - zoneScore(b); }).forEach(function (l) {
      var s = zoneScore(l);
      if (s >= 40) pushAlert(l.dom, l, s, false);
    });
    state.alerts.sort(function (a, b) { return b.ts - a.ts; });
  }

  function renderResult() {
    var el = $('result');
    var a = state.analysis;
    if (!a) {
      el.removeAttribute('data-lv');
      el.innerHTML = '<p class="empty">Choose a disaster, location and severity, then select Analyze risk.</p>';
      return;
    }
    var L = LV[a.level];
    el.dataset.lv = L.c;
    el.innerHTML = '<div class="res-top"><span class="pct">' + a.score + '%</span><b>' + L.n + ' risk</b></div>' +
      '<div class="meter"><i style="width:0"></i></div>' +
      '<h3>Main contributing factors</h3>' +
      a.factors.map(function (f) {
        return '<div class="fac"><span>' + f.name + '</span><div class="meter"><i style="width:' + f.share + '%"></i></div><span>' + f.share + '%</span></div>';
      }).join('') +
      '<div class="action"><b>Recommended action:</b> ' + EVAC[a.level] + ' ' + TYPES[a.type].act + '</div>';
    var bar = el.querySelector('.meter i');
    setTimeout(function () { bar.style.width = a.score + '%'; }, 30);
  }

  function renderBanner() {
    var a = state.analysis;
    var on = a && a.level === 3;
    $('critBanner').hidden = !on;
    if (on) {
      $('critText').textContent = TYPES[a.type].name + ' risk at ' + a.loc.name + ' is ' + a.score + '%. ' + EVAC[3] + ' Contact 112 (sample).';
    }
  }

  function renderResponse() {
    var c = ctx(), L = LV[c.level], T = TYPES[c.type];
    $('rPrio').dataset.lv = L.c;
    $('rPrio').textContent = L.p + ' ' + L.pt;
    $('rFocus').textContent = T.name + ' · ' + c.loc.name;
    $('rEvac').textContent = EVAC[c.level];
    $('rSafe').textContent = T.safe;
    var chk = state.checks[c.type] || (state.checks[c.type] = []);
    var focused = document.activeElement && document.activeElement.closest && document.activeElement.closest('#checklist');
    if (focused && $('checklist').dataset.t === c.type) { updateProgress(c.type); return; }
    $('checklist').dataset.t = c.type;
    $('checklist').innerHTML = T.list.map(function (item, i) {
      return '<li><label><input type="checkbox" data-i="' + i + '"' + (chk[i] ? ' checked' : '') + '><span>' + item + '</span></label></li>';
    }).join('');
    updateProgress(c.type);
  }

  function updateProgress(type) {
    var chk = state.checks[type] || [];
    var done = chk.filter(Boolean).length;
    $('progress').textContent = done + ' of ' + TYPES[type].list.length + ' done';
  }

  function renderBriefing() {
    var c = ctx(), L = LV[c.level], T = TYPES[c.type];
    var lead = c.factors[0].name.toLowerCase();
    var p1 = 'Simulated ' + T.name.toLowerCase() + ' risk for ' + c.loc.name + ' is ' + L.n.toLowerCase() + ' at ' + c.score + '%, driven mainly by ' + lead +
      '. About ' + fmt(c.affected) + ' people could be affected.';
    var p2 = c.level >= 2
      ? 'Response is rated ' + L.p + ' (' + L.pt.toLowerCase() + '). ' + EVAC[c.level] + ' ' + T.act
      : 'Response is rated ' + L.p + ' (' + L.pt.toLowerCase() + '). ' + EVAC[c.level] + ' Continue monitoring for changes.';
    var src = c.src === 'analysis' ? 'Based on your latest analysis' : c.src === 'zone' ? 'Based on the selected zone' : 'Highest-risk zone right now';
    $('briefing').dataset.lv = L.c;
    $('briefing').innerHTML = '<span class="tag">' + src + '</span><p>' + p1 + '</p><p>' + p2 + '</p>';
  }

  function renderAll() {
    renderHeader(); renderStats(); renderOverview(); renderMarkers();
    renderZone(); renderAlerts(); renderResponse(); renderBriefing();
  }

  /* ---------- Events ---------- */
  function init() {
    LOCS.forEach(function (l) {
      var o = document.createElement('option');
      o.value = l.id; o.textContent = l.name;
      $('loc').appendChild(o);
    });
    buildMarkers();
    seedAlerts();

    $('sev').addEventListener('input', function () {
      var v = +$('sev').value;
      $('sevOut').textContent = v + ' – ' + SEV_TXT[v];
    });

    $('analyzeBtn').addEventListener('click', function () {
      var a = analyze($('type').value, locById($('loc').value), +$('sev').value, +$('dens').value);
      state.analysis = a;
      state.focus = { kind: 'analysis' };
      state.zoneId = null;
      pushAlert(a.type, a.loc, a.score, true);
      state.alerts.forEach(function (x, i) { if (i > 0) x.isNew = false; });
      renderResult(); renderBanner(); renderAll();
    });

    $('resetBtn').addEventListener('click', function () {
      state.analysis = null; state.focus = null; state.zoneId = null; state.checks = {};
      state.drift = { flood: 62, quake: 55, fire: 60, weather: 50 };
      LOCS.forEach(function (l) { state.noise[l.id] = 0; });
      $('type').value = 'flood'; $('loc').selectedIndex = 0;
      $('sev').value = 3; $('sevOut').textContent = '3 – Significant';
      $('dens').value = '50';
      seedAlerts();
      renderResult(); renderBanner(); renderAll();
    });

    $('markers').addEventListener('click', function (e) {
      var b = e.target.closest('.mk');
      if (!b) return;
      state.zoneId = b.dataset.id;
      state.focus = { kind: 'zone' };
      renderAll();
    });

    $('overview').addEventListener('click', function (e) {
      var c = e.target.closest('.card');
      if (!c) return;
      $('type').value = c.dataset.t;
      var first = LOCS.filter(function (l) { return l.dom === c.dataset.t; })[0];
      if (first) $('loc').value = first.id;
    });

    $('checklist').addEventListener('change', function (e) {
      var t = $('checklist').dataset.t;
      state.checks[t] = state.checks[t] || [];
      state.checks[t][+e.target.dataset.i] = e.target.checked;
      updateProgress(t);
    });

    renderResult(); renderBanner(); renderAll();
    tickClock();
    setInterval(tickClock, 1000);
    setInterval(tick, 5000);
  }

  function tickClock() {
    $('clock').textContent = new Date().toLocaleTimeString('en-GB');
  }

  function tick() {
    Object.keys(state.drift).forEach(function (t) {
      state.drift[t] = clamp(state.drift[t] + rnd(-4, 4.5), 25, 95);
    });
    LOCS.forEach(function (l) {
      state.noise[l.id] = clamp(state.noise[l.id] + rnd(-2, 2), -6, 8);
    });
    if (Math.random() < 0.3) {
      var hot = LOCS.filter(function (l) { return zoneScore(l) >= 45; });
      if (hot.length) {
        var l = hot[Math.floor(Math.random() * hot.length)];
        pushAlert(l.dom, l, zoneScore(l), true);
        state.alerts.forEach(function (x, i) { if (i > 0) x.isNew = false; });
      }
    }
    renderAll();
  }

  init();
})();
