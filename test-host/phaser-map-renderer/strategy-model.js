(function (root, factory) {
  'use strict';
  var model = factory();
  if (typeof module === 'object' && module.exports) module.exports = model;
  root.ShippingPhaserStrategyModel = model;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var ports = [
    { id: 'odesa', name: 'Odesa', code: 'UAODS', lon: 30.7233, lat: 46.4825, state: 'Origin', labelSide: 'right' },
    { id: 'constanta', name: 'Constanța', code: 'ROCND', lon: 28.6508, lat: 44.1598, state: 'Option', labelSide: 'left' },
    { id: 'istanbul', name: 'Istanbul', code: 'TRIST', lon: 28.9784, lat: 41.0082, state: 'Transit', labelSide: 'left' },
    { id: 'samsun', name: 'Samsun', code: 'TRSSX', lon: 36.3361, lat: 41.2797, state: 'Waypoint', labelSide: 'right' },
    { id: 'batumi', name: 'Batumi', code: 'GEBUS', lon: 41.6367, lat: 41.6168, state: 'Destination', labelSide: 'right' }
  ];

  function port(id) {
    return ports.filter(function (item) { return item.id === id; })[0];
  }

  var anchorages = {
    odesa: { id: 'odesa-roads', name: 'Odesa Roads', lon: 30.82, lat: 46.12, kind: 'sea' },
    batumi: { id: 'batumi-roads', name: 'Batumi Roads', lon: 41.38, lat: 42.05, kind: 'sea' },
    constanta: { id: 'constanta-roads', name: 'Constanța Roads', lon: 29.08, lat: 44.18, kind: 'sea' },
    samsun: { id: 'samsun-roads', name: 'Samsun Roads', lon: 36.30, lat: 42.20, kind: 'sea' }
  };

  var sea = {
    westNorth: { id: 'west-black-sea-north', lon: 30.85, lat: 44.72, kind: 'sea' },
    centralNorth: { id: 'central-black-sea-north', lon: 34.65, lat: 44.05, kind: 'sea' },
    centralSouth: { id: 'central-black-sea-south', lon: 33.45, lat: 42.75, kind: 'sea' },
    southWest: { id: 'south-west-black-sea', lon: 30.15, lat: 43.30, kind: 'sea' },
    southCentral: { id: 'south-central-black-sea', lon: 32.20, lat: 42.45, kind: 'sea' },
    east: { id: 'east-black-sea', lon: 39.25, lat: 42.30, kind: 'sea' }
  };

  var routes = {
    odesaBatumi: {
      id: 'odesa-batumi-laden',
      kind: 'laden',
      from: port('odesa'),
      to: port('batumi'),
      path: [port('odesa'), anchorages.odesa, sea.westNorth, sea.centralNorth, sea.east, anchorages.batumi, port('batumi')]
    },
    batumiConstanta: {
      id: 'batumi-constanta-ballast',
      kind: 'ballast',
      from: anchorages.batumi,
      to: anchorages.constanta,
      path: [anchorages.batumi, sea.east, sea.centralSouth, sea.westNorth, anchorages.constanta]
    },
    constantaSamsun: {
      id: 'constanta-samsun-laden',
      kind: 'laden',
      from: port('constanta'),
      to: port('samsun'),
      path: [port('constanta'), anchorages.constanta, sea.southWest, sea.southCentral, anchorages.samsun, port('samsun')]
    }
  };

  function thousands(value) {
    return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function loadStatus(vessel) {
    if (vessel && vessel.loadState === 'laden' && vessel.cargo) {
      return {
        state: 'LADEN',
        detail: String(vessel.cargo.commodity || 'CARGO').toUpperCase() +
          ' · ' + thousands(vessel.cargo.quantityMt || 0) + ' MT'
      };
    }
    return { state: 'BALLAST', detail: 'IN BALLAST' };
  }

  var cargo = { commodity: 'corn', quantityMt: 32521 };
  var cargoDetail = loadStatus({ loadState: 'laden', cargo: cargo }).detail;
  var voyagePhases = [
    {
      id: 'loading-odesa', kind: 'loading', durationMs: 3500,
      port: port('odesa'), position: port('odesa'), milestone: 'odesa',
      loadState: 'laden', cargo: cargo, state: 'LOADING', detail: cargoDetail,
      voyageTitle: 'Odesa → Batumi', summary: 'Loading the first fictional cargo in Odesa.', route: routes.odesaBatumi
    },
    {
      id: 'laden-odesa-batumi', kind: 'sailing_laden', durationMs: 14000,
      path: routes.odesaBatumi.path, milestone: 'odesa',
      loadState: 'laden', cargo: cargo, state: 'LADEN', detail: cargoDetail,
      voyageTitle: 'Odesa → Batumi', summary: 'Laden passage to the discharge port.', route: routes.odesaBatumi
    },
    {
      id: 'discharging-batumi', kind: 'discharging', durationMs: 3500,
      port: port('batumi'), position: port('batumi'), milestone: 'batumi',
      loadState: 'laden', cargo: cargo, state: 'DISCHARGING', detail: cargoDetail,
      voyageTitle: 'Odesa → Batumi', summary: 'Cargo operations at the discharge berth.', route: routes.odesaBatumi
    },
    {
      id: 'shifting-batumi-roads', kind: 'shifting_to_roads', durationMs: 2500,
      path: [port('batumi'), anchorages.batumi], milestone: 'batumi',
      loadState: 'ballast', state: 'BALLAST', detail: 'SHIFTING TO BATUMI ROADS',
      voyageTitle: 'Batumi Roads', summary: 'Discharged and shifting to the waiting area.', route: routes.batumiConstanta
    },
    {
      id: 'awaiting-orders-batumi', kind: 'awaiting_orders', durationMs: 5000,
      anchorage: anchorages.batumi, position: anchorages.batumi, milestone: 'orders',
      loadState: 'ballast', state: 'BALLAST', detail: 'WAITING FOR VOYAGE ORDER',
      voyageTitle: 'Batumi Roads', summary: 'At anchor after discharge, awaiting employment.', route: routes.batumiConstanta
    },
    {
      id: 'order-received', kind: 'order_received', durationMs: 3000,
      anchorage: anchorages.batumi, position: anchorages.batumi, milestone: 'orders',
      loadState: 'ballast', state: 'ORDER RECEIVED', detail: 'CONSTANȚA → SAMSUN',
      voyageTitle: 'Constanța → Samsun', summary: 'New voyage order received; proceed to the load port.', route: routes.batumiConstanta
    },
    {
      id: 'ballast-batumi-constanta', kind: 'sailing_ballast', durationMs: 14000,
      path: routes.batumiConstanta.path, milestone: 'orders',
      loadState: 'ballast', state: 'BALLAST', detail: 'PROCEEDING TO CONSTANȚA',
      voyageTitle: 'Constanța → Samsun', summary: 'Ballast positioning toward the next load port.', route: routes.batumiConstanta
    },
    {
      id: 'awaiting-loading-constanta', kind: 'awaiting_loading', durationMs: 5000,
      anchorage: anchorages.constanta, position: anchorages.constanta, milestone: 'constanta',
      loadState: 'ballast', state: 'AT ANCHOR', detail: 'WAITING FOR LOADING',
      voyageTitle: 'Constanța → Samsun', summary: 'At Constanța Roads, waiting for the loading berth.', route: routes.constantaSamsun
    },
    {
      id: 'berthing-constanta', kind: 'berthing', durationMs: 2500,
      path: [anchorages.constanta, port('constanta')], milestone: 'constanta',
      loadState: 'ballast', state: 'BERTHING', detail: 'PROCEEDING TO LOAD PORT',
      voyageTitle: 'Constanța → Samsun', summary: 'Called forward from the anchorage to load.', route: routes.constantaSamsun
    },
    {
      id: 'loading-constanta', kind: 'loading', durationMs: 4000,
      port: port('constanta'), position: port('constanta'), milestone: 'constanta',
      loadState: 'laden', cargo: cargo, state: 'LOADING', detail: cargoDetail,
      voyageTitle: 'Constanța → Samsun', summary: 'Loading the nominated cargo in Constanța.', route: routes.constantaSamsun
    },
    {
      id: 'laden-constanta-samsun', kind: 'sailing_laden', durationMs: 14000,
      path: routes.constantaSamsun.path, milestone: 'constanta',
      loadState: 'laden', cargo: cargo, state: 'LADEN', detail: cargoDetail,
      voyageTitle: 'Constanța → Samsun', summary: 'Laden passage toward the next discharge port.', route: routes.constantaSamsun
    },
    {
      id: 'ready-discharge-samsun', kind: 'ready_to_discharge', durationMs: 4000,
      port: port('samsun'), position: port('samsun'), milestone: 'samsun',
      loadState: 'laden', cargo: cargo, state: 'ARRIVED', detail: 'READY TO DISCHARGE',
      voyageTitle: 'Constanța → Samsun', summary: 'Arrived at the discharge port; training cycle complete.', route: routes.constantaSamsun
    }
  ];

  return {
    scenario: 'BLACK SEA / SG-001',
    ports: ports,
    anchorages: anchorages,
    routes: routes,
    route: [port('odesa'), port('batumi')],
    navigationPath: routes.odesaBatumi.path,
    voyagePhases: voyagePhases,
    loadStatus: loadStatus,
    vessel: {
      id: 'fictional-mv-northern-light',
      name: 'MV Northern Light',
      loadState: 'laden',
      cargo: cargo,
      status: 'Under way',
      note: 'Fictional training vessel'
    }
  };
});
