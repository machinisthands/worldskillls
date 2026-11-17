/* Machinist Hands — small script used on every page (js/app.js, as in HTML5 Boilerplate). */
(function () {
  'use strict';

  // Footer year follows the visitor's clock (the page already shows the build year without JavaScript).
  document.getElementById('year-now').textContent = new Date().getFullYear();

  // Year / project pickers on project pages: go to the chosen page
  document.querySelectorAll('.nav-select').forEach((s) => {
    s.addEventListener('change', () => { location.href = s.value; });
  });

  // One Share button: opens the phone's own share menu (WhatsApp, Facebook, Gmail…);
  // on computers without that menu, it copies the link instead.
  document.querySelectorAll('.share-row').forEach((row) => {
    const url = row.dataset.url, title = row.dataset.title;
    const status = row.parentElement.querySelector('.share-status');
    const say = (m) => { if (status) status.textContent = m; };
    const btn = row.querySelector('.share-btn');
    if (!btn) return;
    const copy = () => {
      try {
        navigator.clipboard.writeText(url).then(
          () => say('Link copied. Paste it anywhere to share.'),
          () => say(url));
      } catch (err) { say(url); }
    };
    btn.addEventListener('click', () => {
      if (navigator.share) {
        // If the share menu is blocked (not just closed by the visitor), copy the link instead
        navigator.share({ title, url }).catch((err) => { if (!err || err.name !== 'AbortError') copy(); });
        return;
      }
      copy();
    });
  });

  // ---- Views, likes and dislikes (stored in Google Firebase / Firestore) ----
  // Fill these two values from your Firebase project (Project settings → General).
  // While they are empty the counts simply show "–".
  const FIREBASE = { projectId: '', apiKey: '' };

  const engage = document.querySelector('.engage');
  if (engage) {
    const page = engage.dataset.page;
    const status = engage.querySelector('.share-status');
    const store = {
      get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
      set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
      sget(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
      sset(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} },
    };
    const on = FIREBASE.projectId && FIREBASE.apiKey;
    const base = `https://firestore.googleapis.com/v1/projects/${FIREBASE.projectId}/databases/(default)/documents`;
    const counts = { views: 0, likes: 0, dislikes: 0 };
    // Numbers appear only once there is something to count: no "0", no "–"
    const views = engage.querySelector('.eng-views');
    const show = () => {
      engage.querySelectorAll('[data-count]').forEach((b) => {
        const n = Number(counts[b.dataset.count] || 0);
        b.textContent = n > 0 ? n.toLocaleString() : '';
      });
      if (views) {
        views.hidden = !(counts.views > 0);
        const l = views.querySelector('.eng-label');
        if (l) l.textContent = counts.views === 1 ? 'view' : 'views';
      }
    };
    const bump = (field) => fetch(`${base}:commit?key=${FIREBASE.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ writes: [{ transform: {
        document: `projects/${FIREBASE.projectId}/databases/(default)/documents/pages/${page}`,
        fieldTransforms: [{ fieldPath: field, increment: { integerValue: '1' } }],
      } }] }),
    }).then((r) => { if (!r.ok) throw new Error(r.status); });

    // Which button this browser already pressed
    const voted = store.get(`vote:${page}`);
    const btns = engage.querySelectorAll('[data-vote]');
    const mark = (v) => btns.forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.vote === v));
      b.disabled = Boolean(v);
    });
    if (voted) mark(voted);

    if (on) {
      fetch(`${base}/pages/${page}?key=${FIREBASE.apiKey}`)
        .then((r) => (r.ok ? r.json() : { fields: {} }))
        .then((d) => {
          Object.keys(counts).forEach((k) => { counts[k] = Number(d.fields?.[k]?.integerValue || 0); });
          // Count one view per browser session
          if (!store.sget(`viewed:${page}`)) {
            store.sset(`viewed:${page}`, '1');
            counts.views += 1;
            bump('views').catch(() => {});
          }
          show();
        })
        .catch(() => {});
    }

    btns.forEach((b) => b.addEventListener('click', () => {
      if (store.get(`vote:${page}`)) return;
      const v = b.dataset.vote;
      store.set(`vote:${page}`, v);
      mark(v);
      if (!on) return;
      counts[v] += 1; show();
      bump(v).catch(() => { if (status) status.textContent = 'Could not save your vote. Please try again later.'; });
    }));
  }
})();
