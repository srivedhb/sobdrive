// Trip distance + fare estimate for the booking notification email.
// Dispatch reads these numbers off the email while calling the customer,
// so this must never block or fail a booking — every path resolves to
// something printable, even when the routing API is unreachable.
(function () {
  var GEOAPIFY_KEY = 'cced98652cc54ef49a5845718d2a670d';
  var TIMEOUT_MS = 6000;

  // Business rule from the pricing section: decimal above 0.2 rounds up.
  function roundKm(km) {
    var whole = Math.floor(km);
    return km - whole > 0.2 ? whole + 1 : whole;
  }

  function fareFor(km) {
    if (km <= 10) {
      return { total: 39.99, breakdown: 'Flat rate (under 10km) — no booking fee' };
    }
    return {
      total: 19.99 + km * 2.5,
      breakdown: '$19.99 booking fee + ' + km + 'km x $2.50',
    };
  }

  function money(n) { return '$' + n.toFixed(2); }

  function withTimeout(url) {
    var ctrl = new AbortController();
    var t = setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS);
    return fetch(url, { signal: ctrl.signal })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .finally(function () { clearTimeout(t); });
  }

  function geocode(text) {
    return withTimeout(
      'https://api.geoapify.com/v1/geocode/search?text=' + encodeURIComponent(text) +
      '&limit=1&filter=countrycode:ca&apiKey=' + GEOAPIFY_KEY
    ).then(function (d) {
      var f = d.features && d.features[0];
      return f ? { lat: f.properties.lat, lon: f.properties.lon } : null;
    });
  }

  // Straight-line fallback. Road distance runs longer than the crow flies,
  // so 1.3x keeps the estimate from under-quoting when routing is down.
  function haversineKm(a, b) {
    var R = 6371, toRad = Math.PI / 180;
    var dLat = (b.lat - a.lat) * toRad, dLon = (b.lon - a.lon) * toRad;
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  }

  function route(a, b) {
    return withTimeout(
      'https://api.geoapify.com/v1/routing?waypoints=' +
      a.lat + ',' + a.lon + '|' + b.lat + ',' + b.lon +
      '&mode=drive&apiKey=' + GEOAPIFY_KEY
    ).then(function (d) {
      var p = d.features && d.features[0] && d.features[0].properties;
      if (!p || typeof p.distance !== 'number') return null;
      return { km: p.distance / 1000, minutes: p.time ? Math.round(p.time / 60) : null };
    });
  }

  function pointFor(id, text) {
    var stored = window.__sobdriveCoords && window.__sobdriveCoords[id];
    if (stored && stored.lat != null) return Promise.resolve(stored);
    return geocode(text);
  }

  // Always resolves. On failure the email says so plainly rather than
  // showing a number dispatch might quote by mistake.
  function estimate(pickupText, dropoffText) {
    var unavailable = {
      distance_km: 'Not available',
      drive_time: 'Not available',
      fare_estimate: 'Quote manually',
      fare_breakdown: 'Distance lookup failed — confirm fare with the customer.',
      distance_source: 'unavailable',
    };

    return Promise.all([
      pointFor('fpickup', pickupText),
      pointFor('fdropoff', dropoffText),
    ]).then(function (pts) {
      var a = pts[0], b = pts[1];
      if (!a || !b) return unavailable;

      return route(a, b)
        .catch(function () { return null; })
        .then(function (r) {
          var rawKm, minutes, source;
          if (r) {
            rawKm = r.km; minutes = r.minutes; source = 'driving route';
          } else {
            rawKm = haversineKm(a, b) * 1.3; minutes = null; source = 'estimated (straight-line)';
          }

          var km = roundKm(rawKm);
          if (km < 1) km = 1;
          var f = fareFor(km);

          return {
            distance_km: km + ' km',
            drive_time: minutes ? '~' + minutes + ' min' : 'Not available',
            fare_estimate: money(f.total),
            fare_breakdown: f.breakdown,
            distance_source: source,
          };
        });
    }).catch(function () { return unavailable; });
  }

  window.SobdriveTrip = { estimate: estimate, roundKm: roundKm, fareFor: fareFor };
})();
