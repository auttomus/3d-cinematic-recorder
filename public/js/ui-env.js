// Right panel, Environment/Shaders tabs + full project UI sync.
export function initEnvUI(S) {
  const el = S.el;
  // Inspector Tabs Switcher (5 Tabs)
  function switchInspectorTab(tabKey) {
    el.tabBtnTransform.classList.toggle('active', tabKey === 'transform');
    el.tabBtnCurve.classList.toggle('active', tabKey === 'curve');
    el.tabBtnEnvironment.classList.toggle('active', tabKey === 'environment');
    el.tabBtnShaders.classList.toggle('active', tabKey === 'shaders');
    el.tabBtnExport.classList.toggle('active', tabKey === 'export');

    el.tabContentTransform.classList.toggle('active', tabKey === 'transform');
    el.tabContentCurve.classList.toggle('active', tabKey === 'curve');
    el.tabContentEnvironment.classList.toggle('active', tabKey === 'environment');
    el.tabContentShaders.classList.toggle('active', tabKey === 'shaders');
    el.tabContentExport.classList.toggle('active', tabKey === 'export');

    if (tabKey === 'curve') {
      setTimeout(() => S.curveEditor.resize(), 50);
    }
  }

  el.tabBtnTransform.addEventListener('click', () => switchInspectorTab('transform'));
  el.tabBtnCurve.addEventListener('click', () => switchInspectorTab('curve'));
  el.tabBtnEnvironment.addEventListener('click', () => switchInspectorTab('environment'));
  el.tabBtnShaders.addEventListener('click', () => switchInspectorTab('shaders'));
  el.tabBtnExport.addEventListener('click', () => switchInspectorTab('export'));

  //  Environment Controls Listeners
  document.querySelectorAll('.btn-env-sky').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-env-sky, .btn-env-color').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      S.engine.setBackground(btn.dataset.bg);
    });
  });

  document.querySelectorAll('.btn-env-color').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-env-sky, .btn-env-color').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      S.engine.setBackground(btn.dataset.bg);
    });
  });

  el.pickerCustomBg.addEventListener('input', (e) => {
    document.querySelectorAll('.btn-env-sky, .btn-env-color').forEach(b => b.classList.remove('active'));
    S.engine.setBackground('color-custom', e.target.value);
  });

  el.btnBgTransparent.addEventListener('click', () => {
    document.querySelectorAll('.btn-env-sky, .btn-env-color').forEach(b => b.classList.remove('active'));
    S.engine.setBackground('transparent');
  });

  const updateFloorButtons = (mode) => {
    el.btnFloorGrid.classList.toggle('active', mode === 'grid');
    el.btnFloorSolid.classList.toggle('active', mode === 'solid-matte');
    el.btnFloorNone.classList.toggle('active', mode === 'none');
  };

  el.btnFloorGrid.addEventListener('click', () => {
    S.engine.setFloor('grid');
    updateFloorButtons('grid');
  });
  el.btnFloorSolid.addEventListener('click', () => {
    S.engine.setFloor('solid-matte');
    updateFloorButtons('solid-matte');
  });
  el.btnFloorNone.addEventListener('click', () => {
    S.engine.setFloor('none');
    updateFloorButtons('none');
  });

  // Floor Color Listeners

  document.querySelectorAll('.btn-floor-color').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-floor-color').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const color = btn.dataset.color;
      S.engine.setFloorColor(color);
      S.engine.setFloor('solid-matte');
      updateFloorButtons('solid-matte');
    });
  });

  if (el.pickerCustomFloor) {
    el.pickerCustomFloor.addEventListener('input', (e) => {
      document.querySelectorAll('.btn-floor-color').forEach(b => b.classList.remove('active'));
      S.engine.setFloorColor(e.target.value);
      S.engine.setFloor('solid-matte');
      updateFloorButtons('solid-matte');
    });
  }

  //  Shaders & Post-Processing Listeners
  el.checkShadersMaster.addEventListener('change', (e) => {
    S.engine.setShadersEnabled(e.target.checked);
  });

  el.sliderBloomStrength.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    el.labelBloomVal.innerText = val.toFixed(2);
    S.engine.setBloom(val, parseFloat(el.sliderBloomRadius.value));
  });

  el.sliderBloomRadius.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    el.labelBloomRadVal.innerText = val.toFixed(2);
    S.engine.setBloom(parseFloat(el.sliderBloomStrength.value), val);
  });

  el.sliderExposure.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    el.labelExposureVal.innerText = val.toFixed(2);
    S.engine.setExposure(val);
  });

  el.selectToneMapping.addEventListener('change', (e) => {
    S.engine.setToneMapping(e.target.value);
  });

  // Full Engine & Project UI Synchronizer
  function syncUIFromEngineState() {
    if (!S.engine) return;

    // 1. Sync Sky & Backdrop buttons
    const bg = S.engine.backgroundMode;
    document.querySelectorAll('.btn-env-sky, .btn-env-color').forEach(b => {
      b.classList.toggle('active', b.dataset.bg === bg);
    });
    if (bg === 'color-custom' && el.pickerCustomBg) {
      el.pickerCustomBg.value = S.engine.customBgColor || '#0e1726';
    }

    // 2. Sync Floor Mode
    const fm = S.engine.floorMode;
    updateFloorButtons(fm);

    // 3. Sync Floor Color
    const fc = S.engine.floorColor || '#1e293b';
    document.querySelectorAll('.btn-floor-color').forEach(b => {
      b.classList.toggle('active', b.dataset.color === fc);
    });
    if (el.pickerCustomFloor) {
      el.pickerCustomFloor.value = fc;
    }

    // 4. Sync Shaders
    el.checkShadersMaster.checked = !!S.engine.enableShaders;
    el.sliderBloomStrength.value = S.engine.bloomStrength;
    el.labelBloomVal.innerText = Number(S.engine.bloomStrength).toFixed(2);
    el.sliderBloomRadius.value = S.engine.bloomRadius;
    el.labelBloomRadVal.innerText = Number(S.engine.bloomRadius).toFixed(2);
    el.sliderExposure.value = S.engine.exposure;
    el.labelExposureVal.innerText = Number(S.engine.exposure).toFixed(2);
    if (S.engine.currentToneMapping) {
      el.selectToneMapping.value = S.engine.currentToneMapping;
    }

    // 5. Sync Settings
    S.updateLoopButtonUI();
    S.renderNodesList();
    S.renderTimelineSegments();
    S.syncInspectorWithSelectedNode();
  }
  S.syncUIFromEngineState = syncUIFromEngineState;
}
