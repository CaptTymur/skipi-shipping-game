/* MapRenderer hides the bundled contour format from game logic.
   Current asset: Natural Earth/world-atlas TopoJSON land contours. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SkipiShippingGameMapRenderer = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function decodeArcs(topology) {
    var scale = topology.transform && topology.transform.scale || [1, 1];
    var translate = topology.transform && topology.transform.translate || [0, 0];
    var cache = {};
    function decodeOne(i) {
      var reverse = i < 0;
      var idx = reverse ? ~i : i;
      if (!cache[idx]) {
        var x = 0, y = 0;
        cache[idx] = (topology.arcs[idx] || []).map(function (p) {
          x += p[0]; y += p[1];
          return [x * scale[0] + translate[0], y * scale[1] + translate[1]];
        });
      }
      var pts = cache[idx].slice();
      return reverse ? pts.reverse() : pts;
    }
    return decodeOne;
  }

  function project(pt, width, height) {
    var lon = pt[0], lat = pt[1];
    return [
      (lon + 180) / 360 * width,
      (90 - lat) / 180 * height
    ];
  }

  function ringPath(ring, decode, width, height) {
    var coords = [];
    ring.forEach(function (arcIndex, arcNo) {
      var arc = decode(arcIndex);
      arc.forEach(function (pt, i) {
        if (arcNo > 0 && i === 0) return;
        coords.push(project(pt, width, height));
      });
    });
    if (!coords.length) return '';
    return coords.map(function (p, i) {
      return (i ? 'L' : 'M') + p[0].toFixed(2) + ',' + p[1].toFixed(2);
    }).join(' ') + ' Z';
  }

  function landPaths(contours, width, height) {
    var decode = decodeArcs(contours);
    var geoms = contours.objects && contours.objects.land && contours.objects.land.geometries || [];
    var out = [];
    geoms.forEach(function (g) {
      if (g.type === 'Polygon') {
        (g.arcs || []).forEach(function (ring) {
          var d = ringPath(ring, decode, width, height);
          if (d) out.push(d);
        });
      } else if (g.type === 'MultiPolygon') {
        (g.arcs || []).forEach(function (poly) {
          poly.forEach(function (ring) {
            var d = ringPath(ring, decode, width, height);
            if (d) out.push(d);
          });
        });
      }
    });
    return out;
  }

  function elSvg(tag) { return document.createElementNS('http://www.w3.org/2000/svg', tag); }

  function render(container, opts) {
    opts = opts || {};
    var width = 960, height = 480;
    container.innerHTML = '';
    var svg = elSvg('svg');
    svg.setAttribute('class', 'sg-map-svg');
    svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Bundled world coastline contours with one training vessel marker');

    var ocean = elSvg('rect');
    ocean.setAttribute('class', 'sg-map-ocean');
    ocean.setAttribute('x', '0'); ocean.setAttribute('y', '0');
    ocean.setAttribute('width', String(width)); ocean.setAttribute('height', String(height));
    svg.appendChild(ocean);

    landPaths(opts.contours, width, height).forEach(function (d) {
      var p = elSvg('path');
      p.setAttribute('class', 'sg-map-land');
      p.setAttribute('d', d);
      svg.appendChild(p);
    });

    var vessel = opts.vessel || null;
    if (vessel) {
      var pos = project([vessel.lon, vessel.lat], width, height);
      var marker = elSvg('g');
      marker.setAttribute('class', 'sg-vessel-marker');
      marker.setAttribute('transform', 'translate(' + pos[0].toFixed(2) + ' ' + pos[1].toFixed(2) + ')');
      var hull = elSvg('path');
      hull.setAttribute('d', 'M0,-12 L17,7 L4,4 L0,14 L-4,4 L-17,7 Z');
      var pulse = elSvg('circle');
      pulse.setAttribute('r', '20');
      var label = elSvg('text');
      label.setAttribute('x', '20');
      label.setAttribute('y', '-12');
      label.textContent = vessel.label || 'Training vessel';
      marker.appendChild(pulse);
      marker.appendChild(hull);
      marker.appendChild(label);
      svg.appendChild(marker);
    }

    container.appendChild(svg);
    return { ok: true, paths: svg.querySelectorAll ? svg.querySelectorAll('path.sg-map-land').length : 0 };
  }

  return { render: render, _landPaths: landPaths };
});

