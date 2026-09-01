(function () {
  'use strict';

  var toggle = document.querySelector('.nav-toggle');
  var navigation = document.querySelector('.primary-nav');

  if (navigation && !navigation.querySelector('a[href="/tools/bild/"]')) {
    var imageLink = document.createElement('a');
    imageLink.href = '/tools/bild/';
    imageLink.textContent = 'Bild Tools';
    if (location.pathname.indexOf('/tools/bild/') === 0) imageLink.setAttribute('aria-current', 'page');
    var externalLink = navigation.querySelector('.nav-external');
    navigation.insertBefore(imageLink, externalLink || null);
  }

  document.querySelectorAll('.footer-grid > div').forEach(function (column) {
    var heading = column.querySelector('h2');
    if (heading && heading.textContent.trim() === 'Tools' && !column.querySelector('a[href="/tools/bild/"]')) {
      var footerImageLink = document.createElement('a');
      footerImageLink.href = '/tools/bild/';
      footerImageLink.textContent = 'Bild Tools';
      column.appendChild(footerImageLink);
    }
  });

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
