// Procedural demo scene: used when no GLB model is loaded, so the studio
// runs out of the box with zero binary assets.
export function buildDemoScene(THREE) {
  const group = new THREE.Group();
  group.name = "demo-scene";

  const mat = (color) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05 });

  const add = (geo, color, x, y, z, ry = 0) => {
    const m = new THREE.Mesh(geo, mat(color));
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };

  // Central tower + podium
  add(new THREE.BoxGeometry(60, 14, 60), 0x94a3b8, 0, 7, 0);
  add(new THREE.BoxGeometry(36, 90, 36), 0x64748b, 0, 59, 0);
  add(new THREE.BoxGeometry(40, 6, 40), 0x38bdf8, 0, 107, 0);

  // Side wings
  add(new THREE.BoxGeometry(70, 26, 30), 0x7d8aa0, -75, 13, 20, 0.3);
  add(new THREE.BoxGeometry(70, 26, 30), 0x7d8aa0, 75, 13, -20, -0.3);
  add(new THREE.BoxGeometry(30, 40, 50), 0x94a3b8, -40, 20, -70);

  // Landmark dome
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(18, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
    mat(0x38bdf8)
  );
  dome.position.set(90, 0, 70);
  dome.castShadow = true;
  group.add(dome);

  // Tree cones along the plaza
  for (let i = 0; i < 10; i++) {
    const x = -110 + i * 24;
    add(new THREE.CylinderGeometry(1.2, 1.6, 8, 8), 0x57534e, x, 4, 95);
    add(new THREE.ConeGeometry(6, 16, 10), 0x166534, x, 18, 95);
  }

  return group;
}
