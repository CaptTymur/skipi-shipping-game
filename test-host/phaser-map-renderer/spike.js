(function () {
  'use strict';

  var PhaserRef = window.Phaser;
  var Core = window.ShippingPhaserMapCore;
  var Model = window.ShippingPhaserStrategyModel;
  var contours = window.SkipiShippingGameBundledContours;
  var stage = document.getElementById('map-stage');
  var zoomReadout = document.getElementById('zoom-readout');
  var rendererStatus = document.getElementById('renderer-status');
  var routeDistance = document.getElementById('route-distance');
  var motionButton = document.getElementById('toggle-motion');
  var vesselLoadState = document.getElementById('vessel-load-state');
  var vesselLoadDetail = document.getElementById('vessel-load-detail');
  var voyageTitle = document.getElementById('voyage-title');
  var voyageSummary = document.getElementById('voyage-summary');
  var phaseRemaining = document.getElementById('phase-remaining');
  var cyclePhase = document.getElementById('cycle-phase');
  var cycleProgress = document.getElementById('cycle-progress');
  var game = null;
  var sceneRef = null;
  var readyResolve;
  var ready = new Promise(function (resolve) { readyResolve = resolve; });
  var INITIAL_ZOOM = 6.1;
  var INITIAL_CENTER = [34.7, 43.2];

  function ensureRuntime() {
    if (!PhaserRef) throw new Error('Local Phaser vendor failed to load');
    if (!Core || !Model || !contours) throw new Error('Local spike data failed to load');
  }

  function rendererName() {
    if (!game || !game.renderer) return 'unknown';
    return game.renderer.type === PhaserRef.CANVAS ? 'canvas' : 'webgl';
  }

  function updateReadout() {
    if (!sceneRef) return;
    zoomReadout.textContent = Math.round(sceneRef.cameras.main.zoom / INITIAL_ZOOM * 100) + '%';
  }

  function updateMarkerScale(scene) {
    var scale = 1 / scene.cameras.main.zoom;
    (scene.mapMarkers || []).forEach(function (marker) {
      marker.setScale(scale);
    });
  }

  function zoomAt(camera, screenX, screenY, nextZoom) {
    var before = camera.getWorldPoint(screenX, screenY);
    camera.setZoom(PhaserRef.Math.Clamp(nextZoom, 2.4, 9.2));
    var after = camera.getWorldPoint(screenX, screenY);
    camera.scrollX += before.x - after.x;
    camera.scrollY += before.y - after.y;
    updateMarkerScale(sceneRef);
    updateReadout();
  }

  function setInitialView(camera) {
    var center = Core.project(INITIAL_CENTER);
    camera.setZoom(INITIAL_ZOOM);
    camera.centerOn(center.x, center.y);
    updateMarkerScale(sceneRef);
    updateReadout();
  }

  function drawGrid(scene) {
    var graphics = scene.add.graphics();
    graphics.lineStyle(0.16, 0x6f959c, 0.13);
    for (var lon = -180; lon <= 180; lon += 10) {
      var x = Core.project([lon, 0]).x;
      graphics.lineBetween(x, 0, x, Core.WORLD_HEIGHT);
    }
    for (var lat = -80; lat <= 80; lat += 10) {
      var y = Core.project([0, lat]).y;
      graphics.lineBetween(0, y, Core.WORLD_WIDTH, y);
    }
  }

  function drawLand(scene, rings) {
    var shadow = scene.add.graphics();
    var land = scene.add.graphics();
    shadow.fillStyle(0x061116, 0.25);
    land.fillStyle(0x20373b, 1);
    land.lineStyle(0.2, 0x66878b, 0.62);

    rings.forEach(function (ring) {
      var projected = ring.map(Core.project);
      if (projected.length < 3) return;

      shadow.beginPath();
      shadow.moveTo(projected[0].x + 1.2, projected[0].y + 1.6);
      projected.slice(1).forEach(function (point) {
        shadow.lineTo(point.x + 1.2, point.y + 1.6);
      });
      shadow.closePath();
      shadow.fillPath();

      land.beginPath();
      land.moveTo(projected[0].x, projected[0].y);
      projected.slice(1).forEach(function (point) {
        land.lineTo(point.x, point.y);
      });
      land.closePath();
      land.fillPath();
      land.strokePath();
    });
  }

  function drawDashedRoute(scene, projectedRoute, color) {
    var glow = scene.add.graphics();
    var route = scene.add.graphics();
    glow.lineStyle(1.1, color, 0.12);
    route.lineStyle(0.38, color, 0.92);

    for (var index = 1; index < projectedRoute.length; index++) {
      var previous = projectedRoute[index - 1];
      var point = projectedRoute[index];
      glow.lineBetween(previous.x, previous.y, point.x, point.y);
      if (index % 4 < 3) route.lineBetween(previous.x, previous.y, point.x, point.y);
    }
  }

  function addPort(scene, port) {
    var point = Core.project([port.lon, port.lat]);
    var isLeft = port.labelSide === 'left';
    var labelX = isLeft ? -10 : 10;
    var marker = scene.add.graphics();
    marker.fillStyle(0x0d2026, 1);
    marker.lineStyle(2, 0xf2b84b, 1);
    marker.fillCircle(0, 0, 6);
    marker.strokeCircle(0, 0, 6);
    marker.fillStyle(0xf2b84b, 1);
    marker.fillCircle(0, 0, 2);

    var label = scene.add.text(labelX, -12, port.name.toUpperCase(), {
      fontFamily: 'Arial, sans-serif',
      fontSize: '12px',
      fontStyle: 'bold',
      color: '#d7e7e8',
      stroke: '#0a171c',
      strokeThickness: 4
    });
    label.setOrigin(isLeft ? 1 : 0, 0);
    var code = scene.add.text(labelX, 2, port.code, {
      fontFamily: 'Arial, sans-serif',
      fontSize: '9px',
      color: '#789398',
      stroke: '#0a171c',
      strokeThickness: 2
    });
    code.setOrigin(isLeft ? 1 : 0, 0);
    var container = scene.add.container(point.x, point.y, [marker, label, code]);
    container.setDepth(6);
    return container;
  }

  function addVessel(scene) {
    var vessel = Model.vessel;
    var phase = Model.voyagePhases[0];
    var start = phase.position || phase.path[0];
    var point = Core.project([start.lon, start.lat]);
    var halo = scene.add.graphics();
    halo.fillStyle(0xf2b84b, 0.08);
    halo.lineStyle(1.2, 0xf2b84b, 0.36);
    halo.fillCircle(0, 0, 17);
    halo.strokeCircle(0, 0, 17);

    var hull = scene.add.graphics();
    hull.fillStyle(0xf2b84b, 1);
    hull.lineStyle(1.2, 0xffffff, 0.82);
    hull.fillTriangle(-10, 6, 12, 0, -10, -6);
    hull.strokeTriangle(-10, 6, 12, 0, -10, -6);

    var tagBackground = scene.add.rectangle(16, -27, 206, 33, 0x0b181d, 0.92);
    tagBackground.setOrigin(0, 0.5);
    tagBackground.setStrokeStyle(1, 0xf2b84b, 0.38);
    var tag = scene.add.text(24, -35, vessel.name.toUpperCase(), {
      fontFamily: 'Arial, sans-serif',
      fontSize: '12px',
      fontStyle: 'bold',
      color: '#f5ca75'
    });
    var state = scene.add.text(24, -20, phase.state + ' · ' + phase.detail, {
      fontFamily: 'Arial, sans-serif',
      fontSize: '9px',
      color: '#8da5a9'
    });

    var container = scene.add.container(point.x, point.y, [halo, hull, tagBackground, tag, state]);
    container.setDepth(9);
    container.hullIcon = hull;
    container.stateText = state;
    return container;
  }

  function phasePosition(phase, progress) {
    if (phase.path) return Core.positionOnNavigationPath(phase.path, progress);
    var point = phase.position || phase.port || phase.anchorage;
    var projected = Core.project([point.lon, point.lat]);
    return { x: projected.x, y: projected.y, heading: 0 };
  }

  function milestoneIndex(id) {
    return ['odesa', 'batumi', 'orders', 'constanta', 'samsun'].indexOf(id);
  }

  function updateMilestones(activeId) {
    var activeIndex = milestoneIndex(activeId);
    Array.prototype.forEach.call(document.querySelectorAll('[data-milestone]'), function (item) {
      var index = milestoneIndex(item.getAttribute('data-milestone'));
      item.classList.toggle('active', index === activeIndex);
      item.classList.toggle('done', index < activeIndex);
    });
  }

  function formatRemaining(milliseconds) {
    var seconds = Math.max(0, Math.ceil(milliseconds / 1000));
    return '00:' + String(seconds).padStart(2, '0');
  }

  function updatePhaseUi(scene, force) {
    var phase = Model.voyagePhases[scene.phaseIndex];
    if (!force && scene.renderedPhaseId === phase.id) return;
    scene.renderedPhaseId = phase.id;
    vesselLoadState.textContent = phase.state;
    vesselLoadState.setAttribute('data-load-state', phase.loadState);
    vesselLoadDetail.textContent = phase.detail;
    voyageTitle.textContent = phase.voyageTitle;
    voyageSummary.textContent = phase.summary;
    cyclePhase.textContent = (scene.phaseIndex + 1) + '/' + Model.voyagePhases.length;
    cycleProgress.textContent = phase.state;
    routeDistance.textContent = Core.nauticalMiles(phase.route.path).toLocaleString('en-US') + ' NM';
    scene.vesselMarker.stateText.setText(phase.state + ' · ' + phase.detail);
    updateMilestones(phase.milestone);
  }

  function updateRendererStatus(scene) {
    var motion = scene.cycleComplete ? 'complete' : (scene.motionPaused ? 'paused' : 'active');
    rendererStatus.textContent = 'Ready · ' + rendererName() + ' renderer · ' +
      scene.contourRingCount + ' bundled contour rings · phase ' +
      (scene.phaseIndex + 1) + '/' + Model.voyagePhases.length + ' · ' + motion;
  }

  function resetVoyageCycle(scene) {
    scene.phaseIndex = 0;
    scene.phaseElapsed = 0;
    scene.cycleComplete = false;
    scene.motionPaused = false;
    scene.renderedPhaseId = '';
    updatePhaseUi(scene, true);
    updateVesselMotion(scene, 0);
    updateMotionControl();
    updateRendererStatus(scene);
  }

  function advanceVoyagePhase(scene) {
    if (scene.cycleComplete) {
      resetVoyageCycle(scene);
      return;
    }
    if (scene.phaseIndex === Model.voyagePhases.length - 1) {
      scene.phaseElapsed = Model.voyagePhases[scene.phaseIndex].durationMs;
      scene.cycleComplete = true;
      scene.motionPaused = true;
    } else {
      scene.phaseIndex++;
      scene.phaseElapsed = 0;
      scene.renderedPhaseId = '';
    }
    updatePhaseUi(scene, true);
    updateVesselMotion(scene, 0);
    updateMotionControl();
    updateRendererStatus(scene);
  }

  function updateVesselMotion(scene, delta) {
    if (!scene.vesselMarker) return;
    if (!scene.motionPaused && !scene.cycleComplete) {
      scene.phaseElapsed += delta;
      var current = Model.voyagePhases[scene.phaseIndex];
      while (scene.phaseElapsed >= current.durationMs && !scene.cycleComplete) {
        scene.phaseElapsed -= current.durationMs;
        if (scene.phaseIndex === Model.voyagePhases.length - 1) {
          scene.phaseElapsed = current.durationMs;
          scene.cycleComplete = true;
          scene.motionPaused = true;
        } else {
          scene.phaseIndex++;
          current = Model.voyagePhases[scene.phaseIndex];
          updatePhaseUi(scene, true);
          updateMotionControl();
          updateRendererStatus(scene);
        }
      }
    }

    var phase = Model.voyagePhases[scene.phaseIndex];
    var progress = Math.min(1, scene.phaseElapsed / phase.durationMs);
    var position = phasePosition(phase, progress);
    scene.vesselMarker.setPosition(position.x, position.y);
    if (phase.path) scene.vesselMarker.hullIcon.setRotation(position.heading);
    phaseRemaining.textContent = scene.cycleComplete ? 'DONE' :
      formatRemaining(phase.durationMs - scene.phaseElapsed);
    updatePhaseUi(scene, false);
    if (scene.cycleComplete) {
      updateMotionControl();
      updateRendererStatus(scene);
    }
  }

  function updateMotionControl() {
    if (!sceneRef) return;
    var paused = sceneRef.motionPaused;
    if (sceneRef.cycleComplete) {
      motionButton.setAttribute('aria-pressed', 'false');
      motionButton.setAttribute('aria-label', 'Replay voyage cycle');
      motionButton.querySelector('.motion-icon').textContent = '↻';
      motionButton.querySelector('.motion-label').textContent = 'Replay cycle';
      return;
    }
    motionButton.setAttribute('aria-pressed', String(paused));
    motionButton.setAttribute('aria-label', paused ? 'Resume voyage cycle' : 'Pause voyage cycle');
    motionButton.querySelector('.motion-icon').textContent = paused ? '▶' : 'Ⅱ';
    motionButton.querySelector('.motion-label').textContent = paused ? 'Resume cycle' : 'Pause cycle';
  }

  function setupInteraction(scene) {
    var camera = scene.cameras.main;
    var drag = null;
    camera.setBounds(0, 0, Core.WORLD_WIDTH, Core.WORLD_HEIGHT);
    setInitialView(camera);

    scene.input.on('pointerdown', function (pointer) {
      drag = {
        x: pointer.x,
        y: pointer.y,
        scrollX: camera.scrollX,
        scrollY: camera.scrollY
      };
    });
    scene.input.on('pointermove', function (pointer) {
      if (!drag || !pointer.isDown) return;
      camera.scrollX = drag.scrollX + (drag.x - pointer.x) / camera.zoom;
      camera.scrollY = drag.scrollY + (drag.y - pointer.y) / camera.zoom;
    });
    scene.input.on('pointerup', function () { drag = null; });
    scene.input.on('pointerupoutside', function () { drag = null; });
    scene.input.on('wheel', function (pointer, over, deltaX, deltaY) {
      zoomAt(camera, pointer.x, pointer.y, camera.zoom - deltaY * 0.0018);
    });
  }

  function StrategyMapScene() {
    PhaserRef.Scene.call(this, { key: 'StrategyMap' });
  }
  StrategyMapScene.prototype = Object.create(PhaserRef.Scene.prototype);
  StrategyMapScene.prototype.constructor = StrategyMapScene;
  StrategyMapScene.prototype.create = function () {
    sceneRef = this;
    var rings = Core.landRings(contours);
    this.mapMarkers = [];
    this.phaseIndex = 0;
    this.phaseElapsed = 0;
    this.cycleComplete = false;
    this.contourRingCount = rings.length;
    this.motionPaused = window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.cameras.main.setBackgroundColor('#09232c');
    drawGrid(this);
    drawLand(this, rings);
    Object.keys(Model.routes).forEach(function (routeKey) {
      var route = Model.routes[routeKey];
      var projected = Core.sampleNavigationPath(route.path, 12).map(function (point) {
        return Core.project([point.lon, point.lat]);
      });
      drawDashedRoute(this, projected, route.kind === 'ballast' ? 0xf2b84b : 0x64e2d2);
    }, this);
    Model.ports.forEach(function (port) {
      this.mapMarkers.push(addPort(this, port));
    }, this);
    this.vesselMarker = addVessel(this);
    this.mapMarkers.push(this.vesselMarker);
    setupInteraction(this);
    updatePhaseUi(this, true);
    updateVesselMotion(this, 0);
    updateMotionControl();
    updateRendererStatus(this);
    readyResolve(true);
  };
  StrategyMapScene.prototype.update = function (time, delta) {
    updateVesselMotion(this, delta);
  };

  function snapshot() {
    var camera = sceneRef && sceneRef.cameras.main;
    var phase = sceneRef ? Model.voyagePhases[sceneRef.phaseIndex] : null;
    return {
      ready: !!sceneRef,
      renderer: rendererName(),
      phaserVersion: PhaserRef && PhaserRef.VERSION,
      contourRings: Core && contours ? Core.landRings(contours).length : 0,
      ports: Model ? Model.ports.length : 0,
      vessels: Model && Model.vessel ? 1 : 0,
      loadState: phase ? phase.state : '',
      loadDetail: phase ? phase.detail : '',
      phaseId: phase ? phase.id : '',
      phaseIndex: sceneRef ? sceneRef.phaseIndex : -1,
      cycleComplete: sceneRef ? sceneRef.cycleComplete : false,
      routePoints: Model ? Object.keys(Model.routes).reduce(function (total, key) {
        return total + Model.routes[key].path.length;
      }, 0) : 0,
      zoom: camera ? camera.zoom : 0,
      scrollX: camera ? camera.scrollX : 0,
      scrollY: camera ? camera.scrollY : 0
    };
  }

  function bindControls() {
    document.getElementById('zoom-in').addEventListener('click', function () {
      if (!sceneRef) return;
      var camera = sceneRef.cameras.main;
      zoomAt(camera, camera.width / 2, camera.height / 2, camera.zoom * 1.18);
    });
    document.getElementById('zoom-out').addEventListener('click', function () {
      if (!sceneRef) return;
      var camera = sceneRef.cameras.main;
      zoomAt(camera, camera.width / 2, camera.height / 2, camera.zoom / 1.18);
    });
    document.getElementById('reset-view').addEventListener('click', function () {
      if (sceneRef) setInitialView(sceneRef.cameras.main);
    });
    motionButton.addEventListener('click', function () {
      if (!sceneRef) return;
      if (sceneRef.cycleComplete) {
        resetVoyageCycle(sceneRef);
        return;
      }
      sceneRef.motionPaused = !sceneRef.motionPaused;
      updateMotionControl();
      updateRendererStatus(sceneRef);
    });
    document.getElementById('next-phase').addEventListener('click', function () {
      if (sceneRef) advanceVoyagePhase(sceneRef);
    });
  }

  try {
    ensureRuntime();
    bindControls();
    game = new PhaserRef.Game({
      type: PhaserRef.CANVAS,
      parent: stage,
      width: Math.max(640, stage.clientWidth),
      height: Math.max(560, stage.clientHeight),
      backgroundColor: '#09232c',
      transparent: false,
      render: {
        antialias: true,
        pixelArt: false,
        roundPixels: false
      },
      scale: {
        mode: PhaserRef.Scale.RESIZE,
        autoCenter: PhaserRef.Scale.CENTER_BOTH
      },
      scene: StrategyMapScene
    });
  } catch (error) {
    rendererStatus.textContent = 'Renderer failed: ' + error.message;
    throw error;
  }

  window.__PHASER_SPIKE_TEST__ = {
    ready: ready,
    snapshot: snapshot,
    reset: function () {
      if (sceneRef) setInitialView(sceneRef.cameras.main);
      return snapshot();
    }
  };
})();
