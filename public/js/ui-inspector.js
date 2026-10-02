// Right panel, Transform + Curve tabs: inspector sync and listeners.
import { EASING_PRESETS } from "../curve-editor.js";

export function initInspectorUI(S) {
  const el = S.el;
  // Sync Inspector Fields with Selected Node
  function syncInspectorWithSelectedNode() {
    const idx = S.engine.selectedIndex;
    if (idx < 0 || idx >= S.engine.nodes.length) return;
    const n = S.engine.nodes[idx];

    el.inputPosX.value = n.pos[0];
    el.inputPosY.value = n.pos[1];
    el.inputPosZ.value = n.pos[2];

    el.inputTargetX.value = n.target[0];
    el.inputTargetY.value = n.target[1];
    el.inputTargetZ.value = n.target[2];

    el.sliderFov.value = n.fov || 50;
    el.labelFovVal.innerText = `${n.fov || 50}°`;

    const dur = Number(n.durationSec) || 4.0;
    el.sliderDuration.value = dur;
    if (el.inputDurationNum) el.inputDurationNum.value = dur.toFixed(1);

    const p1 = n.curve?.p1 || [0.42, 0.0];
    const p2 = n.curve?.p2 || [0.58, 1.0];
    const preset = n.curve?.preset || 'ease-in-out';
    el.labelCurveType.innerText = preset;
    S.curveEditor.setCurve(p1, p2, preset);
    S.updatePresetPillsActive(preset);

    // Sync Path Mode & Tension
    const isLinear = n.pathMode === 'linear';
    el.btnPathLinear.classList.toggle('active', isLinear);
    el.btnPathCurve.classList.toggle('active', !isLinear);

    const tension = typeof n.tension === 'number' ? n.tension : 0.0;
    el.sliderTension.value = tension;
    el.labelTensionVal.innerText = tension === 0 ? '0.0 (Halus)' : tension === 1 ? '1.0 (Lurus)' : `${tension.toFixed(2)}`;

    el.checkClampGround.checked = S.engine.clampGround !== false;
  }

  // Inspector input event listeners
  function updateCoordsFromInputs() {
    const idx = S.engine.selectedIndex;
    if (idx < 0 || idx >= S.engine.nodes.length) return;
    const n = S.engine.nodes[idx];
    n.pos = [Number(el.inputPosX.value), Number(el.inputPosY.value), Number(el.inputPosZ.value)];
    n.target = [Number(el.inputTargetX.value), Number(el.inputTargetY.value), Number(el.inputTargetZ.value)];
    S.engine.rebuildVisuals();
    S.engine.saveToLocalStorage();
  }

  [el.inputPosX, el.inputPosY, el.inputPosZ, el.inputTargetX, el.inputTargetY, el.inputTargetZ].forEach(inp => {
    inp.addEventListener('change', updateCoordsFromInputs);
  });

  el.sliderFov.addEventListener('input', (e) => {
    const val = Number(e.target.value);
    el.labelFovVal.innerText = `${val}°`;
    S.engine.updateNodeProperty(S.engine.selectedIndex, 'fov', val);
    S.camera.fov = val;
    S.camera.updateProjectionMatrix();
  });

  el.sliderDuration.addEventListener('input', (e) => {
    const val = Number(parseFloat(e.target.value).toFixed(1));
    if (el.inputDurationNum) el.inputDurationNum.value = val.toFixed(1);
    S.engine.updateNodeProperty(S.engine.selectedIndex, 'durationSec', val);
    S.renderTimelineSegments();
    S.renderNodesList();
  });

  if (el.inputDurationNum) {
    el.inputDurationNum.addEventListener('input', (e) => {
      const val = Number(parseFloat(e.target.value).toFixed(1)) || 4.0;
      el.sliderDuration.value = val;
      S.engine.updateNodeProperty(S.engine.selectedIndex, 'durationSec', Math.max(0.2, val));
      S.renderTimelineSegments();
      S.renderNodesList();
    });
  }

  el.durStepButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const step = parseFloat(btn.getAttribute('data-step'));
      const cur = Number(S.engine.nodes[S.engine.selectedIndex]?.durationSec) || 4.0;
      const next = Math.max(0.2, Math.min(120, Number((cur + step).toFixed(1))));
      el.sliderDuration.value = next;
      if (el.inputDurationNum) el.inputDurationNum.value = next.toFixed(1);
      S.engine.updateNodeProperty(S.engine.selectedIndex, 'durationSec', next);
      S.renderTimelineSegments();
      S.renderNodesList();
    });
  });

  el.durSetButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetDur = parseFloat(btn.getAttribute('data-dur'));
      el.sliderDuration.value = targetDur;
      if (el.inputDurationNum) el.inputDurationNum.value = targetDur.toFixed(1);
      S.engine.updateNodeProperty(S.engine.selectedIndex, 'durationSec', targetDur);
      S.renderTimelineSegments();
      S.renderNodesList();
    });
  });

  if (el.btnScale08) {
    el.btnScale08.addEventListener('click', () => {
      S.engine.scaleAllDurations(0.8);
      S.syncInspectorWithSelectedNode();
      S.renderNodesList();
      S.renderTimelineSegments();
    });
  }

  if (el.btnScale12) {
    el.btnScale12.addEventListener('click', () => {
      S.engine.scaleAllDurations(1.25);
      S.syncInspectorWithSelectedNode();
      S.renderNodesList();
      S.renderTimelineSegments();
    });
  }

  if (el.btnScale15) {
    el.btnScale15.addEventListener('click', () => {
      S.engine.scaleAllDurations(1.5);
      S.syncInspectorWithSelectedNode();
      S.renderNodesList();
      S.renderTimelineSegments();
    });
  }

  if (el.btnFitTotal) {
    el.btnFitTotal.addEventListener('click', () => {
      const targetSec = parseFloat(el.inputFitTotalSec.value);
      if (targetSec > 0) {
        S.engine.fitTotalDuration(targetSec);
        S.syncInspectorWithSelectedNode();
        S.renderNodesList();
        S.renderTimelineSegments();
      } else {
        alert('Masukkan target total durasi dalam detik (misal: 15).');
      }
    });
  }

  if (el.btnAutoDurDist) {
    el.btnAutoDurDist.addEventListener('click', () => {
      S.engine.autoCalculateDurationsByDistance(25);
      S.syncInspectorWithSelectedNode();
      S.renderNodesList();
      S.renderTimelineSegments();
    });
  }

  el.btnSyncCamPos.addEventListener('click', () => {
    const p = S.camera.position;
    el.inputPosX.value = p.x.toFixed(1);
    el.inputPosY.value = p.y.toFixed(1);
    el.inputPosZ.value = p.z.toFixed(1);
    updateCoordsFromInputs();
  });

  el.btnSyncTargetView.addEventListener('click', () => {
    const t = S.engine.getCurrentViewTarget();
    el.inputTargetX.value = t.x.toFixed(1);
    el.inputTargetY.value = t.y.toFixed(1);
    el.inputTargetZ.value = t.z.toFixed(1);
    updateCoordsFromInputs();
  });

  el.btnTargetForward.addEventListener('click', () => {
    S.engine.setNodeTargetForward(S.engine.selectedIndex);
    S.syncInspectorWithSelectedNode();
  });

  el.btnTargetCenter.addEventListener('click', () => {
    el.inputTargetX.value = '0';
    el.inputTargetY.value = '15';
    el.inputTargetZ.value = '0';
    updateCoordsFromInputs();
  });

  el.btnSnapView.addEventListener('click', () => S.engine.snapCameraToNode());
  el.btnUpdateView.addEventListener('click', () => S.engine.updateNodeFromCurrentView());

  // Easing Preset buttons click
  el.presetPills.forEach(pill => {
    pill.addEventListener('click', () => {
      const key = pill.getAttribute('data-preset');
      if (EASING_PRESETS[key]) {
        const cfg = EASING_PRESETS[key];
        S.curveEditor.setCurve(cfg.p1, cfg.p2, key);
        el.labelCurveType.innerText = cfg.name;
        S.updatePresetPillsActive(key);

        const idx = S.engine.selectedIndex;
        if (idx >= 0 && idx < S.engine.nodes.length) {
          S.engine.nodes[idx].curve = { preset: key, p1: cfg.p1, p2: cfg.p2 };
          S.engine.saveToLocalStorage();
          S.renderNodesList();
        }
      }
    });
  });

  el.btnApplyAllCurves.addEventListener('click', () => {
    const activeCurve = S.curveEditor.getCurve();
    const dur = Number(el.sliderDuration.value) || 4.0;
    S.engine.nodes.forEach(n => {
      n.curve = JSON.parse(JSON.stringify(activeCurve));
      n.durationSec = dur;
    });
    S.engine.saveToLocalStorage();
    S.renderNodesList();
    S.renderTimelineSegments();
    alert('Kurva & Durasi berhasil diterapkan ke seluruh node!');
  });

  el.btnPathCurve.addEventListener('click', () => {
    S.engine.updateNodeProperty(S.engine.selectedIndex, 'pathMode', 'curve');
    el.btnPathCurve.classList.add('active');
    el.btnPathLinear.classList.remove('active');
  });

  el.btnPathLinear.addEventListener('click', () => {
    S.engine.updateNodeProperty(S.engine.selectedIndex, 'pathMode', 'linear');
    el.btnPathLinear.classList.add('active');
    el.btnPathCurve.classList.remove('active');
  });

  el.sliderTension.addEventListener('input', (e) => {
    const val = Number(e.target.value);
    el.labelTensionVal.innerText = val === 0 ? '0.0 (Halus)' : val === 1 ? '1.0 (Lurus)' : `${val.toFixed(2)}`;
    S.engine.updateNodeProperty(S.engine.selectedIndex, 'tension', val);
  });

  el.checkClampGround.addEventListener('change', (e) => {
    S.engine.clampGround = e.target.checked;
    S.engine.rebuildVisuals();
  });

  function updatePresetPillsActive(presetName) {
    el.presetPills.forEach((pill) => {
      if (pill.getAttribute('data-preset') === presetName) {
        pill.classList.add('active');
      } else {
        pill.classList.remove('active');
      }
    });
  }
  S.syncInspectorWithSelectedNode = syncInspectorWithSelectedNode;
  S.updatePresetPillsActive = updatePresetPillsActive;
}
