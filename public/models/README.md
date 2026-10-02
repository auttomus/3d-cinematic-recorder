# Models directory (served statically)

Put your own `.glb` / `.gltf` files here, then open:

```
http://localhost:8085/index.html?model=models/your-model.glb
```

or pick them from the Model dropdown (add an `<option value="models/your-model.glb">`
in `public/index.html`).

Without any model the studio boots into a procedural demo scene, so the repo
ships zero binary assets. `*.glb` files are git-ignored on purpose — do not
commit large models.
