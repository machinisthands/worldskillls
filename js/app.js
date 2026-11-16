/* Machinist Hands — small script used on every page (js/app.js, as in HTML5 Boilerplate). */
(function () {
  'use strict';

  // Footer year follows the visitor's clock (the page already shows the build year without JavaScript).
  document.getElementById('year-now').textContent = new Date().getFullYear();

  // Year / project pickers on project pages: go to the chosen page
  document.querySelectorAll('.nav-select').forEach((s) => {
    s.addEventListener('change', () => { location.href = s.value; });
  });

  // Old links such as index.html#tp-2019-1 → the project's own page
  const old = location.hash.match(/^#tp-(\d{4})-(\d+)$/);
  if (old) location.replace(`worldskills-${old[1]}-test-project-${old[2]}.html`);

  // On the 404 page: old files such as "2007 Project 1/All.zip" → that project's page
  const oldDir = decodeURIComponent(location.pathname).match(/\/(\d{4}) Project (\d+)\//);
  if (oldDir) location.replace(`worldskills-${oldDir[1]}-test-project-${oldDir[2]}.html`);
})();
