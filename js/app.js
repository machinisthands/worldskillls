/* Machinist Hands — small script used on every page (js/app.js, as in HTML5 Boilerplate). */
(function () {
  'use strict';

  // Footer year follows the visitor's clock (the page already shows the build year without JavaScript).
  document.getElementById('year-now').textContent = new Date().getFullYear();

  // Year / project pickers on project pages: go to the chosen page
  document.querySelectorAll('.nav-select').forEach((s) => {
    s.addEventListener('change', () => { location.href = s.value; });
  });
})();
