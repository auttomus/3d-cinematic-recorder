// Bottom dock: loop toggle, timeline segments, scrubber, transport,
// camera mode buttons, panel toggles.
import { formatTime } from "./utils.js";

export function initTimelineUI(S) {
  const el = S.el;
  // Update Loop Button UI Status
  function updateLoopButtonUI() {
    const isLoop = S.engine.isLooping;
    if (isLoop) {
      el.tBtnLoop.innerHTML = ' Loop';
      el.tBtnLoop.style.color = 'var(--accent-emerald)';
      el.tBtnLoop.style.borderColor = 'rgba(16, 185, 129, 0.4)';
      el.tBtnLoop.style.background = 'rgba(16, 185, 129, 0.15)';
      el.tBtnLoop.title = 'Mode Looping Aktif (Klik untuk ubah ke Play Once / Stop di Ujung)';
    } else {
      el.tBtnLoop.innerHTML = ' Play Once';
      el.tBtnLoop.style.color = '#fbbf24';
      el.tBtnLoop.style.borderColor = 'rgba(251, 191, 36, 0.4)';
      el.tBtnLoop.style.background = 'rgba(251, 191, 36, 0.15)';
      el.tBtnLoop.title = 'Mode Play Once (Kamera akan berhenti otomatis di Node Terakhir)';
    }
  }

  // Render Timeline Segments & Markers
  function renderTimelineSegments() {
    el.timelineSegmentsLayer.innerHTML = '';
    el.timelineMarkersLayer.innerHTML = '';

    const total = S.engine.getTotalDuration();
    el.tcTotal.innerText = formatTime(total);

    if (total <= 0) return;

    const colors = ['#0284c7', '#059669', '#d97706', '#7c3aed', '#db2777', '#2563eb'];
    let accumTime = 0;
    const totalSegments = S.engine.isLooping ? S.engine.nodes.length : Math.max(0, S.engine.nodes.length - 1);

    for (let idx = 0; idx < totalSegments; idx++) {
      const n = S.engine.nodes[idx];
      const dur = Number(n.durationSec) || 4.0;
      const widthPercent = (dur / total) * 100;
      const startPercent = (accumTime / total) * 100;

      // Segment Block
      const block = document.createElement('div');
      block.className = 'timeline-segment-block';
      block.style.width = `${widthPercent}%`;
      block.style.backgroundColor = colors[idx % colors.length] + '33';
      block.style.borderLeft = `2px solid ${colors[idx % colors.length]}`;
      const nextIdx = (idx + 1) % S.engine.nodes.length;
      block.innerText = `#${idx + 1} -> #${nextIdx + 1} (${dur}s)`;
      block.title = `Segmen ${idx + 1}: ${n.name} (Durasi: ${dur}s)`;

      block.addEventListener('click', () => {
        S.engine.selectNode(idx);
        S.engine.seek(startPercent * total / 100);
      });

      el.timelineSegmentsLayer.appendChild(block);

      // Keyframe Diamond Marker
      const marker = document.createElement('div');
      marker.className = 'keyframe-marker';
      marker.style.left = `${startPercent}%`;
      marker.title = `Node ${idx + 1}: ${n.name}`;
      el.timelineMarkersLayer.appendChild(marker);

      accumTime += dur;
    }

    // Add final keyframe marker at 100% when not looping
    if (!S.engine.isLooping && S.engine.nodes.length > 0) {
      const lastIdx = S.engine.nodes.length - 1;
      const lastNode = S.engine.nodes[lastIdx];
      const finalMarker = document.createElement('div');
      finalMarker.className = 'keyframe-marker';
      finalMarker.style.left = '100%';
      finalMarker.style.background = '#facc15';
      finalMarker.style.boxShadow = '0 0 10px #facc15';
      finalMarker.title = `Finish: Node ${lastIdx + 1} (${lastNode.name})`;
      el.timelineMarkersLayer.appendChild(finalMarker);
    }
  }

  // Timeline Scrubber Click & Drag
  let isScrubbing = false;
  const seekTimelineFromEvent = (e) => {
    const rect = el.timelineTrackWrap.getBoundingClientRect();
    const clickX = Math.min(Math.max(e.clientX - rect.left, 0), rect.width);
    const progress = clickX / rect.width;
    const total = S.engine.getTotalDuration();
    S.engine.seek(progress * total);
  };

  el.timelineTrackWrap.addEventListener('mousedown', (e) => {
    isScrubbing = true;
    seekTimelineFromEvent(e);
  });

  window.addEventListener('mousemove', (e) => {
    if (isScrubbing) seekTimelineFromEvent(e);
  });

  window.addEventListener('mouseup', () => {
    isScrubbing = false;
  });

  // Transport Button Listeners
  el.tBtnPlay.addEventListener('click', () => {
    if (S.engine.isPlaying) S.engine.pause();
    else {
      if (S.engine.viewMode !== 'lens-view') {
        el.btnModeLens.click();
      }
      S.engine.play();
    }
  });

  el.tBtnStop.addEventListener('click', () => S.engine.stop());
  el.tBtnStart.addEventListener('click', () => S.engine.seek(0));
  el.tBtnStepBack.addEventListener('click', () => S.engine.seek(S.engine.currentTime - 1.0));
  el.tBtnStepFwd.addEventListener('click', () => S.engine.seek(S.engine.currentTime + 1.0));
  el.tBtnLoop.addEventListener('click', () => {
    const nextLoop = !S.engine.isLooping;
    S.engine.setLoop(nextLoop);
    S.updateLoopButtonUI();
  });

  el.selectSpeed.addEventListener('change', (e) => {
    S.engine.setPlaybackSpeed(Number(e.target.value));
  });

  // Mode Buttons UI
  function updateModeButtonsUI(mode) {
    S.isFreeMove = mode === 'director-fps';
    el.btnModeOrbit.classList.toggle('active', mode === 'director-orbit');
    el.btnModeFps.classList.toggle('active', mode === 'director-fps');
    el.btnModeLens.classList.toggle('active', mode === 'lens-view');
    el.btnModeLens.classList.toggle('active-lens', mode === 'lens-view');
  }

  el.btnModeOrbit.addEventListener('click', () => S.engine.setViewMode('director-orbit'));
  el.btnModeFps.addEventListener('click', () => S.engine.setViewMode('director-fps'));
  el.btnModeLens.addEventListener('click', () => S.engine.setViewMode('lens-view'));

  // View & UI Toggles
  let panelsVisible = true;

  function togglePanels(force = null) {
    panelsVisible = force !== null ? force : !panelsVisible;
    el.leftPanel.style.display = panelsVisible ? 'flex' : 'none';
    el.rightPanel.style.display = panelsVisible ? 'flex' : 'none';
    el.btnTogglePanels.style.color = panelsVisible ? '#fff' : '#64748b';
  }

  el.btnTogglePanels.addEventListener('click', () => S.togglePanels());

  el.btnToggleGrid.addEventListener('click', () => {
    S.grid.visible = !S.grid.visible;
    el.btnToggleGrid.style.color = S.grid.visible ? '#fff' : '#64748b';
  });

  el.btnToggleHelpers.addEventListener('click', () => {
    S.engine.showNodes = !S.engine.showNodes;
    S.engine.showPath = S.engine.showNodes;
    S.engine.rebuildVisuals();
    el.btnToggleHelpers.style.color = S.engine.showNodes ? '#fff' : '#64748b';
  });
  S.updateLoopButtonUI = updateLoopButtonUI;
  S.renderTimelineSegments = renderTimelineSegments;
  S.updateModeButtonsUI = updateModeButtonsUI;
  S.togglePanels = togglePanels;
}
