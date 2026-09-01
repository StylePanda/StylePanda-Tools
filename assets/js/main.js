(function () {
  'use strict';

  var toggle = document.querySelector('.nav-toggle');
  var navigation = document.querySelector('.primary-nav');

  if (navigation && !navigation.getAttribute('aria-label')) navigation.setAttribute('aria-label', 'Hauptnavigation');

  if (navigation && !navigation.querySelector('a[href="/tools/bild/"]')) {
    var imageLink = document.createElement('a');
    imageLink.href = '/tools/bild/';
    imageLink.textContent = 'Bild Tools';
    if (location.pathname.indexOf('/tools/bild/') === 0) imageLink.setAttribute('aria-current', 'page');
    var externalLink = navigation.querySelector('.nav-external');
    navigation.insertBefore(imageLink, externalLink || null);
  }

  if (navigation && !navigation.querySelector('a[href="/tools/entwickler/"]')) {
    var developerLink = document.createElement('a');
    developerLink.href = '/tools/entwickler/';
    developerLink.textContent = 'Entwickler';
    if (location.pathname.indexOf('/tools/entwickler/') === 0) developerLink.setAttribute('aria-current', 'page');
    var developerExternalLink = navigation.querySelector('.nav-external');
    navigation.insertBefore(developerLink, developerExternalLink || null);
  }

  if (navigation) {
    var firstCategoryLink = navigation.querySelector('a[href^="/tools/"]') || navigation.querySelector('.nav-external');
    [['/tools/text/', 'Text Tools'], ['/tools/pdf/', 'PDF Tools']].forEach(function (item) {
      if (navigation.querySelector('a[href="' + item[0] + '"]')) return;
      var categoryLink = document.createElement('a');
      categoryLink.href = item[0];
      categoryLink.textContent = item[1];
      if (location.pathname.indexOf(item[0]) === 0) categoryLink.setAttribute('aria-current', 'page');
      navigation.insertBefore(categoryLink, firstCategoryLink || null);
    });
  }

  document.querySelectorAll('.breadcrumb').forEach(function (breadcrumb) {
    if (!breadcrumb.getAttribute('aria-label')) breadcrumb.setAttribute('aria-label', 'Brotkrümelnavigation');
  });

  document.querySelectorAll('.footer-grid > div').forEach(function (column) {
    var heading = column.querySelector('h2');
    if (heading && heading.textContent.trim() === 'Tools' && !column.querySelector('a[href="/tools/bild/"]')) {
      var footerImageLink = document.createElement('a');
      footerImageLink.href = '/tools/bild/';
      footerImageLink.textContent = 'Bild Tools';
      column.appendChild(footerImageLink);
    }
    if (heading && heading.textContent.trim() === 'Tools' && !column.querySelector('a[href="/tools/entwickler/"]')) {
      var footerDeveloperLink = document.createElement('a');
      footerDeveloperLink.href = '/tools/entwickler/';
      footerDeveloperLink.textContent = 'Entwickler';
      column.appendChild(footerDeveloperLink);
    }
    if (heading && heading.textContent.trim() === 'Tools') {
      [['/tools/text/', 'Text Tools'], ['/tools/pdf/', 'PDF Tools']].forEach(function (item) {
        if (column.querySelector('a[href="' + item[0] + '"]')) return;
        var footerCategoryLink = document.createElement('a');
        footerCategoryLink.href = item[0];
        footerCategoryLink.textContent = item[1];
        column.insertBefore(footerCategoryLink, column.querySelector('a') || null);
      });
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
