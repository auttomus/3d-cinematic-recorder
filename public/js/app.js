// Studio entry point: scene bootstrap, engine, models, loop.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import { CinematicDirectorEngine } from "../cinematic-engine.js";
import { collectElements, formatTime } from "./utils.js";
import { initUI } from "./ui.js";
import { initModels } from "./models.js";

// 1. Setup Three.js Scene, Camera, Renderer
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0e1726);
scene.fog = new THREE.FogExp2(0x0e1726, 0.0006);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.5, 5000);
camera.position.set(120, 80, 180);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: false,
  powerPreference: 'high-performance',
  precision: 'highp'
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setClearColor(0x0e1726, 1.0);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
container.appendChild(renderer.domElement);

// Studio Clean Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
scene.add(ambientLight);

const hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0x334155, 1.1);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(0xfffaed, 1.3);
sunLight.position.set(150, 300, 150);
scene.add(sunLight);

const fillLight = new THREE.DirectionalLight(0xcfd8dc, 0.6);
fillLight.position.set(-150, 150, -150);
scene.add(fillLight);

// Grid Floor
const grid = new THREE.GridHelper(1200, 120, 0x475569, 0x1e293b);
grid.position.y = -0.5;
scene.add(grid);

// Controls
const orbitControls = new OrbitControls(camera, renderer.domElement);
orbitControls.enableDamping = true;
orbitControls.dampingFactor = 0.05;
orbitControls.maxPolarAngle = Math.PI / 2 + 0.05;

const fpsControls = new PointerLockControls(camera, document.body);

// Movement state for Free Move (WASD)
const move = { forward: false, backward: false, left: false, right: false, up: false, down: false };
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();

document.addEventListener('keydown', (e) => {
  if (!S.isFreeMove) return;
  switch (e.code) {
    case 'KeyW': move.forward = true; break;
    case 'KeyS': move.backward = true; break;
    case 'KeyA': move.left = true; break;
    case 'KeyD': move.right = true; break;
    case 'Space':
    case 'KeyE': move.up = true; break;
    case 'ShiftLeft':
    case 'ShiftRight':
    case 'KeyQ':
    case 'KeyC': move.down = true; break;
  }
});

document.addEventListener('keyup', (e) => {
  switch (e.code) {
    case 'KeyW': move.forward = false; break;
    case 'KeyS': move.backward = false; break;
    case 'KeyA': move.left = false; break;
    case 'KeyD': move.right = false; break;
    case 'Space':
    case 'KeyE': move.up = false; break;
    case 'ShiftLeft':
    case 'ShiftRight':
    case 'KeyQ':
    case 'KeyC': move.down = false; break;
  }
});
const S = {
  THREE,
  scene,
  camera,
  renderer,
  orbitControls,
  fpsControls,
  grid,
  el: collectElements(),
  engine: null,
  curveEditor: null,
  model: null,
  isFreeMove: false,
};

initUI(S);

S.engine = new CinematicDirectorEngine({
  scene: S.scene,
  camera: S.camera,
  renderer: S.renderer,
  orbitControls: S.orbitControls,
  fpsControls: S.fpsControls,
  gridHelper: S.grid,
  onStateChange: (eventName, data) => {
    if (
      eventName === "nodes-updated" ||
      eventName === "node-selected" ||
      eventName === "node-modified" ||
      eventName === "loop-changed"
    ) {
      S.renderNodesList();
      S.syncInspectorWithSelectedNode();
      S.renderTimelineSegments();
      S.updateLoopButtonUI();
    }
    if (eventName === "project-loaded") {
      S.syncUIFromEngineState();
    }
    if (eventName === "playback-changed") {
      S.el.tBtnPlay.innerHTML = data.isPlaying ? "Pause" : "Play";
      S.el.tBtnPlay.classList.toggle("playing", data.isPlaying);
    }
    if (eventName === "view-mode-changed") {
      S.updateModeButtonsUI(data.mode);
    }
  },
  onTimelineUpdate: (evalResult) => {
    if (!evalResult) return;
    const total = evalResult.totalDuration || 1;
    const current = evalResult.time || 0;
    const percent = (current / total) * 100;
    S.el.playheadNeedle.style.left = `${percent}%`;

    S.el.tcCurrent.innerText = formatTime(current);
    S.el.tcTotal.innerText = formatTime(total);

    if (S.engine.nodes[evalResult.segmentIndex]) {
      S.el.activeSpotBadge.innerText = `Spot: ${S.engine.nodes[evalResult.segmentIndex].name}`;
    }

    if (evalResult.segmentIndex === S.engine.selectedIndex) {
      S.curveEditor.setPreviewProgress(evalResult.segmentProgress);
    }
  },
});

initModels(S);

// Engine state + UI
S.engine.init();
S.syncUIFromEngineState();
window.cinematicEngine = S.engine;

// Startup model: ?model=<url-or-path> override, else procedural demo scene.
const modelParam = new URLSearchParams(location.search).get("model");
if (modelParam) S.model.load(modelParam);
else {
  S.el.modelSelect.value = "";
  S.model.loadDemo();
}

// Headless Puppeteer Scripted Tour API
window.startScriptedTour = (wps, totalSec) => {
  S.engine.setNodes(wps);
  S.engine.setViewMode('lens-view');
  S.engine.pause();
};

window.setTourProgress = (progress) => {
  const total = S.engine.getTotalDuration();
  S.engine.seek(progress * total);
  S.renderer.render(S.scene, S.camera);
};
// Keyboard Shortcuts
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;

  // Di mode Free Fly (FPS), Spasi digunakan untuk terbang naik (bukan play/pause timeline)
  if (S.isFreeMove && S.fpsControls.isLocked) {
    if (e.code === 'Space') {
      e.preventDefault();
    }
    return;
  }

  if (e.code === 'Space') {
    e.preventDefault();
    S.el.tBtnPlay.click();
  } else if (e.code === 'Digit1') {
    S.el.btnModeOrbit.click();
  } else if (e.code === 'Digit2') {
    S.el.btnModeFps.click();
  } else if (e.code === 'Digit3') {
    S.el.btnModeLens.click();
  } else if (e.code === 'KeyK') {
    S.el.btnAddNode.click();
  } else if (e.code === 'KeyH') {
    S.togglePanels();
  } else if (e.code === 'KeyL') {
    S.el.tBtnLoop.click();
  } else if (e.code === 'Delete') {
    S.engine.deleteNode();
  }
});
// Main Render Loop
let prevTime = performance.now();
let frameCount = 0;
let lastFpsUpdate = prevTime;

function animate() {
  requestAnimationFrame(animate);
  const time = performance.now();
  const delta = (time - prevTime) / 1000;
  prevTime = time;

  S.model.update(delta);

  // Update Cinematic Engine
  if (S.engine) S.engine.update(delta);

  // Free Move Physics
  if (S.isFreeMove && S.fpsControls.isLocked) {
    velocity.x -= velocity.x * 8.0 * delta;
    velocity.z -= velocity.z * 8.0 * delta;
    velocity.y -= velocity.y * 8.0 * delta;

    direction.z = Number(move.forward) - Number(move.backward);
    direction.x = Number(move.right) - Number(move.left);
    direction.y = Number(move.up) - Number(move.down);
    direction.normalize();

    const speed = 120.0;
    if (move.forward || move.backward) velocity.z -= direction.z * speed * delta;
    if (move.left || move.right) velocity.x -= direction.x * speed * delta;
    if (move.up || move.down) velocity.y += direction.y * speed * delta;

    S.fpsControls.moveRight(-velocity.x * delta);
    S.fpsControls.moveForward(-velocity.z * delta);
    S.camera.position.y += velocity.y * delta;
  } else if (S.engine.viewMode === 'director-orbit') {
    S.orbitControls.update();
  }

  if (S.engine) {
    S.engine.renderScene();
  } else {
    S.renderer.render(S.scene, S.camera);
  }

  // Stats update
  frameCount++;
  if (time - lastFpsUpdate > 500) {
    const fps = Math.round((frameCount * 1000) / (time - lastFpsUpdate));
    const drawCalls = S.renderer.info.render.calls;
    const triangles = (S.renderer.info.render.triangles / 1000).toFixed(0);
    S.el.statsBox.innerText = `FPS: ${fps} | Tris: ${triangles}K | Calls: ${drawCalls}`;
    frameCount = 0;
    lastFpsUpdate = time;
  }
}

animate();
window.addEventListener('resize', () => {
  S.camera.aspect = window.innerWidth / window.innerHeight;
  S.camera.updateProjectionMatrix();
  S.renderer.setSize(window.innerWidth, window.innerHeight);
  if (S.engine && S.engine.composer) {
    S.engine.composer.setSize(window.innerWidth, window.innerHeight);
  }
  if (S.curveEditor) S.curveEditor.resize();
});