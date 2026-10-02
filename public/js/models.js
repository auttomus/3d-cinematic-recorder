// GLB model loading (Draco + Meshopt) with procedural demo fallback.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { buildDemoScene } from "./demo-scene.js";

export function initModels(S) {
  const el = S.el;
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.6/");

  const gltfLoader = new GLTFLoader();
  gltfLoader.setDRACOLoader(dracoLoader);
  gltfLoader.setMeshoptDecoder(MeshoptDecoder);

  let currentModel = null;
  let mixer = null;

  function clearCurrent() {
    if (currentModel) {
      S.scene.remove(currentModel);
      currentModel = null;
    }
    mixer = null;
  }

  function normalizeAndAdd(obj) {
    clearCurrent();
    currentModel = obj;
    currentModel.traverse((child) => {
      if (child.isMesh && child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach((m) => {
          if (m.map) {
            m.map.anisotropy = S.renderer.capabilities.getMaxAnisotropy();
            m.map.generateMipmaps = true;
            m.map.minFilter = THREE.LinearMipmapLinearFilter;
            m.map.needsUpdate = true;
          }
          m.roughness = 0.85;
          m.metalness = 0.05;
          m.side = THREE.FrontSide;
          m.needsUpdate = true;
        });
      }
    });
    S.scene.add(currentModel);

    if (obj.animations && obj.animations.length > 0) {
      mixer = new THREE.AnimationMixer(obj);
      obj.animations.forEach((clip) => mixer.clipAction(clip).play());
    }

    const box = new THREE.Box3().setFromObject(currentModel);
    const center = box.getCenter(new THREE.Vector3());
    S.orbitControls.target.copy(center);
    S.orbitControls.update();
    el.loadingOverlay.style.display = "none";
  }

  function fail(msg, detail) {
    console.error(msg, detail);
    el.loadingOverlay.style.display = "none";
    alert(msg);
  }

  function load(url) {
    el.loadingOverlay.style.display = "flex";
    el.loadingProgress.innerText = "0%";
    const bust = url.includes("?") ? url : `${url}?t=${Date.now()}`;
    gltfLoader.load(
      bust,
      (gltf) => normalizeAndAdd(gltf.scene),
      (xhr) => {
        if (xhr.lengthComputable) {
          el.loadingProgress.innerText = Math.round((xhr.loaded / xhr.total) * 100) + "%";
        }
      },
      (err) => fail("Failed to load 3D model: " + url, err)
    );
  }

  function loadFile(file) {
    el.loadingOverlay.style.display = "flex";
    el.loadingProgress.innerText = "0%";
    const reader = new FileReader();
    reader.onload = (e) => {
      gltfLoader.parse(
        e.target.result,
        "",
        (gltf) => normalizeAndAdd(gltf.scene),
        (err) => fail("Failed to parse GLB file.", err)
      );
    };
    reader.readAsArrayBuffer(file);
  }

  function loadDemo() {
    clearCurrent();
    const demo = buildDemoScene(THREE);
    S.scene.add(demo);
    currentModel = demo;
    S.orbitControls.target.set(0, 20, 0);
    S.orbitControls.update();
    el.loadingOverlay.style.display = "none";
  }

  el.modelSelect.addEventListener("change", (e) => {
    if (e.target.value === "custom") el.customGlbInput.click();
    else if (!e.target.value) loadDemo();
    else load(e.target.value);
  });

  el.customGlbInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) loadFile(file);
  });

  S.model = {
    load,
    loadFile,
    loadDemo,
    update(delta) {
      if (mixer) mixer.update(delta);
    },
  };
}
