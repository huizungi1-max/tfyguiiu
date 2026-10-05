import * as THREE from 'three';

/**
 * Procedural studio environment — no HDR download. A dark room with a few
 * large soft panels and thin strip lights: the reflections they produce on
 * dark lacquered metal are what gives the plates their gradients and edges.
 */
export function createStudioEnvironment(renderer: THREE.WebGLRenderer, size: number): THREE.Texture {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  // Room with a vertical gradient: slightly lifted floor bounce, darker ceiling corners.
  const roomGeo = new THREE.SphereGeometry(30, 32, 16);
  const roomMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {},
    vertexShader: /* glsl */ `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `varying vec3 vP; void main(){
      float h = normalize(vP).y;
      vec3 c = mix(vec3(0.010,0.010,0.012), vec3(0.030,0.030,0.034), smoothstep(-0.2, 0.6, h));
      c += vec3(0.02,0.018,0.016) * smoothstep(-0.05,-0.6,h);
      gl_FragColor = vec4(c,1.0);
    }`,
  });
  scene.add(new THREE.Mesh(roomGeo, roomMat));

  /** Softbox with a soft falloff toward its edges (so reflections are gradients, not hard rectangles). */
  const softbox = (w: number, h: number, intensity: number, color: THREE.ColorRepresentation = 0xffffff, falloff = 0.45) => {
    const c = new THREE.Color(color).multiplyScalar(intensity);
    const m = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: { uC: { value: c }, uF: { value: falloff } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `uniform vec3 uC; uniform float uF; varying vec2 vUv; void main(){
        vec2 d = abs(vUv - 0.5) * 2.0;
        float e = (1.0 - smoothstep(1.0 - uF, 1.0, d.x)) * (1.0 - smoothstep(1.0 - uF, 1.0, d.y));
        gl_FragColor = vec4(uC * e, 1.0);
      }`,
    });
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  };

  const place = (m: THREE.Mesh, x: number, y: number, z: number) => {
    m.position.set(x, y, z);
    m.lookAt(0, m.position.y * 0.35, 0);
    scene.add(m);
    return m;
  };

  // Key: big overhead softbox, slightly forward — the long gradient across top faces.
  const top = softbox(22, 12, 1.25, 0xffffff, 0.6);
  top.position.set(-3, 14, 2);
  top.lookAt(0, 0, 0);
  scene.add(top);

  // Large vertical softbox front-right: sweeps across vertical faces.
  place(softbox(9, 16, 1.0, 0xfff6ee, 0.7), 14, 3, 12);

  // Tall thin strips — crisp edge highlights from left and right-back.
  place(softbox(0.9, 18, 7.0, 0xffffff, 0.25), -16, 2, 5);
  place(softbox(0.7, 16, 4.5, 0xf2f5ff, 0.25), 15, 4, -9);

  // Horizontal strip far behind — rim along far edges.
  place(softbox(30, 0.6, 4.0, 0xffffff, 0.3), 0, 5, -22);

  // Low warm kicker — a hint of warmth in lower reflections.
  place(softbox(12, 0.5, 1.8, 0xffb184, 0.3), 8, -6, 18);

  // Dim front fill.
  place(softbox(16, 8, 0.18, 0xffffff, 0.8), -4, 3, 22);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(scene, 0.02, 0.1, 100, { size });
  pmrem.dispose();
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
  });
  return rt.texture;
}

/** Fine "brushed" roughness texture, generated once. */
export function createBrushedTexture(size = 512): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    const base = Math.random();
    let v = base;
    for (let x = 0; x < size; x++) {
      v += (Math.random() - 0.5) * 0.05;
      v = v * 0.985 + base * 0.015;
      const g = Math.max(0, Math.min(255, 160 + (v - 0.5) * 36 + (Math.random() - 0.5) * 6));
      const i = (y * size + x) * 4;
      img.data[i] = g;
      img.data[i + 1] = g;
      img.data[i + 2] = g;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Soft radial falloff used for contact shadows and glows. */
export function createRadialTexture(size = 128, power = 2.2): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size - 0.5;
      const dy = (y + 0.5) / size - 0.5;
      const d = Math.min(1, Math.sqrt(dx * dx + dy * dy) * 2);
      const a = Math.pow(1 - d, power);
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}
