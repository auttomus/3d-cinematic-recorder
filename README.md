# 3d-cinematic-recorder

Studio kamera sinematik berbasis browser untuk model GLB/Three.js apa pun.
Susun node kamera di viewport 3D, atur kurva kecepatan Bezier per segmen,
preview lewat lensa, lalu export video (WebCodecs MP4/WebM) atau rekam
headless via Puppeteer + FFmpeg.

<img width="1856" height="961" alt="Image" src="https://github.com/user-attachments/assets/c5b98cc6-15e6-4bd7-9ae8-d47f2821419d" />

## 1. Requirements

| Kebutuhan | Wajib untuk | Keterangan |
|---|---|---|
| Node.js 18+ | semua | dicek: `node --version` (repo ini dites di Node 26) |
| Browser modern + WebGL | studio | Chrome/Edge/Firefox terbaru |
| WebCodecs (`VideoEncoder`) | export dari browser | Chrome/Edge 94+. Tanpa ini export fallback ke MediaRecorder WebM |
| `ffmpeg` di PATH | rekam headless | dicek: `ffmpeg -version` (tes: 8.0.1). Tidak perlu untuk studio/export browser |
| Koneksi internet | studio | Three.js + decoder Draco dimuat dari CDN |

Instal ffmpeg (Ubuntu/Debian): `sudo apt install ffmpeg`.

## 2. Instalasi

```bash
cd threejs-cinematic-recorder
npm install
```

Satu-satunya dependency adalah `puppeteer` (headless recorder). Saat install,
npm menanyakan `allow-scripts` untuk postinstall puppeteer — setujui agar
Chromium ikut terdownload:

```bash
npm approve-scripts --allow-scripts-pending
```

Verifikasi Chromium tersedia (biarkan gagal dengan pesan jelas kalau belum):

```bash
node -e "const p=require('puppeteer'); console.log(p.executablePath())"
```

## 3. Menjalankan studio

```bash
npm run serve
# Serving .../public
# Studio: http://localhost:8085/index.html
```

Buka URL itu di browser. Tanpa model apa pun studio langsung menampilkan
demo scene prosedural (menara + sayap + plaza).

Port bisa diganti: `node tools/serve.mjs --port 8099 --dir public`.

## 4. Memakai model sendiri

Tiga cara, dari yang paling mudah:

1. **Upload dari browser** — dropdown Model → `Load custom GLB file...`
   (file tidak tersimpan di server, hanya di sesi itu).
2. **Query param** — taruh file di `public/models/`, lalu buka
   `http://localhost:8085/index.html?model=models/namamu.glb`.
3. **Opsi permanen di dropdown** — tambah satu baris `<option>` di
   `public/index.html` menunjuk ke file di `public/models/`.

Catatan: `*.glb`/`*.gltf` di-gitignore agar repo tetap ringan — jangan commit
model besar. Lihat `public/models/README.md`. Model ber-Draco/Meshopt
didukung (decoder otomatis).

## 5. Alur kerja di browser

**Panel kiri (Camera Nodes):** orbit bebas untuk menata sudut → klik
**Add Node From Current View**. Klik kartu node untuk memilih; Jump melompat
ke sudutnya, Sync menimpa node dengan view kamera saat ini. Minimal 2 node.

**Panel kanan:**
- **Transform** — posisi kamera, target LookAt, FOV. `Face Path Forward`
  menghadapkan kamera searah jalur (mode drone POV).
- **Curve** — durasi segmen (slider, stepper, preset, skala global, pas total,
  auto dari jarak), editor grafik Bezier + preset easing, model lintasan
  (curve/linear), tension, kunci anti-tembus-tanah.
- **Environment** — sky preset, warna backdrop, mode/warna lantai.
- **Shaders** — master switch, bloom, exposure, tone mapping
  (matikan saat menata track agar FPS ringan).
- **Render** — format (MP4/WebM), resolusi (720p–4K), fps (30/60),
  bitrate, lalu **Render Cinematic Video**. Hasil presisi frame-accurate
  dan otomatis terdownload.

**Dock bawah:** transport (start/mundur/play/maju/stop/loop, kecepatan
0.5–2x), timecode, badge spot aktif, scrubber timeline yang bisa diklik-drag,
tombol **Record Tour** (jalan pintas ke Render).

**Mode kamera:** Director Orbit (bebas + gizmo), Free Fly FPS
(WASD + Space/E naik + Q/Shift turun), Lens View (preview + playback).

**Shortcut:** Spasi play/pause, 1/2/3 ganti mode, K tambah node,
H sembunyikan panel, L loop, Delete hapus node.

**Project:** header punya Export JSON / Import (format v2
`{nodes, environment, shaders, settings}`, backward-compatible dengan array
waypoint v1). Project juga auto-save ke localStorage browser.

## 6. Rekam headless (Puppeteer + FFmpeg)

Server harus jalan dulu (`npm run serve`).

```bash
node tools/record-headless.mjs --help
node tools/record-headless.mjs --out ./tour.mp4
node tools/record-headless.mjs examples/tracks/default.json \
  --width 1280 --height 720 --fps 30 --out ./tour-720p.mp4
node tools/record-headless.mjs \
  --url "http://localhost:8085/index.html?model=models/namamu.glb" \
  --out ./tour.mp4 --crf 20 --preset slow
```

| Flag | Default | Arti |
|---|---|---|
| `track.json` (positional) / `--track` | `examples/tracks/default.json` | file track |
| `--url` | `http://localhost:8085/index.html` | URL studio |
| `--out` | `./cinematic-tour.mp4` | file output |
| `--width / --height` | `1920 / 1080` | resolusi |
| `--fps` | `60` | frame per detik |
| `--crf` | `18` | kualitas x264 (0–51, kecil = bagus) |
| `--preset` | `fast` | preset x264 (`ultrafast..veryslow`) |
| `--chrome` | Chromium bawaan puppeteer | override executable Chrome |

Cara kerja: Chrome headless membuka studio, memuat track via
`window.startScriptedTour`, lalu setiap frame di-set via
`window.setTourProgress`, screenshot PNG di-pipe ke FFmpeg → MP4 H.264.

## 7. Format track JSON

Array minimal 2 waypoint (atau format project v2):

```json
[
  {
    "name": "1. Entrance Overview",
    "pos": [120, 25, 200],
    "target": [0, 15, 0],
    "fov": 50,
    "durationSec": 4.5,
    "curve": { "preset": "ease-in-out", "p1": [0.42, 0.0], "p2": [0.58, 1.0] }
  }
]
```

Preset curve: `linear, ease-in-out, ease-in, ease-out, slow-mo, snappy,
smooth-step, anticipate` (atau `custom` dari editor). Contoh siap pakai:
`examples/tracks/default.json`.

## 8. Troubleshooting

- **Halaman loading terus** — cek console browser; biasanya CDN Three.js
  tidak reachable atau file `?model=` salah path. Coba tanpa `?model=`
  (demo scene harus selalu muncul).
- **`Failed to load 3D model`** — path relatif terhadap `public/`;
  pastikan file ada di `public/models/` dan nama persis.
- **Export browser gagal / fallback WebM** — browser tanpa WebCodecs;
  pakai Chrome/Edge terbaru, atau pakai jalur headless.
- **`Recording failed` / FFmpeg exit code** — pastikan `ffmpeg` di PATH
  dan folder output bisa ditulis.
- **Puppeteer tidak bisa launch Chrome** — postinstall belum di-approve
  (lihat bagian 2) atau butuh flag `--chrome /path/ke/chrome`.
- **Render 4K berat / lama** — wajar; turunkan ke 1080p/720p dulu untuk test.

## 9. Struktur

```
public/
  index.html              # app shell / markup saja (tanpa logika inline)
  cinematic-engine.js     # spline Catmull-Rom, gizmo 3D, WebCodecs renderer
  curve-editor.js         # editor kurva Bezier + BezierSolver
  cinematic-studio.css    # tema studio
  js/
    app.js                # entry: scene, engine, keyboard, main loop
    ui.js                 # komposisi UI (dipanggil sekali sebelum engine init)
    ui-nodes.js           # panel kiri: daftar node, add/reset, import/export
    ui-inspector.js       # panel kanan: transform + curve
    ui-timeline.js        # dock bawah: transport, scrubber, mode kamera
    ui-env.js             # tab environment/shader + sinkronisasi project
    ui-render.js          # tab render: modal export WebCodecs
    models.js             # loader GLB (Draco+Meshopt) + fallback demo
    demo-scene.js         # demo prosedural (pengganti model contoh)
    utils.js              # formatTime + kolektor elemen DOM
  vendor/
    mp4-muxer.mjs, webm-muxer.mjs
  models/                 # taruh .glb sendiri di sini (di-gitignore)
tools/
  serve.mjs               # static server tanpa dependensi
  record-headless.mjs     # perekam Puppeteer + FFmpeg (CLI)
examples/
  tracks/default.json     # track contoh (sama dengan DEFAULT_NODES)
```

## 10. Batasan

- Three.js dan decoder Draco diambil dari CDN — studio butuh internet.
- Render browser tergantung GPU; 4K/60fps butuh mesin kuat, headless
  screenshot-per-frame lebih lambat tapi deterministik.
- Track JSON dari versi lama (array polos) tetap bisa diimpor.

## Lisensi

MIT — lihat `LICENSE`.
