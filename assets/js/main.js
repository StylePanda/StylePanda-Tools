(function () {
  'use strict';

  var toggle = document.querySelector('.nav-toggle');
  var navigation = document.querySelector('.primary-nav');

  if (toggle && navigation) {
    toggle.addEventListener('click', function () {
      var isOpen = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!isOpen));
      navigation.classList.toggle('is-open', !isOpen);
      toggle.querySelector('.sr-only').textContent = isOpen ? 'Navigation öffnen' : 'Navigation schließen';
    });

    navigation.addEventListener('click', function (event) {
      if (event.target.closest('a')) {
        toggle.setAttribute('aria-expanded', 'false');
        navigation.classList.remove('is-open');
      }
    });
  }

  document.querySelectorAll('[data-current-year]').forEach(function (element) {
    element.textContent = String(new Date().getFullYear());
  });
}());
