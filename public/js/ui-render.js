// Right panel, Render tab: frame-accurate WebCodecs export modal.
import { formatTime } from "./utils.js";

export function initRenderUI(S) {
  const el = S.el;
  //  Frame-Accurate Deterministic Video Render Modal & Action
  let currentRenderCancelToken = null;

  el.btnRenderOffline60fps.addEventListener('click', async () => {
    const format = el.selectRenderFormat ? el.selectRenderFormat.value : 'mp4';
    const resolution = el.selectRenderResolution ? el.selectRenderResolution.value : '2k';
    const fps = el.selectRenderFps ? (Number(el.selectRenderFps.value) || 60) : 60;
    const bitrate = el.selectRenderBitrate ? (Number(el.selectRenderBitrate.value) || 80000000) : 80000000;

    el.renderModalOverlay.style.display = 'flex';
    el.renderModalStatus.innerText = `Mempersiapkan render ${resolution.toUpperCase()} @ ${fps}FPS (${format.toUpperCase()})...`;
    el.renderModalProgressBar.style.width = '0%';
    el.renderModalFrameCounter.innerText = 'Frame 0 / 0';
    el.renderModalPercentCounter.innerText = '0%';

    currentRenderCancelToken = await S.engine.renderDeterministic60FPS({
      fps,
      resolution,
      bitrate,
      format,
      onProgress: ({ frame, totalFrames, percent, currentTime, totalDuration, resolution, format: fmtName }) => {
        el.renderModalProgressBar.style.width = `${percent}%`;
        el.renderModalFrameCounter.innerText = `Frame ${frame} / ${totalFrames} • ${resolution.toUpperCase()} @ ${fps}FPS`;
        el.renderModalPercentCounter.innerText = `${percent}%`;
        el.renderModalStatus.innerText = ` Merender [${fmtName}]: ${formatTime(currentTime)} / ${formatTime(totalDuration)}`;
      },
      onComplete: ({ filename, sizeBytes, durationSec, totalFrames, fps: renderedFps }) => {
        const mb = (sizeBytes / (1024 * 1024)).toFixed(2);
        el.renderModalStatus.innerText = ` Selesai! ${filename} (${mb} MB, ${durationSec.toFixed(1)}s @ ${renderedFps}FPS) tersimpan.`;
        el.renderModalProgressBar.style.width = '100%';
        el.renderModalPercentCounter.innerText = '100%';
        setTimeout(() => {
          el.renderModalOverlay.style.display = 'none';
        }, 2000);
      },
      onError: (err) => {
        el.renderModalOverlay.style.display = 'none';
        alert(err.message || 'Render dibatalkan / gagal');
      }
    });
  });

  el.btnRenderModalCancel.addEventListener('click', () => {
    if (currentRenderCancelToken && typeof currentRenderCancelToken.cancel === 'function') {
      currentRenderCancelToken.cancel();
    }
  });

  el.tBtnRecordTour.addEventListener('click', () => {
    el.btnRenderOffline60fps.click();
  });
}
