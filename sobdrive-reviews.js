// Renders Google reviews from reviews.json (refreshed daily by a GitHub Action).
// Progressive enhancement: on any failure the markup already in the page stays as-is.
(function () {
  var GOOGLE_SVG =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>';

  function el(tag, className, text) {
    var n = document.createElement(tag);
    if (className) n.className = className;
    if (text != null) n.textContent = text;
    return n;
  }

  function card(review, index) {
    var wrap = el('div', 'review reveal' + (index % 3 ? ' d' + (index % 3) : ''));
    wrap.appendChild(el('div', 'stars', '★★★★★'.slice(0, review.rating)));
    wrap.appendChild(el('p', null, '"' + review.text + '"'));

    var row = el('div', 'reviewer-row');
    row.appendChild(el('div', 'reviewer-avatar', (review.author || '?').trim().charAt(0).toUpperCase()));

    var meta = document.createElement('div');
    meta.appendChild(el('div', 'reviewer', review.author));
    meta.appendChild(el('div', 'reviewer-meta', review.relativeTime ? review.relativeTime + ' · Google Review' : 'Google Review'));
    row.appendChild(meta);

    var badge = el('div', 'google-badge');
    badge.innerHTML = GOOGLE_SVG;
    badge.appendChild(document.createTextNode(' Google'));
    row.appendChild(badge);

    wrap.appendChild(row);
    return wrap;
  }

  function render(data) {
    var grid = document.querySelector('[data-sd-reviews]');
    if (grid && data.reviews && data.reviews.length) {
      grid.textContent = '';
      data.reviews.forEach(function (r, i) { grid.appendChild(card(r, i)); });
      // City pages ship the section hidden — there is no static fallback there.
      document.querySelectorAll('[data-sd-reviews-section]').forEach(function (s) {
        s.removeAttribute('hidden');
      });
    }

    if (data.rating != null) {
      document.querySelectorAll('[data-sd-rating]').forEach(function (n) {
        n.textContent = Number(data.rating).toFixed(1);
      });
    }
    if (data.reviewCount != null) {
      document.querySelectorAll('[data-sd-count]').forEach(function (n) {
        n.textContent = n.dataset.sdCount === 'long'
          ? data.reviewCount + ' Google Reviews'
          : String(data.reviewCount);
      });
    }
    if (data.mapsUri) {
      document.querySelectorAll('[data-sd-maps]').forEach(function (a) { a.href = data.mapsUri; });
    }

    // Reviews are injected after the scroll observer has already run.
    document.querySelectorAll('[data-sd-reviews] .reveal').forEach(function (n) {
      n.classList.add('visible');
    });
  }

  function load() {
    fetch('reviews.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(render)
      .catch(function () { /* keep whatever the page already shows */ });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load);
  } else {
    load();
  }
})();
