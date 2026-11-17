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
  // Firebase project "worldskills-like-dislike-share" (Project settings → General → Your apps → website).
  // This web API key is public by design; the Firestore security rules decide what visitors may change.
  const FIREBASE = { projectId: 'worldskills-like-dislike-share', apiKey: 'AIzaSyBILSaQCgx9XFSYkLhdapt7p1qFu0XQfVk' };

  const engage = document.querySelector('.engage');
  if (engage) {
    const page = engage.dataset.page;
    const status = engage.querySelector('.share-status');
    const store = {
      get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
      set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
      del(k) { try { localStorage.removeItem(k); } catch (e) {} },
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
    // Send +1 / -1 changes, e.g. { likes: 1, dislikes: -1 }, in one request
    const send = (changes) => fetch(`${base}:commit?key=${FIREBASE.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ writes: [{ transform: {
        document: `projects/${FIREBASE.projectId}/databases/(default)/documents/pages/${page}`,
        fieldTransforms: Object.entries(changes).map(([field, n]) => ({ fieldPath: field, increment: { integerValue: String(n) } })),
      } }] }),
    }).then((r) => { if (!r.ok) throw new Error(r.status); });

    // This browser's vote: 'likes', 'dislikes' or none. Tap the same thumb again to take it back,
    // or the other thumb to change it. (v2: votes saved before the counters went live are ignored.)
    const KEY = `vote-v2:${page}`;
    let vote = store.get(KEY);
    let busy = false;
    const btns = engage.querySelectorAll('[data-vote]');
    const mark = () => btns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.vote === vote)));
    mark();

    if (on) {
      fetch(`${base}/pages/${page}?key=${FIREBASE.apiKey}`)
        .then((r) => (r.ok ? r.json() : { fields: {} }))
        .then((d) => {
          Object.keys(counts).forEach((k) => { counts[k] = Number(d.fields?.[k]?.integerValue || 0); });
          // Count one view per browser session
          if (!store.sget(`viewed:${page}`)) {
            store.sset(`viewed:${page}`, '1');
            counts.views += 1;
            send({ views: 1 }).catch(() => {});
          }
          show();
        })
        .catch(() => {});
    }

    btns.forEach((b) => b.addEventListener('click', () => {
      if (busy) return;
      const v = b.dataset.vote;
      const before = vote;
      const changes = {};
      if (before === v) { changes[v] = -1; vote = null; }          // take the vote back
      else { changes[v] = 1; if (before) changes[before] = -1; vote = v; } // new vote, or switch
      const apply = (sign) => Object.entries(changes).forEach(([k, n]) => { counts[k] = Math.max(0, counts[k] + sign * n); });
      apply(1); mark(); show();
      if (vote) store.set(KEY, vote); else store.del(KEY);
      if (status) status.textContent = '';
      if (!on) return;
      busy = true;
      send(changes)
        .catch(() => {
          apply(-1); vote = before; mark(); show();
          if (before) store.set(KEY, before); else store.del(KEY);
          if (status) status.textContent = 'Could not save your vote. Please try again.';
        })
        .finally(() => { busy = false; });
    }));
  }
})();
