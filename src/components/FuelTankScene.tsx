import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { FlowMeterPayload } from "../hooks/useFlowMeterApi";

interface FuelTankSceneProps {
  latestMessage: FlowMeterPayload | null;
  fillLevel?: number;
  isReceiving?: boolean;
}

export default function FuelTankScene({
  fillLevel = 0.45,
  isReceiving,
}: FuelTankSceneProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef(fillLevel);
  const isReceivingRef = useRef(isReceiving);

  useEffect(() => { fillRef.current = fillLevel; }, [fillLevel]);
  useEffect(() => { isReceivingRef.current = isReceiving; }, [isReceiving]);

  useEffect(() => {
    if (!mountRef.current) return;
    const mount = mountRef.current;
    const W = mount.clientWidth;
    const H = mount.clientHeight;

    // ── Renderer ──
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    mount.appendChild(renderer.domElement);

    // ── Scene ──
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f2f8);

    // ── Camera ──
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
    camera.position.set(7, 3, 7);
    camera.lookAt(0, 0, 0);

    // ── OrbitControls (drag to rotate, scroll to zoom) ──
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 4;
    controls.maxDistance = 18;
    controls.maxPolarAngle = Math.PI * 0.82;
    controls.target.set(0, 0, 0);

    // ── Lights ──
    scene.add(new THREE.AmbientLight(0xffffff, 0.9));

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(6, 10, 6);
    dirLight.castShadow = true;
    scene.add(dirLight);

    const fillLight = new THREE.PointLight(0x4488ff, 0.6, 20);
    fillLight.position.set(-4, 4, -2);
    scene.add(fillLight);

    const accentLight = new THREE.PointLight(0xff8833, 0.4, 14);
    accentLight.position.set(3, -2, 3);
    scene.add(accentLight);

    // ── Ground grid ──
    const grid = new THREE.GridHelper(22, 22, 0xcccccc, 0xdddddd);
    grid.position.y = -2.3;
    scene.add(grid);

    // ── Material helpers ──
    const metalMat = (color: number, rough = 0.25) =>
      new THREE.MeshStandardMaterial({ color, metalness: 0.8, roughness: rough });

    // ── TANK SHELL ──
    const tankGeo = new THREE.CylinderGeometry(1.8, 1.8, 4, 64, 1, true);
    const tankMat = new THREE.MeshStandardMaterial({
      color: 0x3a7abf,
      metalness: 0.6,
      roughness: 0.4,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
    });
    const tank = new THREE.Mesh(tankGeo, tankMat);
    scene.add(tank);

    // Caps
    const capMat = metalMat(0x2e5f8a, 0.3);
    const capGeo = new THREE.CircleGeometry(1.8, 64);
    const topCap = new THREE.Mesh(capGeo, capMat);
    topCap.rotation.x = -Math.PI / 2; topCap.position.y = 2; scene.add(topCap);
    const botCap = new THREE.Mesh(capGeo, capMat);
    botCap.rotation.x = Math.PI / 2; botCap.position.y = -2; scene.add(botCap);

    // Ribs
    const ribMat = metalMat(0x3a6ea5, 0.2);
    [-1.5, 0, 1.5].forEach((y) => {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(1.82, 0.045, 8, 64), ribMat);
      rib.rotation.x = Math.PI / 2; rib.position.y = y; scene.add(rib);
    });

    // ── FUEL LIQUID ──
    const fuelGeo = new THREE.CylinderGeometry(1.75, 1.75, 1, 64);
    const fuelMat = new THREE.MeshStandardMaterial({
      color: 0xcc5500,
      emissive: 0x331100,
      emissiveIntensity: 0.3,
      roughness: 0.4,
      transparent: true,
      opacity: 0.88,
    });
    const fuelMesh = new THREE.Mesh(fuelGeo, fuelMat);
    scene.add(fuelMesh);

    // ── PIPE GEOMETRY ──
    // Pipe material
    const pipeMat = metalMat(0x3a3a3a, 0.3);
    const pipeDim = { r: 0.1, seg: 16 };

    // Helper to add a cylinder pipe
    const addPipe = (rx: number, ry: number, rz: number, px: number, py: number, pz: number, len: number) => {
      const geo = new THREE.CylinderGeometry(pipeDim.r, pipeDim.r, len, pipeDim.seg);
      const mesh = new THREE.Mesh(geo, pipeMat);
      mesh.rotation.set(rx, ry, rz);
      mesh.position.set(px, py, pz);
      scene.add(mesh);
    };

    // Helper to add elbow (torus quarter)
    const addElbow = (px: number, py: number, pz: number, rx: number, ry: number, rz: number) => {
      const geo = new THREE.TorusGeometry(0.28, pipeDim.r, 12, 32, Math.PI / 2);
      const mesh = new THREE.Mesh(geo, pipeMat);
      mesh.rotation.set(rx, ry, rz);
      mesh.position.set(px, py, pz);
      scene.add(mesh);
    };

    // ── PIPE IN (left side) ──
    // Horizontal: from x=-4.5 to x=-2.08 at y=1.4
    // Length = 2.42, center = (-3.29, 1.4, 0)
    const PIPE_IN_HORIZ_LEN = 2.42;
    const PIPE_IN_HORIZ_X = -4.5 + PIPE_IN_HORIZ_LEN / 2; // -3.29
    addPipe(0, 0, Math.PI / 2, PIPE_IN_HORIZ_X, 1.4, 0, PIPE_IN_HORIZ_LEN);

    // Elbow at (-2.08, 1.12, 0): turns right→down
    addElbow(-2.08, 1.12, 0, 0, Math.PI, 0);

    // Vertical: from y=1.12 down to y=-0.05 (enters tank top zone)
    // Length ≈ 1.17, center y = (1.12 + -0.05)/2 ≈ 0.535; x = -1.8 (tank wall)
    const PIPE_IN_VERT_LEN = 1.17;
    addPipe(0, 0, 0, -1.8, 0.535, 0, PIPE_IN_VERT_LEN);

    // Cap at pipe end (flange)
    const flangeMat = metalMat(0x555555, 0.3);
    const flangeGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.06, 16);
    const flangeIn = new THREE.Mesh(flangeGeo, flangeMat);
    flangeIn.position.set(-4.5, 1.4, 0);
    flangeIn.rotation.z = Math.PI / 2;
    scene.add(flangeIn);

    // ── PIPE OUT (right side) ──
    // Vertical: from tank wall, exits at (1.8, -1.4, 0)
    // Goes down: y from -0.6 down to -1.12; x=1.8 (tank wall outer)
    const PIPE_OUT_VERT_LEN = 0.72;
    addPipe(0, 0, 0, 1.8, -0.76, 0, PIPE_OUT_VERT_LEN);

    // Elbow at (2.08, -1.12, 0): turns down→right
    addElbow(2.08, -1.12, 0, 0, Math.PI / 2, -Math.PI / 2);

    // Horizontal: from x=2.08 to x=4.5 at y=-1.4
    const PIPE_OUT_HORIZ_LEN = 2.42;
    const PIPE_OUT_HORIZ_X = 2.08 + PIPE_OUT_HORIZ_LEN / 2; // 3.29
    addPipe(0, 0, Math.PI / 2, PIPE_OUT_HORIZ_X, -1.4, 0, PIPE_OUT_HORIZ_LEN);

    // Cap/flange at right end
    const flangeOut = new THREE.Mesh(flangeGeo, flangeMat);
    flangeOut.position.set(4.5, -1.4, 0);
    flangeOut.rotation.z = Math.PI / 2;
    scene.add(flangeOut);

    // ── PARTICLES ──
    const makeParticles = (count: number, color: number) => {
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(count * 3);
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({
        color,
        size: 0.07,
        transparent: true,
        opacity: 0.9,
        sizeAttenuation: true,
      });
      return new THREE.Points(geo, mat);
    };

    // IN particles: travel along horizontal pipe from x=-4.5 to x=-2.1, then turn down
    const PIN_COUNT = 60;
    const pIn = makeParticles(PIN_COUNT, 0xff8833);
    scene.add(pIn);
    const pInPos = pIn.geometry.attributes.position.array as Float32Array;
    const pInPhase = new Float32Array(PIN_COUNT);
    for (let i = 0; i < PIN_COUNT; i++) {
      pInPhase[i] = Math.random();
      // Init along horizontal pipe
      const t = pInPhase[i];
      pInPos[i * 3] = -4.5 + t * PIPE_IN_HORIZ_LEN;
      pInPos[i * 3 + 1] = 1.4 + (Math.random() - 0.5) * 0.08;
      pInPos[i * 3 + 2] = (Math.random() - 0.5) * 0.08;
    }
    pIn.geometry.attributes.position.needsUpdate = true;

    // OUT particles: travel horizontal from x=2.08 to x=4.5 at y=-1.4
    const POUT_COUNT = 40;
    const pOut = makeParticles(POUT_COUNT, 0x5599ff);
    scene.add(pOut);
    const pOutPos = pOut.geometry.attributes.position.array as Float32Array;
    const pOutPhase = new Float32Array(POUT_COUNT);
    for (let i = 0; i < POUT_COUNT; i++) {
      pOutPhase[i] = Math.random();
      const t = pOutPhase[i];
      pOutPos[i * 3] = 2.08 + t * PIPE_OUT_HORIZ_LEN;
      pOutPos[i * 3 + 1] = -1.4 + (Math.random() - 0.5) * 0.08;
      pOutPos[i * 3 + 2] = (Math.random() - 0.5) * 0.08;
    }
    pOut.geometry.attributes.position.needsUpdate = true;

    // ── Animate ──
    let animFrame = 0;
    const clock = new THREE.Clock();

    const animate = () => {
      animFrame = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();

      controls.update();

      // Fuel fill
      const targetH = Math.max(0.05, fillRef.current * 4);
      fuelMesh.scale.y += (targetH - fuelMesh.scale.y) * 0.025;
      const targetY = -2 + (fuelMesh.scale.y) / 2;
      fuelMesh.position.y += (targetY - fuelMesh.position.y) * 0.025;
      (fuelMat).emissiveIntensity = 0.25 + Math.sin(t * 1.8) * 0.08;

      // IN particles
      const inActive = isReceivingRef.current ?? false;
      const speed = 0.025;
      for (let i = 0; i < PIN_COUNT; i++) {
        const ix = i * 3;
        if (inActive) {
          pInPos[ix] += speed + Math.random() * 0.005;
        }
        // When past elbow area, reset to pipe start
        if (pInPos[ix] > -2.05) {
          pInPhase[i] = Math.random() * 0.3; // spawn near left end
          pInPos[ix] = -4.5 + pInPhase[i] * 0.5;
          pInPos[ix + 1] = 1.4 + (Math.random() - 0.5) * 0.08;
          pInPos[ix + 2] = (Math.random() - 0.5) * 0.08;
        }
      }
      pIn.geometry.attributes.position.needsUpdate = true;
      (pIn.material as THREE.PointsMaterial).opacity = inActive ? 0.9 : 0.15;

      // OUT particles: always flow right
      for (let i = 0; i < POUT_COUNT; i++) {
        const ix = i * 3;
        pOutPos[ix] += 0.02 + Math.random() * 0.004;
        if (pOutPos[ix] > 4.55) {
          pOutPos[ix] = 2.08 + Math.random() * 0.15;
          pOutPos[ix + 1] = -1.4 + (Math.random() - 0.5) * 0.08;
          pOutPos[ix + 2] = (Math.random() - 0.5) * 0.08;
        }
      }
      pOut.geometry.attributes.position.needsUpdate = true;

      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      const w = mount.clientWidth, h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animFrame);
      controls.dispose();
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div
      ref={mountRef}
      id="fuel-tank-canvas"
      style={{ width: "100%", height: "100%", display: "block", cursor: "grab" }}
      title="Drag to rotate · Scroll to zoom"
    />
  );
}
