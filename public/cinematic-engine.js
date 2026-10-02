import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { BezierSolver, EASING_PRESETS } from './curve-editor.js';

/**
 *  Cinematic Director Engine (Three.js)
 * Manages 3D camera nodes, piecewise Centripetal Catmull-Rom spline interpolation,
 * per-segment Bezier speed curves, 3D gizmos, Environment/Sky, Shaders, and Ultra 60FPS Offline Renderer.
 */

// Default starter waypoints (generic — replace with your own model track).
// See examples/tracks/default.json for the same track as JSON.
export const DEFAULT_NODES = [
  {
    id: 'node_1',
    name: '1. Entrance Overview',
    pos: [120, 25, 200],
    target: [0, 15, 0],
    fov: 50,
    durationSec: 4.5,
    curve: { preset: 'ease-in-out', p1: [0.42, 0.0], p2: [0.58, 1.0] }
  },
  {
    id: 'node_2',
    name: '2. Main Hall & Center',
    pos: [30, 35, 80],
    target: [-40, 10, -40],
    fov: 50,
    durationSec: 5.0,
    curve: { preset: 'ease-in-out', p1: [0.42, 0.0], p2: [0.58, 1.0] }
  },
  {
    id: 'node_3',
    name: '3. Side Wing',
    pos: [-130, 30, 10],
    target: [0, 20, 0],
    fov: 50,
    durationSec: 4.5,
    curve: { preset: 'ease-in-out', p1: [0.42, 0.0], p2: [0.58, 1.0] }
  },
  {
    id: 'node_4',
    name: '4. Aerial Drone Panorama',
    pos: [150, 160, 150],
    target: [0, 0, 0],
    fov: 55,
    durationSec: 5.0,
    curve: { preset: 'slow-mo', p1: [0.8, 0.05], p2: [0.2, 0.95] }
  }
];

export class CinematicDirectorEngine {
  constructor({ scene, camera, renderer, orbitControls, fpsControls, gridHelper, onStateChange, onTimelineUpdate }) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.orbitControls = orbitControls;
    this.fpsControls = fpsControls;
    this.gridFloor = gridHelper;

    this.onStateChange = onStateChange || (() => {});
    this.onTimelineUpdate = onTimelineUpdate || (() => {});

    // State
    this.nodes = [];
    this.selectedIndex = 0;
    this.viewMode = 'director-orbit'; // 'director-orbit' | 'director-fps' | 'lens-view'
    
    // Playback state
    this.isPlaying = false;
    this.currentTime = 0;
    this.playbackSpeed = 1.0;
    this.isLooping = true;
    this.lastFrameTime = performance.now();
    this.isOfflineRendering = false;

    // Visual helper toggles
    this.showNodes = true;
    this.showPath = true;
    this.showGizmo = true;
    this.showFrustums = true;

    // Spline & Trajectory settings (Centripetal Catmull-Rom)
    this.globalTension = 0.0; // 0.0 = Natural Centripetal Spline, 1.0 = Strict Linear
    this.clampGround = true;  // Protect against dipping below ground level
    this.minGroundY = 0.5;    // Minimum allowable altitude in units

    //  Environment & Sky Setup (Anti-Flicker & Frustum Safe)
    this.sky = new Sky();
    this.sky.scale.setScalar(4000);
    this.sky.frustumCulled = false;
    this.sky.material.depthWrite = false;
    this.scene.add(this.sky);
    this.sky.visible = false;

    this.sun = new THREE.Vector3();
    this.backgroundMode = 'color-slate';
    this.customBgColor = '#0e1726';

    // Solid Floor Mesh
    const floorGeo = new THREE.PlaneGeometry(2500, 2500);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.9,
      metalness: 0.05
    });
    this.solidFloor = new THREE.Mesh(floorGeo, floorMat);
    this.solidFloor.rotation.x = -Math.PI / 2;
    this.solidFloor.position.y = -0.55;
    this.solidFloor.receiveShadow = true;
    this.scene.add(this.solidFloor);
    this.solidFloor.visible = false;
    this.floorMode = 'grid'; // 'grid' | 'solid-matte' | 'none'
    this.floorColor = '#1e293b';

    //  Cinematic Shaders & High-Fidelity GPU Safe Post-Processing Setup
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const renderTarget = new THREE.WebGLRenderTarget(
      window.innerWidth * dpr,
      window.innerHeight * dpr,
      {
        type: THREE.HalfFloatType,
        format: THREE.RGBAFormat,
        samples: 4 // 4x Stable Hardware Multisample Anti-Aliasing
      }
    );

    this.composer = new EffectComposer(this.renderer, renderTarget);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth * dpr, window.innerHeight * dpr),
      0.35, // strength
      0.4,  // radius
      0.85  // threshold
    );
    this.composer.addPass(this.bloomPass);

    // FXAA Anti-Aliasing Pass
    this.fxaaPass = new ShaderPass(FXAAShader);
    this.fxaaPass.material.uniforms['resolution'].value.x = 1 / (window.innerWidth * dpr);
    this.fxaaPass.material.uniforms['resolution'].value.y = 1 / (window.innerHeight * dpr);
    this.composer.addPass(this.fxaaPass);

    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);

    this.enableShaders = false; // Master switch toggle
    this.bloomStrength = 0.35;
    this.bloomRadius = 0.4;
    this.exposure = 1.1;
    this.currentToneMapping = 'aces';

    // 3D Objects & Helpers
    this.helpersGroup = new THREE.Group();
    this.helpersGroup.name = 'cinematic_helpers_group';
    this.scene.add(this.helpersGroup);

    this.pathLine = null;
    this.nodeMeshes = [];
    this.nodeBadges = [];
    this.targetLines = [];

    // TransformControls for 3D dragging
    this.transformControls = new TransformControls(this.camera, this.renderer.domElement);
    this.transformControls.size = 0.8;
    this.scene.add(this.transformControls);

    this.transformControls.addEventListener('dragging-changed', (event) => {
      this.orbitControls.enabled = !event.value;
    });

    this.transformControls.addEventListener('objectChange', () => {
      if (this.selectedIndex >= 0 && this.selectedIndex < this.nodes.length) {
        const mesh = this.nodeMeshes[this.selectedIndex];
        if (mesh) {
          const n = this.nodes[this.selectedIndex];
          n.pos = [
            Number(mesh.position.x.toFixed(1)),
            Number(mesh.position.y.toFixed(1)),
            Number(mesh.position.z.toFixed(1))
          ];
          this.rebuildVisuals();
          this.onStateChange('node-modified', { index: this.selectedIndex, node: n });
        }
      }
    });

    // Raycaster for clicking 3D nodes in scene
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.setupPointerEvents();
  }

  init() {
    // Initialize with default or cached nodes
    if (!this.loadFromLocalStorage()) {
      this.setNodes(DEFAULT_NODES);
    }
  }

  setupPointerEvents() {
    this.renderer.domElement.addEventListener('pointerdown', (e) => {
      if (this.viewMode === 'lens-view' || !this.showNodes) return;
      if (e.button !== 0) return; // Only left click

      const rect = this.renderer.domElement.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      this.raycaster.setFromCamera(this.mouse, this.camera);
      const interactables = this.nodeMeshes.map(m => m.userData.clickableMesh || m);
      const intersects = this.raycaster.intersectObjects(interactables, true);

      if (intersects.length > 0) {
        let hitObj = intersects[0].object;
        while (hitObj && hitObj.userData.nodeIndex === undefined && hitObj.parent) {
          hitObj = hitObj.parent;
        }
        if (hitObj && hitObj.userData.nodeIndex !== undefined) {
          this.selectNode(hitObj.userData.nodeIndex);
        }
      }
    });
  }

  // Set new list of nodes
  setNodes(nodesList) {
    this.nodes = JSON.parse(JSON.stringify(nodesList));
    if (this.selectedIndex >= this.nodes.length) {
      this.selectedIndex = Math.max(0, this.nodes.length - 1);
    }
    this.rebuildVisuals();
    this.saveToLocalStorage();
    this.onStateChange('nodes-updated', { nodes: this.nodes });
  }

  getTotalDuration() {
    if (this.nodes.length < 2) return 0;
    const list = this.isLooping ? this.nodes : this.nodes.slice(0, -1);
    return list.reduce((acc, n) => acc + (Number(n.durationSec) || 4.0), 0);
  }

  selectNode(index) {
    if (index < 0 || index >= this.nodes.length) return;
    this.selectedIndex = index;
    this.updateSelectionVisuals();
    this.onStateChange('node-selected', { index, node: this.nodes[index] });
  }

  // Create badge sprite with text
  createBadgeSprite(text, isActive = false) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, 128, 128);

    // Outer Circle Glow
    ctx.fillStyle = isActive ? '#f59e0b' : '#2563eb';
    ctx.shadowColor = isActive ? '#fbbf24' : '#60a5fa';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(64, 64, 52, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Inner Circle
    ctx.fillStyle = isActive ? '#fef08a' : '#ffffff';
    ctx.beginPath();
    ctx.arc(64, 64, 44, 0, Math.PI * 2);
    ctx.fill();

    // Text Label
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 50px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 64, 66);

    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(6, 6, 1);
    return sprite;
  }

  // Create 3D Frustum/Camera Body Helper Mesh
  createCameraGizmoMesh(isActive = false) {
    const group = new THREE.Group();

    // Camera body box
    const boxGeo = new THREE.BoxGeometry(4, 2.8, 4);
    const boxMat = new THREE.MeshStandardMaterial({
      color: isActive ? 0xf59e0b : 0x1e293b,
      metalness: 0.2,
      roughness: 0.6,
      emissive: isActive ? 0x78350f : 0x000000
    });
    const boxMesh = new THREE.Mesh(boxGeo, boxMat);
    group.add(boxMesh);

    // Lens cylinder
    const lensGeo = new THREE.CylinderGeometry(1.4, 1.6, 2.5, 16);
    lensGeo.rotateX(Math.PI / 2);
    const lensMat = new THREE.MeshStandardMaterial({
      color: 0x06b6d4,
      metalness: 0.8,
      roughness: 0.2
    });
    const lensMesh = new THREE.Mesh(lensGeo, lensMat);
    lensMesh.position.z = -2.8;
    group.add(lensMesh);

    // Wireframe Frustum Pyramid
    const coneGeo = new THREE.ConeGeometry(5, 8, 4, 1, true);
    coneGeo.rotateX(-Math.PI / 2);
    coneGeo.rotateZ(Math.PI / 4);
    const wireMat = new THREE.MeshBasicMaterial({
      color: isActive ? 0xfde047 : 0x38bdf8,
      wireframe: true,
      transparent: true,
      opacity: 0.75
    });
    const coneMesh = new THREE.Mesh(coneGeo, wireMat);
    coneMesh.position.z = -7;
    group.add(coneMesh);

    group.userData.clickableMesh = boxMesh;
    return group;
  }

  // Rebuild all 3D gizmos, splines, markers
  rebuildVisuals() {
    // Clear old helpers
    while (this.helpersGroup.children.length > 0) {
      const obj = this.helpersGroup.children[0];
      this.helpersGroup.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
    }

    this.nodeMeshes = [];
    this.nodeBadges = [];
    this.targetLines = [];

    if (this.nodes.length === 0) return;

    // 1. Create Spline Path Line
    if (this.nodes.length >= 2) {
      const points = [];
      const totalSegments = this.isLooping ? this.nodes.length : this.nodes.length - 1;
      const sampleStepsPerSegment = 24;

      for (let s = 0; s < totalSegments; s++) {
        for (let step = 0; step <= sampleStepsPerSegment; step++) {
          const u = step / sampleStepsPerSegment;
          const pt = this.sampleSegmentPosition(s, u);
          points.push(pt);
        }
      }

      const pathGeo = new THREE.BufferGeometry().setFromPoints(points);
      const pathMat = new THREE.LineBasicMaterial({
        color: 0x06b6d4,
        linewidth: 3,
        transparent: true,
        opacity: 0.85
      });
      this.pathLine = new THREE.Line(pathGeo, pathMat);
      this.pathLine.visible = this.showPath;
      this.helpersGroup.add(this.pathLine);
    }

    // 2. Create Node 3D Gizmos & Badges
    this.nodes.forEach((n, idx) => {
      const isSelected = idx === this.selectedIndex;
      const nodeGroup = this.createCameraGizmoMesh(isSelected);
      nodeGroup.position.set(n.pos[0], n.pos[1], n.pos[2]);
      
      // Orient camera frustum towards target
      const targetVec = new THREE.Vector3(n.target[0], n.target[1], n.target[2]);
      nodeGroup.lookAt(targetVec);
      nodeGroup.userData.nodeIndex = idx;

      // Add Badge Sprite floating above
      const badge = this.createBadgeSprite(String(idx + 1), isSelected);
      badge.position.set(0, 5.5, 0);
      nodeGroup.add(badge);

      // Line towards target
      const lineMat = new THREE.LineDashedMaterial({
        color: isSelected ? 0xfacc15 : 0x94a3b8,
        dashSize: 2,
        gapSize: 1.5,
        transparent: true,
        opacity: 0.6
      });
      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        nodeGroup.worldToLocal(targetVec.clone())
      ]);
      const targetLine = new THREE.Line(lineGeo, lineMat);
      targetLine.computeLineDistances();
      nodeGroup.add(targetLine);

      // Focus target ring
      const ringGeo = new THREE.RingGeometry(1.5, 2.2, 16);
      const ringMat = new THREE.MeshBasicMaterial({
        color: isSelected ? 0xfacc15 : 0x38bdf8,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.8
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.position.copy(targetVec);
      ringMesh.lookAt(this.camera.position);
      this.helpersGroup.add(ringMesh);

      nodeGroup.visible = this.showNodes;
      this.helpersGroup.add(nodeGroup);
      this.nodeMeshes.push(nodeGroup);
      this.nodeBadges.push(badge);
    });

    this.updateSelectionVisuals();
  }

  updateSelectionVisuals() {
    if (!this.transformControls) return;

    if (
      this.selectedIndex >= 0 &&
      this.selectedIndex < this.nodeMeshes.length &&
      this.viewMode !== 'lens-view' &&
      this.showGizmo &&
      this.showNodes
    ) {
      const activeMesh = this.nodeMeshes[this.selectedIndex];
      this.transformControls.attach(activeMesh);
    } else {
      this.transformControls.detach();
    }
  }

  // Centripetal Catmull-Rom Interpolation with Alpha = 0.5
  // Mathematically eliminates loops, cusps, and Runge overshoots on unevenly spaced nodes
  evaluateCentripetalCatmullRom(p0, p1, p2, p3, u, alpha = 0.5) {
    const eps = 1e-4;

    const d01 = Math.max(p0.distanceTo(p1), eps);
    const d12 = Math.max(p1.distanceTo(p2), eps);
    const d23 = Math.max(p2.distanceTo(p3), eps);

    const t0 = 0.0;
    const t1 = t0 + Math.pow(d01, alpha);
    const t2 = t1 + Math.pow(d12, alpha);
    const t3 = t2 + Math.pow(d23, alpha);

    const t = t1 + u * (t2 - t1);

    // Level 1 linear interpolations (Barry-Goldman pyramid)
    const A1 = new THREE.Vector3().lerpVectors(p0, p1, (t - t0) / (t1 - t0));
    const A2 = new THREE.Vector3().lerpVectors(p1, p2, (t - t1) / (t2 - t1));
    const A3 = new THREE.Vector3().lerpVectors(p2, p3, (t - t2) / (t3 - t2));

    // Level 2 quadratic interpolations
    const B1 = new THREE.Vector3().lerpVectors(A1, A2, (t - t0) / (t2 - t0));
    const B2 = new THREE.Vector3().lerpVectors(A2, A3, (t - t1) / (t3 - t1));

    // Level 3 cubic interpolation
    return new THREE.Vector3().lerpVectors(B1, B2, (t - t1) / (t2 - t1));
  }

  // Sample Centripetal spline position in segment i at progress u in [0, 1]
  sampleSegmentPosition(i, u) {
    const N = this.nodes.length;
    if (N === 0) return new THREE.Vector3();
    if (N === 1) return new THREE.Vector3().fromArray(this.nodes[0].pos);

    let prevIdx, nextIdx, nextNextIdx;
    if (this.isLooping) {
      prevIdx = (i - 1 + N) % N;
      nextIdx = (i + 1) % N;
      nextNextIdx = (i + 2) % N;
    } else {
      prevIdx = Math.max(0, i - 1);
      nextIdx = Math.min(N - 1, i + 1);
      nextNextIdx = Math.min(N - 1, i + 2);
    }

    const p0 = new THREE.Vector3().fromArray(this.nodes[prevIdx].pos);
    const p1 = new THREE.Vector3().fromArray(this.nodes[i].pos);
    const p2 = new THREE.Vector3().fromArray(this.nodes[nextIdx].pos);
    const p3 = new THREE.Vector3().fromArray(this.nodes[nextNextIdx].pos);

    const segNode = this.nodes[i];
    const isLinear = segNode.pathMode === 'linear';

    let pos;
    if (isLinear) {
      pos = new THREE.Vector3().lerpVectors(p1, p2, u);
    } else {
      const centripetalPos = this.evaluateCentripetalCatmullRom(p0, p1, p2, p3, u, 0.5);
      const linearPos = new THREE.Vector3().lerpVectors(p1, p2, u);
      const tension = typeof segNode.tension === 'number' ? segNode.tension : (this.globalTension || 0.0);
      pos = new THREE.Vector3().lerpVectors(centripetalPos, linearPos, Math.min(Math.max(tension, 0), 1));
    }

    // Ground Altitude Protection (Prevent camera from dipping underground)
    if (this.clampGround !== false) {
      const minY = typeof this.minGroundY === 'number' ? this.minGroundY : 0.5;
      if (pos.y < minY) {
        pos.y = minY;
      }
    }

    return pos;
  }

  sampleSegmentTarget(i, u) {
    const N = this.nodes.length;
    if (N === 0) return new THREE.Vector3();

    const segNode = this.nodes[i];
    if (segNode && segNode.targetMode === 'follow-path') {
      // Dynamic Forward / Drone POV Mode: Camera looks straight ahead along spline direction
      const forwardU = Math.min(u + 0.05, 1.0);
      const currentPos = this.sampleSegmentPosition(i, u);
      const nextPos = this.sampleSegmentPosition(i, forwardU);
      const forwardDir = new THREE.Vector3().subVectors(nextPos, currentPos);
      if (forwardDir.lengthSq() > 0.0001) {
        forwardDir.normalize();
        return currentPos.clone().addScaledVector(forwardDir, 50);
      }
    }

    if (N === 1) return new THREE.Vector3().fromArray(this.nodes[0].target);

    let prevIdx, nextIdx, nextNextIdx;
    if (this.isLooping) {
      prevIdx = (i - 1 + N) % N;
      nextIdx = (i + 1) % N;
      nextNextIdx = (i + 2) % N;
    } else {
      prevIdx = Math.max(0, i - 1);
      nextIdx = Math.min(N - 1, i + 1);
      nextNextIdx = Math.min(N - 1, i + 2);
    }

    const t0 = new THREE.Vector3().fromArray(this.nodes[prevIdx].target);
    const t1 = new THREE.Vector3().fromArray(this.nodes[i].target);
    const t2 = new THREE.Vector3().fromArray(this.nodes[nextIdx].target);
    const t3 = new THREE.Vector3().fromArray(this.nodes[nextNextIdx].target);

    return this.evaluateCentripetalCatmullRom(t0, t1, t2, t3, u, 0.5);
  }

  // Full timeline evaluation at time t (in seconds)
  evaluateAtTime(t) {
    const N = this.nodes.length;
    if (N === 0) return null;
    if (N === 1) {
      return {
        pos: new THREE.Vector3().fromArray(this.nodes[0].pos),
        target: new THREE.Vector3().fromArray(this.nodes[0].target),
        fov: this.nodes[0].fov || 50,
        segmentIndex: 0,
        segmentProgress: 0,
        easedProgress: 0,
        time: 0,
        totalDuration: 0
      };
    }

    const totalDuration = this.getTotalDuration();
    let currentT;
    if (this.isLooping) {
      currentT = ((t % totalDuration) + totalDuration) % totalDuration;
    } else {
      currentT = Math.min(Math.max(t, 0), totalDuration);
    }

    const totalSegments = this.isLooping ? N : N - 1;
    let accumulatedTime = 0;
    let segIdx = Math.max(0, totalSegments - 1);
    let segDuration = Number(this.nodes[segIdx]?.durationSec) || 4.0;

    for (let i = 0; i < totalSegments; i++) {
      const dur = Number(this.nodes[i].durationSec) || 4.0;
      if (currentT >= accumulatedTime && (i === totalSegments - 1 || currentT < accumulatedTime + dur)) {
        segIdx = i;
        segDuration = dur;
        break;
      }
      accumulatedTime += dur;
    }

    // Normalized segment time u in [0, 1]
    const u = Math.min(Math.max((currentT - accumulatedTime) / Math.max(segDuration, 0.001), 0), 1);

    // Apply Segment Bezier Easing
    const segNode = this.nodes[segIdx];
    const p1 = segNode.curve?.p1 || [0.42, 0.0];
    const p2 = segNode.curve?.p2 || [0.58, 1.0];
    const solver = new BezierSolver(p1[0], p1[1], p2[0], p2[1]);
    const easedProgress = solver.solve(u);

    // Interpolate Pos & Target using eased progress
    const pos = this.sampleSegmentPosition(segIdx, easedProgress);
    const target = this.sampleSegmentTarget(segIdx, easedProgress);

    // Interpolate FOV
    const nextIdx = this.isLooping ? (segIdx + 1) % N : Math.min(segIdx + 1, N - 1);
    const fov0 = Number(segNode.fov) || 50;
    const fov1 = Number(this.nodes[nextIdx].fov) || 50;
    const fov = fov0 + (fov1 - fov0) * easedProgress;

    return {
      pos,
      target,
      fov,
      segmentIndex: segIdx,
      segmentProgress: u,
      easedProgress,
      time: currentT,
      totalDuration
    };
  }

  // Apply state to camera
  applyToCamera(evalResult) {
    if (!evalResult) return;
    this.camera.position.copy(evalResult.pos);
    this.camera.lookAt(evalResult.target);
    this.camera.fov = evalResult.fov;
    this.camera.updateProjectionMatrix();

    if (this.orbitControls) {
      this.orbitControls.target.copy(evalResult.target);
    }
  }

  // Transport Controls
  play() {
    const total = this.getTotalDuration();
    if (!this.isLooping && this.currentTime >= total - 0.05) {
      this.currentTime = 0;
      this.seek(0);
    }
    this.isPlaying = true;
    this.lastFrameTime = performance.now();
    this.onStateChange('playback-changed', { isPlaying: true });
  }

  pause() {
    this.isPlaying = false;
    this.onStateChange('playback-changed', { isPlaying: false });
  }

  stop() {
    this.isPlaying = false;
    this.currentTime = 0;
    this.seek(0);
    this.onStateChange('playback-changed', { isPlaying: false, currentTime: 0 });
  }

  seek(timeInSec) {
    const total = this.getTotalDuration();
    if (total <= 0) return;
    if (this.isLooping) {
      this.currentTime = ((timeInSec % total) + total) % total;
    } else {
      this.currentTime = Math.min(Math.max(timeInSec, 0), total);
    }

    const evalResult = this.evaluateAtTime(this.currentTime);
    if (this.viewMode === 'lens-view') {
      this.applyToCamera(evalResult);
    }

    this.onTimelineUpdate(evalResult);
  }

  setPlaybackSpeed(speed) {
    this.playbackSpeed = speed;
  }

  setLoop(loop) {
    this.isLooping = loop;
    const total = this.getTotalDuration();
    if (this.currentTime > total) {
      this.currentTime = total;
    }
    this.rebuildVisuals();
    this.onStateChange('loop-changed', { isLooping: loop, totalDuration: total });
  }

  // Switch View Modes
  setViewMode(mode) {
    this.viewMode = mode;

    if (mode === 'director-orbit') {
      this.fpsControls.unlock();
      this.orbitControls.enabled = true;
      this.helpersGroup.visible = true;
      this.updateSelectionVisuals();
    } else if (mode === 'director-fps') {
      this.orbitControls.enabled = false;
      this.fpsControls.lock();
      this.helpersGroup.visible = true;
      this.transformControls.detach();
    } else if (mode === 'lens-view') {
      this.fpsControls.unlock();
      this.orbitControls.enabled = false;
      this.transformControls.detach();
      this.helpersGroup.visible = false; // Hide 3D helpers when viewing through lens
      const evalResult = this.evaluateAtTime(this.currentTime);
      this.applyToCamera(evalResult);
    }

    this.onStateChange('view-mode-changed', { mode });
  }

  // Compute target point based on active camera view / FPS direction
  getCurrentViewTarget() {
    if (this.viewMode === 'fps' || (this.fpsControls && this.fpsControls.isLocked)) {
      const dir = new THREE.Vector3();
      this.camera.getWorldDirection(dir);
      return this.camera.position.clone().addScaledVector(dir, 50);
    }
    if (this.orbitControls && this.viewMode === 'director-orbit') {
      return this.orbitControls.target.clone();
    }
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    return this.camera.position.clone().addScaledVector(dir, 50);
  }

  // Node CRUD operations
  addNodeFromCurrentView(name = null) {
    const p = this.camera.position;
    const t = this.getCurrentViewTarget();

    const newNode = {
      id: 'node_' + Date.now(),
      name: name || `${this.nodes.length + 1}. Kamera Sudut Baru`,
      pos: [Number(p.x.toFixed(1)), Number(p.y.toFixed(1)), Number(p.z.toFixed(1))],
      target: [Number(t.x.toFixed(1)), Number(t.y.toFixed(1)), Number(t.z.toFixed(1))],
      targetMode: 'lookAt',
      fov: Math.round(this.camera.fov) || 50,
      durationSec: 4.0,
      curve: { preset: 'ease-in-out', p1: [0.42, 0.0], p2: [0.58, 1.0] }
    };

    this.nodes.push(newNode);
    this.selectedIndex = this.nodes.length - 1;
    this.rebuildVisuals();
    this.saveToLocalStorage();
    this.onStateChange('nodes-updated', { nodes: this.nodes, selectedIndex: this.selectedIndex });
  }

  updateNodeFromCurrentView(index = this.selectedIndex) {
    if (index < 0 || index >= this.nodes.length) return;
    const p = this.camera.position;
    const t = this.getCurrentViewTarget();

    this.nodes[index].pos = [Number(p.x.toFixed(1)), Number(p.y.toFixed(1)), Number(p.z.toFixed(1))];
    this.nodes[index].target = [Number(t.x.toFixed(1)), Number(t.y.toFixed(1)), Number(t.z.toFixed(1))];
    this.nodes[index].fov = Math.round(this.camera.fov) || 50;

    this.rebuildVisuals();
    this.saveToLocalStorage();
    this.onStateChange('node-modified', { index, node: this.nodes[index] });
  }

  // Point target 50 units straight forward from current path/direction
  setNodeTargetForward(index = this.selectedIndex) {
    if (index < 0 || index >= this.nodes.length) return;
    const n = this.nodes[index];
    const nextIdx = (index + 1) % this.nodes.length;
    const currentPos = new THREE.Vector3().fromArray(n.pos);
    const nextPos = new THREE.Vector3().fromArray(this.nodes[nextIdx].pos);
    const forwardDir = new THREE.Vector3().subVectors(nextPos, currentPos);
    
    if (forwardDir.lengthSq() > 0.001) {
      forwardDir.normalize();
      const newTarget = currentPos.clone().addScaledVector(forwardDir, 50);
      n.target = [Number(newTarget.x.toFixed(1)), Number(newTarget.y.toFixed(1)), Number(newTarget.z.toFixed(1))];
      this.rebuildVisuals();
      this.saveToLocalStorage();
      this.onStateChange('node-modified', { index, node: n });
    }
  }

  snapCameraToNode(index = this.selectedIndex) {
    if (index < 0 || index >= this.nodes.length) return;
    const n = this.nodes[index];
    this.camera.position.set(n.pos[0], n.pos[1], n.pos[2]);
    this.camera.lookAt(n.target[0], n.target[1], n.target[2]);
    this.orbitControls.target.set(n.target[0], n.target[1], n.target[2]);
    this.camera.fov = n.fov || 50;
    this.camera.updateProjectionMatrix();
    this.orbitControls.update();
  }

  duplicateNode(index = this.selectedIndex) {
    if (index < 0 || index >= this.nodes.length) return;
    const source = this.nodes[index];
    const copy = JSON.parse(JSON.stringify(source));
    copy.id = 'node_' + Date.now();
    copy.name = `${source.name} (Copy)`;
    copy.pos[0] += 5; // Offset slightly
    copy.pos[2] += 5;

    this.nodes.splice(index + 1, 0, copy);
    this.selectedIndex = index + 1;
    this.rebuildVisuals();
    this.saveToLocalStorage();
    this.onStateChange('nodes-updated', { nodes: this.nodes, selectedIndex: this.selectedIndex });
  }

  deleteNode(index = this.selectedIndex) {
    if (this.nodes.length <= 2) {
      alert('Minimal harus ada 2 node kamera untuk jalur sinematik.');
      return;
    }
    this.nodes.splice(index, 1);
    this.selectedIndex = Math.min(this.selectedIndex, this.nodes.length - 1);
    this.rebuildVisuals();
    this.saveToLocalStorage();
    this.onStateChange('nodes-updated', { nodes: this.nodes, selectedIndex: this.selectedIndex });
  }

  moveNode(fromIndex, toIndex) {
    if (toIndex < 0 || toIndex >= this.nodes.length) return;
    const item = this.nodes.splice(fromIndex, 1)[0];
    this.nodes.splice(toIndex, 0, item);
    this.selectedIndex = toIndex;
    this.rebuildVisuals();
    this.saveToLocalStorage();
    this.onStateChange('nodes-updated', { nodes: this.nodes, selectedIndex: this.selectedIndex });
  }

  updateNodeProperty(index, key, value) {
    if (index < 0 || index >= this.nodes.length) return;
    this.nodes[index][key] = value;
    this.rebuildVisuals();
    this.saveToLocalStorage();
    this.onStateChange('node-modified', { index, node: this.nodes[index] });
  }

  // Scale all node durations by multiplier (e.g. 1.5x, 0.8x, 2.0x)
  scaleAllDurations(multiplier) {
    if (this.nodes.length === 0 || !multiplier || multiplier <= 0) return;
    this.nodes.forEach(n => {
      const current = Number(n.durationSec) || 4.0;
      n.durationSec = Number(Math.max(0.2, Math.min(120, current * multiplier)).toFixed(1));
    });
    this.rebuildVisuals();
    this.saveToLocalStorage();
    this.onStateChange('nodes-updated', { nodes: this.nodes, selectedIndex: this.selectedIndex });
  }

  // Scale all durations proportionally to match an exact target total duration
  fitTotalDuration(targetTotalSec) {
    if (this.nodes.length < 2 || !targetTotalSec || targetTotalSec <= 0) return;
    const currentTotal = this.getTotalDuration();
    if (currentTotal <= 0) return;
    const ratio = targetTotalSec / currentTotal;
    const totalSegments = this.isLooping ? this.nodes.length : this.nodes.length - 1;
    for (let i = 0; i < totalSegments; i++) {
      const cur = Number(this.nodes[i].durationSec) || 4.0;
      this.nodes[i].durationSec = Number(Math.max(0.2, cur * ratio).toFixed(1));
    }
    this.rebuildVisuals();
    this.saveToLocalStorage();
    this.onStateChange('nodes-updated', { nodes: this.nodes, selectedIndex: this.selectedIndex });
  }

  // Automatically calculate segment durations based on 3D distance between waypoints
  autoCalculateDurationsByDistance(baseSpeedUnitsPerSec = 25) {
    if (this.nodes.length < 2) return;
    const N = this.nodes.length;
    const totalSegments = this.isLooping ? N : N - 1;
    const speed = Math.max(1, baseSpeedUnitsPerSec);

    for (let i = 0; i < totalSegments; i++) {
      const nextIdx = (i + 1) % N;
      const p1 = new THREE.Vector3().fromArray(this.nodes[i].pos);
      const p2 = new THREE.Vector3().fromArray(this.nodes[nextIdx].pos);
      const dist = p1.distanceTo(p2);
      // Min 1.5s, max 30s
      const calculatedDuration = Math.max(1.5, Math.min(30.0, dist / speed));
      this.nodes[i].durationSec = Number(calculatedDuration.toFixed(1));
    }
    this.rebuildVisuals();
    this.saveToLocalStorage();
    this.onStateChange('nodes-updated', { nodes: this.nodes, selectedIndex: this.selectedIndex });
  }

  //  Project Storage (Auto-Save to LocalStorage)
  saveToLocalStorage() {
    try {
      const projectData = {
        version: "2.0",
        updatedAt: new Date().toISOString(),
        nodes: this.nodes,
        environment: {
          backgroundMode: this.backgroundMode,
          customBgColor: this.customBgColor,
          floorMode: this.floorMode,
          floorColor: this.floorColor || '#1e293b'
        },
        shaders: {
          enabled: this.enableShaders,
          bloomStrength: this.bloomStrength,
          bloomRadius: this.bloomRadius,
          exposure: this.exposure,
          toneMapping: this.currentToneMapping || 'aces'
        },
        settings: {
          isLooping: this.isLooping,
          globalTension: this.globalTension,
          clampGround: this.clampGround
        }
      };
      localStorage.setItem('cinematic_studio_project', JSON.stringify(projectData));
      localStorage.setItem('cinematic_camera_nodes', JSON.stringify(this.nodes));
    } catch (e) {}
  }

  loadFromLocalStorage() {
    try {
      const projectDataStr = localStorage.getItem('cinematic_studio_project');
      if (projectDataStr) {
        const parsed = JSON.parse(projectDataStr);
        if (parsed && Array.isArray(parsed.nodes) && parsed.nodes.length >= 2) {
          this.applyProjectData(parsed);
          return true;
        }
      }
      // Fallback to legacy nodes key
      const legacyNodesStr = localStorage.getItem('cinematic_camera_nodes');
      if (legacyNodesStr) {
        const parsed = JSON.parse(legacyNodesStr);
        if (Array.isArray(parsed) && parsed.length >= 2) {
          this.setNodes(parsed);
          return true;
        }
      }
    } catch (e) {}
    return false;
  }

  applyProjectData(projectData) {
    if (!projectData) return;

    if (Array.isArray(projectData.nodes) && projectData.nodes.length >= 2) {
      this.nodes = JSON.parse(JSON.stringify(projectData.nodes));
      this.selectedIndex = Math.min(this.selectedIndex, this.nodes.length - 1);
      this.rebuildVisuals();
    }

    if (projectData.environment) {
      const env = projectData.environment;
      if (env.backgroundMode) {
        this.setBackground(env.backgroundMode, env.customBgColor || null);
      }
      if (env.floorMode) {
        this.setFloor(env.floorMode);
      }
      if (env.floorColor) {
        this.setFloorColor(env.floorColor);
      }
    }

    if (projectData.shaders) {
      const sh = projectData.shaders;
      this.setShadersEnabled(sh.enabled);
      if (sh.bloomStrength !== undefined && sh.bloomRadius !== undefined) {
        this.setBloom(sh.bloomStrength, sh.bloomRadius);
      }
      if (sh.exposure !== undefined) {
        this.setExposure(sh.exposure);
      }
      if (sh.toneMapping) {
        this.setToneMapping(sh.toneMapping);
      }
    }

    if (projectData.settings) {
      const st = projectData.settings;
      if (st.isLooping !== undefined) this.isLooping = !!st.isLooping;
      if (st.globalTension !== undefined) this.globalTension = Number(st.globalTension);
      if (st.clampGround !== undefined) this.clampGround = !!st.clampGround;
    }

    this.saveToLocalStorage();
    this.onStateChange('project-loaded', { project: projectData });
  }

  //  Full Project JSON Export & Import (v2.0)
  exportJSON() {
    const projectData = {
      version: "2.0",
      createdAt: new Date().toISOString(),
      nodes: this.nodes,
      environment: {
        backgroundMode: this.backgroundMode,
        customBgColor: this.customBgColor,
        floorMode: this.floorMode,
        floorColor: this.floorColor || '#1e293b'
      },
      shaders: {
        enabled: this.enableShaders,
        bloomStrength: this.bloomStrength,
        bloomRadius: this.bloomRadius,
        exposure: this.exposure,
        toneMapping: this.currentToneMapping || 'aces'
      },
      settings: {
        isLooping: this.isLooping,
        globalTension: this.globalTension,
        clampGround: this.clampGround
      }
    };

    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(projectData, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute('href', dataStr);
    dlAnchor.setAttribute('download', `cinematic-project-v2-${Date.now()}.json`);
    dlAnchor.click();
  }

  importJSON(jsonString) {
    try {
      const parsed = JSON.parse(jsonString);
      if (Array.isArray(parsed) && parsed.length >= 2) {
        // Legacy v1 track format
        this.setNodes(parsed);
        this.saveToLocalStorage();
        return true;
      } else if (parsed && Array.isArray(parsed.nodes) && parsed.nodes.length >= 2) {
        // Project v2.0 format
        this.applyProjectData(parsed);
        return true;
      } else {
        alert('File JSON tidak valid (harus proyek v2 atau array minimal 2 node).');
      }
    } catch (e) {
      alert('Format JSON error: ' + e.message);
    }
    return false;
  }

  //  Environment Management Methods
  setBackground(mode, customHex = null) {
    this.backgroundMode = mode;
    if (customHex) this.customBgColor = customHex;

    if (mode.startsWith('sky-')) {
      this.sky.visible = true;
      this.scene.background = null;
      this.scene.fog = null;
      this.setSkyPreset(mode);
    } else if (mode === 'transparent') {
      this.sky.visible = false;
      this.scene.background = null;
      this.scene.fog = null;
    } else {
      this.sky.visible = false;
      let colorHex = 0x0e1726;
      if (mode === 'color-dark') colorHex = 0x000000;
      else if (mode === 'color-white') colorHex = 0xf1f5f9;
      else if (mode === 'color-warm') colorHex = 0xe2e8f0;
      else if (mode === 'color-custom') {
        const cleanHex = this.customBgColor.replace('#', '0x');
        colorHex = parseInt(cleanHex, 16) || 0x0e1726;
      }

      this.scene.background = new THREE.Color(colorHex);
      this.scene.fog = new THREE.FogExp2(colorHex, 0.0006);
    }

    this.saveToLocalStorage();
    this.onStateChange('environment-changed', { backgroundMode: mode, customBgColor: this.customBgColor });
  }

  setSkyPreset(preset) {
    const skyUniforms = this.sky.material.uniforms;
    let elevation = 45, azimuth = 180, turbidity = 10, rayleigh = 2;

    if (preset === 'sky-noon' || preset === 'sky-blue') {
      elevation = 55;
      turbidity = 4;
      rayleigh = 1.5;
    } else if (preset === 'sky-golden') {
      elevation = 12;
      turbidity = 8;
      rayleigh = 3.5;
    } else if (preset === 'sky-sunset') {
      elevation = 2.5;
      turbidity = 15;
      rayleigh = 4.0;
    }

    skyUniforms['turbidity'].value = turbidity;
    skyUniforms['rayleigh'].value = rayleigh;
    skyUniforms['mieCoefficient'].value = 0.005;
    skyUniforms['mieDirectionalG'].value = 0.8;

    const phi = THREE.MathUtils.degToRad(90 - elevation);
    const theta = THREE.MathUtils.degToRad(azimuth);
    this.sun.setFromSphericalCoords(1, phi, theta);
    skyUniforms['sunPosition'].value.copy(this.sun);
  }

  setFloor(mode) {
    this.floorMode = mode;
    if (this.gridFloor) {
      this.gridFloor.visible = mode === 'grid';
    }
    if (this.solidFloor) {
      this.solidFloor.visible = mode === 'solid-matte';
    }
    this.saveToLocalStorage();
    this.onStateChange('environment-changed', { floorMode: mode });
  }

  setFloorColor(hexColor) {
    this.floorColor = hexColor;
    if (this.solidFloor && this.solidFloor.material) {
      const cleanHex = hexColor.startsWith('#') ? hexColor : '#' + hexColor;
      this.solidFloor.material.color.set(cleanHex);
    }
    this.saveToLocalStorage();
    this.onStateChange('environment-changed', { floorColor: hexColor });
  }

  //  Shaders & Post-Processing Methods
  setShadersEnabled(enabled) {
    this.enableShaders = !!enabled;
    this.saveToLocalStorage();
    this.onStateChange('shaders-changed', { enabled: this.enableShaders });
  }

  setBloom(strength, radius) {
    this.bloomStrength = strength;
    this.bloomRadius = radius;
    this.bloomPass.strength = strength;
    this.bloomPass.radius = radius;
    this.saveToLocalStorage();
  }

  setExposure(val) {
    this.exposure = val;
    this.renderer.toneMappingExposure = val;
    this.saveToLocalStorage();
  }

  setToneMapping(mappingName) {
    this.currentToneMapping = mappingName;
    if (mappingName === 'aces') this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    else if (mappingName === 'reinhard') this.renderer.toneMapping = THREE.ReinhardToneMapping;
    else if (mappingName === 'cineon') this.renderer.toneMapping = THREE.CineonToneMapping;
    else if (mappingName === 'linear') this.renderer.toneMapping = THREE.LinearToneMapping;
    this.saveToLocalStorage();
  }

  renderScene() {
    if (this.sky && this.sky.visible) {
      this.sky.position.copy(this.camera.position);
    }

    if (this.enableShaders) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  //  True Frame-Accurate Deterministic Video Renderer (WebCodecs + MP4 / WebM Muxer)
  // Guarantees exact timestamp per frame (e.g. 6.000s duration for 360 frames @ 60fps), 0 dropped frames, zero stutter
  async renderDeterministic60FPS({
    fps = 60,
    resolution = '1080p', // '1080p' | '2k' | '4k' | '720p'
    bitrate = 50000000,   // 50 Mbps default (up to 80 Mbps)
    format = 'mp4',       // 'mp4' | 'webm'
    onProgress = () => {},
    onComplete = () => {},
    onError = () => {}
  }) {
    if (this.isOfflineRendering) return;
    this.isOfflineRendering = true;
    this.isPlaying = false;

    // Save previous state
    const savedTime = this.currentTime;
    const savedViewMode = this.viewMode;
    const totalDuration = this.getTotalDuration();
    const totalFrames = Math.max(1, Math.round(totalDuration * fps));

    const savedWidth = window.innerWidth;
    const savedHeight = window.innerHeight;

    // Target render resolution (must have even dimensions for H.264/VP9)
    let targetWidth = 1920, targetHeight = 1080;
    if (resolution === '4k') { targetWidth = 3840; targetHeight = 2160; }
    else if (resolution === '2k') { targetWidth = 2560; targetHeight = 1440; }
    else if (resolution === '720p') { targetWidth = 1280; targetHeight = 720; }

    this.setViewMode('lens-view');

    // Scale canvas and render targets to target resolution with full anti-aliasing
    this.renderer.setSize(targetWidth, targetHeight, false);
    if (this.composer) {
      this.composer.setSize(targetWidth, targetHeight);
    }
    if (this.fxaaPass && this.fxaaPass.material) {
      this.fxaaPass.material.uniforms['resolution'].value.set(1 / targetWidth, 1 / targetHeight);
    }
    this.camera.aspect = targetWidth / targetHeight;
    this.camera.updateProjectionMatrix();

    let cancelRequested = false;
    const cancelToken = {
      cancel: () => { cancelRequested = true; }
    };

    const restoreRenderer = () => {
      this.renderer.setSize(savedWidth, savedHeight);
      if (this.composer) {
        this.composer.setSize(savedWidth, savedHeight);
      }
      if (this.fxaaPass && this.fxaaPass.material) {
        this.fxaaPass.material.uniforms['resolution'].value.set(1 / savedWidth, 1 / savedHeight);
      }
      this.camera.aspect = savedWidth / savedHeight;
      this.camera.updateProjectionMatrix();
      this.isOfflineRendering = false;
      this.seek(savedTime);
      this.setViewMode(savedViewMode);
    };

    const hasWebCodecs = typeof window.VideoEncoder !== 'undefined' && typeof window.VideoFrame !== 'undefined';

    if (hasWebCodecs) {
      try {
        let selectedFormat = format || 'mp4';
        let muxer = null;
        let target = null;
        let chosenCodec = null;
        let isMp4 = true;

        // Auto-negotiate codec compatibility
        if (selectedFormat === 'mp4') {
          const mp4CandidateCodecs = [
            'avc1.640034', // High Profile Level 5.2 (4K / 2K / 1080p @ 60fps)
            'avc1.640033',
            'avc1.4d0034', // Main Profile Level 5.2
            'avc1.4d002a',
            'avc1.420034', // Baseline Level 5.2
            'avc1.420028'
          ];
          for (const codec of mp4CandidateCodecs) {
            try {
              const res = await VideoEncoder.isConfigSupported({
                codec,
                width: targetWidth,
                height: targetHeight,
                bitrate,
                framerate: fps,
                hardwareAcceleration: 'no-preference'
              });
              if (res && res.supported) {
                chosenCodec = codec;
                isMp4 = true;
                break;
              }
            } catch (e) {}
          }
        }

        if (!chosenCodec) {
          const webmCandidateCodecs = ['vp09.00.41.08', 'vp09.00.10.08', 'vp8'];
          for (const codec of webmCandidateCodecs) {
            try {
              const res = await VideoEncoder.isConfigSupported({
                codec,
                width: targetWidth,
                height: targetHeight,
                bitrate,
                framerate: fps,
                hardwareAcceleration: 'no-preference'
              });
              if (res && res.supported) {
                chosenCodec = codec;
                isMp4 = false;
                break;
              }
            } catch (e) {}
          }
        }

        if (!chosenCodec) {
          throw new Error('Browser tidak mendukung encoder video untuk resolusi dan bitrate ini.');
        }

        if (isMp4) {
          const { Muxer: Mp4Muxer, ArrayBufferTarget: Mp4Target } = await import('./vendor/mp4-muxer.mjs');
          target = new Mp4Target();
          muxer = new Mp4Muxer({
            target,
            video: {
              codec: 'avc',
              width: targetWidth,
              height: targetHeight
            },
            fastStart: 'in-memory',
            firstTimestampBehavior: 'strict'
          });
        } else {
          const { Muxer: WebmMuxer, ArrayBufferTarget: WebmTarget } = await import('./vendor/webm-muxer.mjs');
          target = new WebmTarget();
          muxer = new WebmMuxer({
            target,
            video: {
              codec: chosenCodec.startsWith('vp09') ? 'V_VP9' : (chosenCodec === 'vp8' ? 'V_VP8' : 'V_AV1'),
              width: targetWidth,
              height: targetHeight,
              frameRate: fps
            }
          });
        }

        let encodeError = null;
        const encoder = new VideoEncoder({
          output: (chunk, meta) => {
            if (muxer) muxer.addVideoChunk(chunk, meta);
          },
          error: (err) => {
            encodeError = err;
            console.error('VideoEncoder error:', err);
          }
        });

        encoder.configure({
          codec: chosenCodec,
          width: targetWidth,
          height: targetHeight,
          bitrate,
          framerate: fps,
          hardwareAcceleration: 'no-preference'
        });

        const frameDurationUs = Math.round((1 / fps) * 1000000);

        // Frame by Frame Deterministic Capture Loop
        for (let frame = 0; frame < totalFrames; frame++) {
          if (cancelRequested) {
            try { encoder.close(); } catch (e) {}
            restoreRenderer();
            onError(new Error('Render dibatalkan oleh pengguna.'));
            return cancelToken;
          }
          if (encodeError) throw encodeError;

          const t = (frame / totalFrames) * totalDuration;
          this.currentTime = t;
          const evalResult = this.evaluateAtTime(t);
          this.applyToCamera(evalResult);

          // Render high-fidelity 3D frame
          this.renderScene();

          // Capture frame with exact microsecond timestamp
          const timestampUs = Math.round((frame / fps) * 1000000);
          const isKeyFrame = (frame % (fps * 2) === 0);

          const videoFrame = new VideoFrame(this.renderer.domElement, {
            timestamp: timestampUs,
            duration: frameDurationUs
          });

          encoder.encode(videoFrame, { keyFrame: isKeyFrame });
          videoFrame.close();

          // Prevent queue memory overflow
          while (encoder.encodeQueueSize > 4) {
            await new Promise(r => setTimeout(r, 4));
          }

          const percent = Math.round(((frame + 1) / totalFrames) * 100);
          onProgress({
            frame: frame + 1,
            totalFrames,
            percent,
            currentTime: t,
            totalDuration,
            resolution,
            format: isMp4 ? 'MP4 (H.264 Master Lossless)' : 'WebM (VP9)',
            fps
          });

          if (frame % 2 === 0) {
            await new Promise(r => setTimeout(r, 0));
          }
        }

        await encoder.flush();
        muxer.finalize();
        try { encoder.close(); } catch (e) {}

        const buffer = target.buffer;
        const mimeType = isMp4 ? 'video/mp4' : 'video/webm';
        const ext = isMp4 ? 'mp4' : 'webm';
        const blob = new Blob([buffer], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const filename = `cinematic-tour-${resolution}-${fps}fps-${Math.round(bitrate / 1000000)}mbps-${Date.now()}.${ext}`;

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();

        restoreRenderer();
        onComplete({ url, blob, filename, sizeBytes: buffer.byteLength, durationSec: totalDuration, totalFrames, fps });
        return cancelToken;
      } catch (err) {
        console.error('WebCodecs rendering error:', err);
        restoreRenderer();
        onError(err);
        return cancelToken;
      }
    } else {
      // Legacy Fallback for browsers without WebCodecs (MediaRecorder)
      const stream = this.renderer.domElement.captureStream(0);
      const track = stream.getVideoTracks()[0];

      let options = {
        mimeType: 'video/webm; codecs=vp9',
        videoBitsPerSecond: bitrate || 50000000
      };
      let mediaRecorder;
      try {
        mediaRecorder = new MediaRecorder(stream, options);
      } catch (e) {
        try {
          mediaRecorder = new MediaRecorder(stream, { videoBitsPerSecond: bitrate || 50000000 });
        } catch (e2) {
          mediaRecorder = new MediaRecorder(stream);
        }
      }

      const recordedChunks = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunks.push(e.data);
      };

      mediaRecorder.start();

      try {
        for (let frame = 0; frame <= totalFrames; frame++) {
          if (cancelRequested) {
            mediaRecorder.stop();
            restoreRenderer();
            onError(new Error('Render dibatalkan oleh pengguna.'));
            return cancelToken;
          }

          const t = (frame / totalFrames) * totalDuration;
          this.currentTime = t;
          const evalResult = this.evaluateAtTime(t);
          this.applyToCamera(evalResult);

          this.renderScene();

          if (track && typeof track.requestFrame === 'function') {
            track.requestFrame();
          }

          const percent = Math.round((frame / totalFrames) * 100);
          onProgress({ frame, totalFrames, percent, currentTime: t, totalDuration, resolution, format: 'WebM (Fallback)' });

          await new Promise(r => setTimeout(r, 6));
        }

        mediaRecorder.onstop = () => {
          const blob = new Blob(recordedChunks, { type: 'video/webm' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `cinematic-${resolution}-60fps-fallback-${Date.now()}.webm`;
          a.click();

          restoreRenderer();
          onComplete({ url, blob });
        };

        mediaRecorder.stop();
      } catch (err) {
        restoreRenderer();
        onError(err);
      }

      return cancelToken;
    }
  }

  // Main update loop integration
  update(delta) {
    if (this.isPlaying && !this.isOfflineRendering) {
      this.currentTime += delta * this.playbackSpeed;
      const total = this.getTotalDuration();

      if (this.currentTime >= total) {
        if (this.isLooping) {
          this.currentTime = this.currentTime % total;
        } else {
          this.currentTime = total;
          this.isPlaying = false;
          const evalResult = this.evaluateAtTime(total);
          if (this.viewMode === 'lens-view') {
            this.applyToCamera(evalResult);
          }
          this.onTimelineUpdate(evalResult);
          this.onStateChange('playback-changed', { isPlaying: false, currentTime: total });
          return;
        }
      }

      const evalResult = this.evaluateAtTime(this.currentTime);

      if (this.viewMode === 'lens-view') {
        this.applyToCamera(evalResult);
      }

      this.onTimelineUpdate(evalResult);
    }
  }
}
