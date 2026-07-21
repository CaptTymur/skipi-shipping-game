(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ShippingPhaserMapCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var WORLD_WIDTH = 1440;
  var WORLD_HEIGHT = 720;

  function project(point) {
    return {
      x: (point[0] + 180) / 360 * WORLD_WIDTH,
      y: (90 - point[1]) / 180 * WORLD_HEIGHT
    };
  }

  function decodeArcs(topology) {
    var scale = topology.transform && topology.transform.scale || [1, 1];
    var translate = topology.transform && topology.transform.translate || [0, 0];
    var cache = {};

    return function decodeOne(index) {
      var reverse = index < 0;
      var sourceIndex = reverse ? ~index : index;
      if (!cache[sourceIndex]) {
        var x = 0;
        var y = 0;
        cache[sourceIndex] = (topology.arcs[sourceIndex] || []).map(function (point) {
          x += point[0];
          y += point[1];
          return [x * scale[0] + translate[0], y * scale[1] + translate[1]];
        });
      }
      var points = cache[sourceIndex].slice();
      return reverse ? points.reverse() : points;
    };
  }

  function joinRing(arcIndexes, decode) {
    var coordinates = [];
    (arcIndexes || []).forEach(function (arcIndex, arcNumber) {
      decode(arcIndex).forEach(function (point, pointNumber) {
        if (arcNumber > 0 && pointNumber === 0) return;
        coordinates.push(point);
      });
    });
    return coordinates;
  }

  function landRings(topology) {
    var decode = decodeArcs(topology);
    var geometries = topology.objects &&
      topology.objects.land &&
      topology.objects.land.geometries || [];
    var rings = [];

    geometries.forEach(function (geometry) {
      if (geometry.type === 'Polygon') {
        (geometry.arcs || []).forEach(function (ring) {
          rings.push(joinRing(ring, decode));
        });
      } else if (geometry.type === 'MultiPolygon') {
        (geometry.arcs || []).forEach(function (polygon) {
          polygon.forEach(function (ring) {
            rings.push(joinRing(ring, decode));
          });
        });
      }
    });
    return rings.filter(function (ring) { return ring.length > 2; });
  }

  function interpolateRoute(route, stepsPerLeg) {
    var output = [];
    var steps = Math.max(2, stepsPerLeg || 18);
    route.forEach(function (point, index) {
      if (index === route.length - 1) return;
      var next = route[index + 1];
      for (var step = 0; step < steps; step++) {
        var ratio = step / steps;
        var curve = Math.sin(ratio * Math.PI) * (index % 2 ? -0.32 : 0.24);
        output.push([
          point.lon + (next.lon - point.lon) * ratio,
          point.lat + (next.lat - point.lat) * ratio + curve
        ]);
      }
    });
    if (route.length) {
      output.push([route[route.length - 1].lon, route[route.length - 1].lat]);
    }
    return output;
  }

  function sampleNavigationPath(path, stepsPerLeg) {
    var output = [];
    var steps = Math.max(2, stepsPerLeg || 18);
    path.forEach(function (point, index) {
      if (index === path.length - 1) return;
      var next = path[index + 1];
      for (var step = 0; step < steps; step++) {
        var ratio = step / steps;
        output.push({
          lon: point.lon + (next.lon - point.lon) * ratio,
          lat: point.lat + (next.lat - point.lat) * ratio
        });
      }
    });
    if (path.length) {
      output.push({
        lon: path[path.length - 1].lon,
        lat: path[path.length - 1].lat
      });
    }
    return output;
  }

  function segmentSide(a, b, point) {
    return (point[0] - a[0]) * (b[1] - a[1]) -
      (point[1] - a[1]) * (b[0] - a[0]);
  }

  function segmentsIntersect(a, b, c, d) {
    var epsilon = 1e-9;
    var abC = segmentSide(a, b, c);
    var abD = segmentSide(a, b, d);
    var cdA = segmentSide(c, d, a);
    var cdB = segmentSide(c, d, b);
    return ((abC > epsilon && abD < -epsilon) || (abC < -epsilon && abD > epsilon)) &&
      ((cdA > epsilon && cdB < -epsilon) || (cdA < -epsilon && cdB > epsilon));
  }

  function crossesCoastline(topology, from, to) {
    var a = [from.lon, from.lat];
    var b = [to.lon, to.lat];
    var routeMinX = Math.min(a[0], b[0]);
    var routeMaxX = Math.max(a[0], b[0]);
    var routeMinY = Math.min(a[1], b[1]);
    var routeMaxY = Math.max(a[1], b[1]);
    return landRings(topology).some(function (ring) {
      for (var index = 1; index < ring.length; index++) {
        var c = ring[index - 1];
        var d = ring[index];
        if (Math.max(c[0], d[0]) < routeMinX ||
            Math.min(c[0], d[0]) > routeMaxX ||
            Math.max(c[1], d[1]) < routeMinY ||
            Math.min(c[1], d[1]) > routeMaxY) {
          continue;
        }
        if (segmentsIntersect(a, b, c, d)) return true;
      }
      return false;
    });
  }

  function positionOnNavigationPath(path, progress) {
    if (!path.length) return { x: 0, y: 0, heading: 0, lon: 0, lat: 0 };
    if (path.length === 1) {
      var only = project([path[0].lon, path[0].lat]);
      return { x: only.x, y: only.y, heading: 0, lon: path[0].lon, lat: path[0].lat };
    }

    var projected = path.map(function (point) {
      return project([point.lon, point.lat]);
    });
    var lengths = [];
    var total = 0;
    for (var index = 1; index < projected.length; index++) {
      var dx = projected[index].x - projected[index - 1].x;
      var dy = projected[index].y - projected[index - 1].y;
      var length = Math.sqrt(dx * dx + dy * dy);
      lengths.push(length);
      total += length;
    }

    var target = Math.max(0, Math.min(1, progress)) * total;
    var travelled = 0;
    for (var segment = 0; segment < lengths.length; segment++) {
      if (travelled + lengths[segment] >= target || segment === lengths.length - 1) {
        var ratio = lengths[segment] ?
          (target - travelled) / lengths[segment] :
          0;
        var from = projected[segment];
        var to = projected[segment + 1];
        var fromGeo = path[segment];
        var toGeo = path[segment + 1];
        return {
          x: from.x + (to.x - from.x) * ratio,
          y: from.y + (to.y - from.y) * ratio,
          heading: Math.atan2(to.y - from.y, to.x - from.x),
          lon: fromGeo.lon + (toGeo.lon - fromGeo.lon) * ratio,
          lat: fromGeo.lat + (toGeo.lat - fromGeo.lat) * ratio
        };
      }
      travelled += lengths[segment];
    }
    return {
      x: projected[projected.length - 1].x,
      y: projected[projected.length - 1].y,
      heading: 0,
      lon: path[path.length - 1].lon,
      lat: path[path.length - 1].lat
    };
  }

  function nauticalMiles(route) {
    var radiusNm = 3440.065;
    var total = 0;
    function radians(value) { return value * Math.PI / 180; }
    for (var index = 1; index < route.length; index++) {
      var previous = route[index - 1];
      var current = route[index];
      var deltaLat = radians(current.lat - previous.lat);
      var deltaLon = radians(current.lon - previous.lon);
      var latA = radians(previous.lat);
      var latB = radians(current.lat);
      var a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
        Math.cos(latA) * Math.cos(latB) *
        Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
      total += radiusNm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
    return Math.round(total);
  }

  return {
    WORLD_WIDTH: WORLD_WIDTH,
    WORLD_HEIGHT: WORLD_HEIGHT,
    project: project,
    landRings: landRings,
    interpolateRoute: interpolateRoute,
    sampleNavigationPath: sampleNavigationPath,
    crossesCoastline: crossesCoastline,
    positionOnNavigationPath: positionOnNavigationPath,
    nauticalMiles: nauticalMiles
  };
});
