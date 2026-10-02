// UI composition: curve editor + all panels. Call once before engine init.
import { InteractiveCurveEditor } from "../curve-editor.js";
import { initNodesUI } from "./ui-nodes.js";
import { initInspectorUI } from "./ui-inspector.js";
import { initTimelineUI } from "./ui-timeline.js";
import { initEnvUI } from "./ui-env.js";
import { initRenderUI } from "./ui-render.js";

export function initUI(S) {
  const el = S.el;

  S.curveEditor = new InteractiveCurveEditor(el.curveCanvas, (curveData) => {
    if (!S.engine) return;
    const idx = S.engine.selectedIndex;
    if (idx >= 0 && idx < S.engine.nodes.length) {
      S.engine.nodes[idx].curve = curveData;
      el.labelCurveType.innerText = curveData.preset !== "custom" ? curveData.preset : "Custom Bezier";
      S.updatePresetPillsActive(curveData.preset);
      S.engine.saveToLocalStorage();
    }
  });

  initNodesUI(S);
  initInspectorUI(S);
  initTimelineUI(S);
  initEnvUI(S);
  initRenderUI(S);
}
