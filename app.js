(function () {
  'use strict';

  var STORAGE_KEY = 'sd-study';
  var SAVE_DELAY = 500;

  var content = null; // parsed days.json
  var state = loadState();
  var pendingSave = null; // { day, text, timer }
  var app = document.getElementById('app');

  // ---------- State ----------

  function emptyState() {
    return { version: 1, done: {}, notes: {} };
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyState();
      var parsed = JSON.parse(raw);
      return validateState(parsed) ? parsed : emptyState();
    } catch (e) {
      return emptyState();
    }
  }

  function writeState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      toast('Could not save: storage is full or blocked.', true);
      return false;
    }
  }

  function isPlainObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  function isDayKey(k) {
    return /^[1-9]\d*$/.test(k);
  }

  // Returns true if `s` has the exact v1 shape. Used for both localStorage and Restore.
  function validateState(s) {
    if (!isPlainObject(s) || s.version !== 1) return false;
    if (!isPlainObject(s.done) || !isPlainObject(s.notes)) return false;
    var k;
    for (k in s.done) {
      if (!isDayKey(k) || s.done[k] !== true) return false;
    }
    for (k in s.notes) {
      if (!isDayKey(k) || typeof s.notes[k] !== 'string') return false;
    }
    return true;
  }

  function isDone(day) {
    return state.done[day] === true;
  }

  function setDone(day, value) {
    flushNotes();
    if (value) state.done[day] = true;
    else delete state.done[day];
    writeState();
    updateProgress();
  }

  function scheduleNoteSave(day, text, indicator) {
    if (pendingSave) clearTimeout(pendingSave.timer);
    pendingSave = {
      day: day,
      text: text,
      indicator: indicator,
      timer: setTimeout(flushNotes, SAVE_DELAY)
    };
    if (indicator) indicator.textContent = 'Saving…';
  }

  function flushNotes() {
    if (!pendingSave) return;
    var p = pendingSave;
    pendingSave = null;
    clearTimeout(p.timer);
    if (p.text) state.notes[p.day] = p.text;
    else delete state.notes[p.day];
    var ok = writeState();
    if (p.indicator && p.indicator.isConnected) p.indicator.textContent = ok ? 'Saved' : 'Not saved';
  }

  // ---------- Content helpers ----------

  function totalDays() {
    return content.days.length;
  }

  function getDay(n) {
    for (var i = 0; i < content.days.length; i++) {
      if (content.days[i].day === n) return content.days[i];
    }
    return null;
  }

  function getWeek(n) {
    for (var i = 0; i < content.weeks.length; i++) {
      if (content.weeks[i].week === n) return content.weeks[i];
    }
    return null;
  }

  function doneCount() {
    var c = 0;
    content.days.forEach(function (d) { if (isDone(d.day)) c++; });
    return c;
  }

  function firstUndoneDay() {
    for (var i = 0; i < content.days.length; i++) {
      if (!isDone(content.days[i].day)) return content.days[i].day;
    }
    return null;
  }

  // ---------- DOM helpers ----------

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'text') node.textContent = v;
        else if (k === 'class') node.className = v;
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v === true ? '' : v);
      });
    }
    (children || []).forEach(function (c) {
      if (c) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  var toastTimer = null;
  function toast(msg, isError) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast' + (isError ? ' error' : '');
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, isError ? 6000 : 3000);
  }

  function updateProgress() {
    if (!content) return;
    var pct = (doneCount() / totalDays()) * 100;
    document.getElementById('progress-fill').style.width = pct + '%';
  }

  function setActiveTab(name) {
    document.querySelectorAll('.tab').forEach(function (t) {
      if (t.getAttribute('data-tab') === name) t.setAttribute('aria-current', 'page');
      else t.removeAttribute('aria-current');
    });
  }

  // ---------- Brief rendering ----------
  // Minimal, DOM-only formatter for the optional `brief` field in days.json:
  // blank-line separated blocks; "- " and "1. " lists (indented lines nest);
  // "> " quotes; inline **bold**, `code` and "(verify …)" flags.

  var LIST_RE = /^(\s*)(?:-|\d+\.)\s+(.*)$/;

  function inline(text) {
    var out = [];
    text.split(/(\*\*[^*]+\*\*|`[^`]+`|\(verify[^)]*\))/).forEach(function (part) {
      if (!part) return;
      if (/^\*\*[^*]+\*\*$/.test(part)) out.push(el('strong', { text: part.slice(2, -2) }));
      else if (/^`[^`]+`$/.test(part)) out.push(el('code', { text: part.slice(1, -1) }));
      else if (/^\(verify/.test(part)) out.push(el('span', { class: 'verify', title: 'From training data; check against the resource', text: part }));
      else out.push(part);
    });
    return out;
  }

  function renderList(lines) {
    var root = el(/^\s*\d+\./.test(lines[0]) ? 'ol' : 'ul');
    var lastItem = null;
    var nested = [];
    function flushNested() {
      if (nested.length && lastItem) lastItem.appendChild(renderList(nested));
      nested = [];
    }
    lines.forEach(function (line) {
      var m = LIST_RE.exec(line);
      if (m && m[1].length === 0) {
        flushNested();
        lastItem = el('li', {}, inline(m[2]));
        root.appendChild(lastItem);
      } else if (m) {
        nested.push(line.replace(/^\s+/, ''));
      } else if (lastItem) {
        lastItem.appendChild(document.createTextNode(' '));
        inline(line.trim()).forEach(function (n) {
          lastItem.appendChild(typeof n === 'string' ? document.createTextNode(n) : n);
        });
      }
    });
    flushNested();
    return root;
  }

  function renderBrief(text) {
    var nodes = [];
    text.split(/\n\s*\n/).forEach(function (block) {
      var lines = block.split('\n').filter(function (l) { return l.trim(); });
      if (!lines.length) return;
      if (lines.every(function (l) { return /^>\s?/.test(l); })) {
        nodes.push(el('blockquote', {}, [el('p', {}, inline(lines.map(function (l) { return l.replace(/^>\s?/, ''); }).join(' ')))]));
        return;
      }
      var i = 0;
      var para = [];
      while (i < lines.length && !LIST_RE.test(lines[i])) para.push(lines[i++]);
      if (para.length) nodes.push(el('p', {}, inline(para.join(' '))));
      if (i < lines.length) nodes.push(renderList(lines.slice(i)));
    });
    return nodes;
  }

  // ---------- Views ----------

  // A single day. `mode` is 'today' (default view) or 'day' (opened from All days).
  function renderDay(n, mode, justDone) {
    var d = getDay(n);
    if (!d) { location.hash = '#/'; return; }
    var week = getWeek(d.week);
    var done = isDone(n);

    var saveState = el('span', { class: 'save-state', text: state.notes[n] ? 'Saved' : '' });
    var textarea = el('textarea', {
      id: 'notes',
      placeholder: 'Your answer, sketch notes, open questions…',
      oninput: function (e) { scheduleNoteSave(n, e.target.value, saveState); },
      onblur: flushNotes
    });
    textarea.value = state.notes[n] || '';

    var actions = el('div', { class: 'actions' });
    if (!done) {
      actions.appendChild(el('button', {
        type: 'button',
        class: 'btn btn-block',
        text: 'Mark done',
        onclick: function () {
          setDone(n, true);
          if (mode === 'today') renderDay(n, 'today', true);
          else renderDay(n, 'day');
        }
      }));
    } else {
      var next = firstUndoneDay();
      var doneNote = el('div', { class: 'done-note' }, [
        el('span', {}, [el('span', { class: 'tick', text: '✓ ' }), 'Day ' + n + ' done']),
        justDone && next
          ? el('a', {
              href: '#/',
              class: 'next-link',
              text: 'Next day →',
              onclick: function (e) { e.preventDefault(); history.replaceState(null, '', '#/'); route(); }
            })
          : null
      ]);
      actions.appendChild(doneNote);
      if (!justDone) {
        actions.appendChild(el('button', {
          type: 'button',
          class: 'btn btn-secondary btn-block',
          text: 'Mark not done',
          onclick: function () { setDone(n, false); renderDay(n, mode); }
        }));
      }
    }

    var children = [
      el('div', { class: 'day-head' }, [
        el('div', { class: 'eyebrow', text: 'Week ' + d.week + (week ? ' · ' + week.title : '') }),
        el('h1', {}, [
          'Day ' + n + ' of ' + totalDays(),
          d.review ? el('span', { class: 'badge-review', text: 'Review' }) : null
        ]),
        week && week.goal ? el('div', { class: 'week', text: 'Goal: ' + week.goal }) : null
      ]),
      el('p', { class: 'count', text: doneCount() + ' of ' + totalDays() + ' days done' }),
      el('section', { class: 'card' }, [el('h2', { text: 'Learn' }), el('p', { text: d.learn })]),
      d.brief ? el('section', { class: 'card brief' }, [el('h2', { text: 'Brief' })].concat(renderBrief(d.brief))) : null,
      el('section', { class: 'card' }, [
        el('h2', { text: 'Decide' }),
        el('p', { text: d.decide }),
        el('label', { class: 'notes-label', for: 'notes' }, ['Notes', saveState]),
        textarea
      ]),
      el('section', { class: 'card' }, [el('h2', { text: 'Resource' }), el('p', { text: d.resource })]),
      actions
    ];

    if (justDone && !firstUndoneDay()) {
      children.push(el('p', { class: 'muted', text: 'That was the last day. All ' + totalDays() + ' done.' }));
    }

    app.replaceChildren.apply(app, children.filter(Boolean));
    window.scrollTo(0, 0);
  }

  function renderToday() {
    setActiveTab('today');
    var n = firstUndoneDay();
    if (n === null) {
      app.replaceChildren(el('div', { class: 'finished' }, [
        el('h1', { text: 'All ' + totalDays() + ' days done' }),
        el('p', { class: 'muted', text: 'Export your notes from All days, or open any day to revisit it.' }),
        el('a', { href: '#/all', class: 'btn', text: 'All days' })
      ]));
      return;
    }
    renderDay(n, 'today');
  }

  function renderAll() {
    setActiveTab('all');
    var current = firstUndoneDay();
    var nodes = [
      el('p', { class: 'count', text: doneCount() + ' of ' + totalDays() + ' days done' })
    ];

    content.weeks.forEach(function (w) {
      var list = el('ul', { class: 'day-list' });
      content.days.filter(function (d) { return d.week === w.week; }).forEach(function (d) {
        var done = isDone(d.day);
        list.appendChild(el('li', {}, [
          el('a', {
            href: '#/day/' + d.day,
            class: 'day-row' + (done ? ' is-done' : '') + (d.day === current ? ' is-current' : '')
          }, [
            el('span', { class: 'num', text: String(d.day) }),
            el('span', { class: 'title', text: d.learn }),
            el('span', { class: 'check', 'aria-label': done ? 'done' : 'not done', text: done ? '✓' : '' })
          ])
        ]));
      });
      nodes.push(el('section', { class: 'week-group' }, [
        el('h2', { text: 'Week ' + w.week + ' · ' + w.title }),
        el('p', { class: 'goal', text: w.goal }),
        el('div', { class: 'card', style: 'padding:4px 12px' }, [list])
      ]));
    });

    nodes.push(el('section', { class: 'data-section card' }, [
      el('h2', { text: 'Your data' }),
      el('p', { class: 'muted', text: 'Stored only on this phone. Back up now and then.' }),
      el('div', { class: 'button-grid' }, [
        el('button', { type: 'button', class: 'btn', text: 'Export notes (Markdown)', onclick: exportMarkdown }),
        el('button', { type: 'button', class: 'btn btn-secondary', text: 'Backup', onclick: exportBackup }),
        el('button', { type: 'button', class: 'btn btn-secondary', text: 'Restore', onclick: function () {
          document.getElementById('restore-input').click();
        } })
      ])
    ]));

    app.replaceChildren.apply(app, nodes);
  }

  // ---------- Routing ----------

  function route() {
    flushNotes();
    if (!content) return;
    var h = location.hash;
    var m = /^#\/day\/(\d+)$/.exec(h);
    if (m && getDay(Number(m[1]))) {
      setActiveTab('all');
      renderDay(Number(m[1]), 'day');
    } else if (h === '#/all') {
      renderAll();
    } else {
      renderToday();
    }
    updateProgress();
  }

  // ---------- Export / import ----------

  function stamp() {
    var d = new Date();
    function p(x) { return String(x).padStart(2, '0'); }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function buildMarkdown() {
    var out = ['# ' + content.title, ''];
    if (content.capstone) out.push('> ' + content.capstone, '');
    content.days.forEach(function (d) {
      out.push('## Day ' + d.day + ' — ' + d.learn, '');
      out.push('**Status:** ' + (isDone(d.day) ? 'done' : 'not done'), '');
      out.push('**Decide:** ' + d.decide, '');
      var notes = (state.notes[d.day] || '').trim();
      out.push(notes || '_No notes._', '');
    });
    return out.join('\n');
  }

  function deliverFile(filename, text, mime) {
    var file;
    try {
      file = new File([text], filename, { type: mime });
    } catch (e) {
      file = null;
    }
    if (file && navigator.canShare && navigator.share) {
      var data = { files: [file], title: filename };
      var canShare = false;
      try { canShare = navigator.canShare(data); } catch (e) { canShare = false; }
      if (canShare) {
        navigator.share(data).catch(function (err) {
          if (err && err.name === 'AbortError') return; // user closed the share sheet
          download(filename, text, mime);
        });
        return;
      }
    }
    download(filename, text, mime);
  }

  function download(filename, text, mime) {
    var url = URL.createObjectURL(new Blob([text], { type: mime }));
    var a = el('a', { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
  }

  function exportMarkdown() {
    flushNotes();
    deliverFile('sd-study-notes-' + stamp() + '.md', buildMarkdown(), 'text/markdown');
  }

  function exportBackup() {
    flushNotes();
    deliverFile('sd-study-backup-' + stamp() + '.json', JSON.stringify(state, null, 2), 'application/json');
  }

  function handleRestoreFile(e) {
    var input = e.target;
    var file = input.files && input.files[0];
    input.value = ''; // allow choosing the same file again
    if (!file) return;
    file.text().then(function (text) {
      var parsed;
      try {
        parsed = JSON.parse(text);
      } catch (err) {
        toast('Restore failed: that file is not valid JSON.', true);
        return;
      }
      if (!validateState(parsed)) {
        toast('Restore failed: not an SD Study backup (expected version 1 with "done" and "notes").', true);
        return;
      }
      var days = Object.keys(parsed.done).length;
      var notes = Object.keys(parsed.notes).length;
      if (!confirm('Replace current progress with this backup?\n' + days + ' days done, ' + notes + ' notes.')) return;
      flushNotes();
      state = { version: 1, done: parsed.done, notes: parsed.notes };
      if (writeState()) toast('Restored: ' + days + ' days done, ' + notes + ' notes.');
      route();
    }).catch(function () {
      toast('Restore failed: could not read the file.', true);
    });
  }

  // ---------- Service worker + updates ----------

  var updateAccepted = false;
  var reloading = false;

  function showUpdateBanner(reg) {
    var banner = document.getElementById('update-banner');
    banner.hidden = false;
    document.getElementById('update-reload').onclick = function () {
      flushNotes();
      updateAccepted = true;
      var waiting = reg.waiting;
      if (waiting) waiting.postMessage({ type: 'SKIP_WAITING' });
      else location.reload();
    };
  }

  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      // First install also fires this (clients.claim); only reload when the user asked.
      if (!updateAccepted || reloading) return;
      reloading = true;
      flushNotes();
      location.reload();
    });
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      if (reg.waiting && navigator.serviceWorker.controller) showUpdateBanner(reg);
      reg.addEventListener('updatefound', function () {
        var sw = reg.installing;
        if (!sw) return;
        sw.addEventListener('statechange', function () {
          // Only an update if a previous worker controls the page; first install is silent.
          if (sw.state === 'installed' && navigator.serviceWorker.controller) showUpdateBanner(reg);
        });
      });
    }).catch(function () { /* offline-first is best effort */ });
  }

  function requestPersistence() {
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persisted().then(function (already) {
        if (!already) return navigator.storage.persist();
      }).catch(function () {});
    }
  }

  // ---------- Boot ----------

  window.addEventListener('hashchange', route);
  window.addEventListener('pagehide', flushNotes);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') flushNotes();
  });
  document.getElementById('restore-input').addEventListener('change', handleRestoreFile);

  requestPersistence();
  registerSW();

  fetch('days.json')
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (json) {
      content = json;
      route();
    })
    .catch(function () {
      app.replaceChildren(
        el('h1', { text: 'Could not load the program' }),
        el('p', { class: 'muted', text: 'Open the app once with a connection so it can save itself for offline use.' })
      );
    });
})();
