// Left panel: camera node list, add/reset, import/export, presets.
import { DEFAULT_NODES } from "../cinematic-engine.js";

export function initNodesUI(S) {
  const el = S.el;
  // Render Node List UI in Left Panel
  function renderNodesList() {
    el.nodesListContainer.innerHTML = '';
    el.nodesCountBadge.innerText = `${S.engine.nodes.length} Nodes`;

    S.engine.nodes.forEach((n, idx) => {
      const isSelected = idx === S.engine.selectedIndex;
      const card = document.createElement('div');
      card.className = `node-card ${isSelected ? 'selected' : ''}`;

      const dur = Number(n.durationSec) || 4.0;
      const presetName = n.curve?.preset || 'ease-in-out';
      const isLastNode = idx === S.engine.nodes.length - 1;
      const isEndPoint = !S.engine.isLooping && isLastNode;

      const durationBadge = isEndPoint
        ? `<span class="pill highlight" style="color: #facc15; border-color: rgba(250, 204, 21, 0.4); font-weight: 700;">Finish</span>`
        : `<div class="node-inline-dur-wrap" title="Ubah durasi segmen langsung">
            <span>Dur:</span>
            <input type="number" step="0.1" min="0.2" max="120" class="node-inline-dur-input" value="${dur}" data-index="${idx}">
            <span>s</span>
          </div>`;

      card.innerHTML = `
        <div class="node-card-top">
          <div class="node-number-badge">${idx + 1}</div>
          <input type="text" class="node-name-input" value="${n.name}" data-index="${idx}">
        </div>
        <div class="node-card-meta">
          <span style="font-family: monospace; font-size: 10px;">[${n.pos[0]}, ${n.pos[1]}, ${n.pos[2]}]</span>
          <div class="node-pills">
            ${durationBadge}
            <span class="pill">${presetName}</span>
          </div>
        </div>
        <div class="node-card-actions">
          <button class="mini-btn btn-look-node" data-index="${idx}" title="Lihat dari sudut ini">Jump</button>
          <button class="mini-btn btn-sync-node" data-index="${idx}" title="Timpa dengan sudut view kamera saat ini">Sync</button>
          <button class="mini-btn btn-up-node" data-index="${idx}" title="Geser Urutan Naik">▲</button>
          <button class="mini-btn btn-down-node" data-index="${idx}" title="Geser Urutan Turun">▼</button>
          <button class="mini-btn btn-dup-node" data-index="${idx}" title="Duplikat Node">Dup</button>
          <button class="mini-btn danger btn-del-node" data-index="${idx}" title="Hapus Node">Del</button>
        </div>
      `;

      // Card click
      card.addEventListener('click', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
        S.engine.selectNode(idx);
      });

      // Name input edit
      const nameInput = card.querySelector('.node-name-input');
      nameInput.addEventListener('change', (e) => {
        S.engine.updateNodeProperty(idx, 'name', e.target.value);
      });

      // Inline Duration input edit
      const durInput = card.querySelector('.node-inline-dur-input');
      if (durInput) {
        durInput.addEventListener('click', (e) => e.stopPropagation());
        durInput.addEventListener('change', (e) => {
          const val = Number(parseFloat(e.target.value).toFixed(1)) || 4.0;
          S.engine.updateNodeProperty(idx, 'durationSec', Math.max(0.2, val));
          S.syncInspectorWithSelectedNode();
          S.renderTimelineSegments();
        });
      }

      // Action buttons
      card.querySelector('.btn-look-node').addEventListener('click', () => S.engine.snapCameraToNode(idx));
      card.querySelector('.btn-sync-node').addEventListener('click', () => S.engine.updateNodeFromCurrentView(idx));
      card.querySelector('.btn-up-node').addEventListener('click', () => S.engine.moveNode(idx, Math.max(0, idx - 1)));
      card.querySelector('.btn-down-node').addEventListener('click', () => S.engine.moveNode(idx, Math.min(S.engine.nodes.length - 1, idx + 1)));
      card.querySelector('.btn-dup-node').addEventListener('click', () => S.engine.duplicateNode(idx));
      card.querySelector('.btn-del-node').addEventListener('click', () => S.engine.deleteNode(idx));

      el.nodesListContainer.appendChild(card);
    });
  }

  // Add / Reset Nodes
  el.btnAddNode.addEventListener('click', () => S.engine.addNodeFromCurrentView());
  el.btnResetTrack.addEventListener('click', () => {
    if (confirm('Reset track to default?')) {
      S.engine.setNodes(DEFAULT_NODES);
    }
  });

  // Import / Export JSON
  el.btnExportJson.addEventListener('click', () => S.engine.exportJSON());
  el.btnImportJson.addEventListener('click', () => el.jsonFileInput.click());
  el.jsonFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      S.engine.importJSON(event.target.result);
    };
    reader.readAsText(file);
  });

  // Presets Modal / Menu
  el.btnPresets.addEventListener('click', () => {
    const choice = prompt(
      "Pilih Preset Lintasan Sinematik:\n" +
      "1. Grand Tour (Entrance, Center, Wing, Drone)\n" +
      "2. 360 Drone Orbit (Orbit Around Model)\n" +
      "3. Low-Angle Walkthrough (Jalan Kaki Dramatis)",
      "1"
    );
    if (choice === "1") {
      S.engine.setNodes(DEFAULT_NODES);
    } else if (choice === "2") {
      S.engine.setNodes([
        { id: 'orb_1', name: 'Drone Orbit Utara', pos: [0, 140, 200], target: [0, 0, 0], fov: 50, durationSec: 4.5, curve: { preset: 'ease-in-out', p1: [0.42, 0.0], p2: [0.58, 1.0] } },
        { id: 'orb_2', name: 'Drone Orbit Timur', pos: [200, 140, 0], target: [0, 0, 0], fov: 50, durationSec: 4.5, curve: { preset: 'ease-in-out', p1: [0.42, 0.0], p2: [0.58, 1.0] } },
        { id: 'orb_3', name: 'Drone Orbit Selatan', pos: [0, 140, -200], target: [0, 0, 0], fov: 50, durationSec: 4.5, curve: { preset: 'ease-in-out', p1: [0.42, 0.0], p2: [0.58, 1.0] } },
        { id: 'orb_4', name: 'Drone Orbit Barat', pos: [-200, 140, 0], target: [0, 0, 0], fov: 50, durationSec: 4.5, curve: { preset: 'ease-in-out', p1: [0.42, 0.0], p2: [0.58, 1.0] } }
      ]);
    } else if (choice === "3") {
      S.engine.setNodes([
        { id: 'walk_1', name: 'Entrance Eye-Level', pos: [110, 15, 180], target: [0, 15, 0], fov: 45, durationSec: 4.0, curve: { preset: 'smooth-step', p1: [0.25, 0.1], p2: [0.25, 1.0] } },
        { id: 'walk_2', name: 'Center Field', pos: [20, 15, 60], target: [-30, 20, -30], fov: 50, durationSec: 5.0, curve: { preset: 'slow-mo', p1: [0.8, 0.05], p2: [0.2, 0.95] } },
        { id: 'walk_3', name: 'Side Corner', pos: [-100, 15, 0], target: [20, 15, 50], fov: 55, durationSec: 4.5, curve: { preset: 'ease-out', p1: [0.0, 0.0], p2: [0.58, 1.0] } }
      ]);
    }
  });
  S.renderNodesList = renderNodesList;
}
