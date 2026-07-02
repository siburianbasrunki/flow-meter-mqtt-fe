import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { Water } from "three/examples/jsm/objects/Water.js";

// Indonesia bounds (equirectangular UV remap on a world texture)
const LON_MIN = 94;
const LON_MAX = 142;
const LAT_MIN = -12;
const LAT_MAX = 8;
const U_MIN = (LON_MIN + 180) / 360;
const U_MAX = (LON_MAX + 180) / 360;
const V_MIN = (LAT_MIN + 90) / 180;
const V_MAX = (LAT_MAX + 90) / 180;

// Real-world km per degree (~111 at equator). Use this to set plane aspect.
const PLANE_WIDTH = (LON_MAX - LON_MIN) * 0.3; // ~14.4 units
const PLANE_HEIGHT = (LAT_MAX - LAT_MIN) * 0.3; // ~6 units
const SEGMENTS_X = 600;
const SEGMENTS_Y = 260;
const DISPLACEMENT = 1.1; // vertical exaggeration

export default function IndonesiaMap3D() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

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
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;
    mount.appendChild(renderer.domElement);

    // ── Scene ──
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xc7d8e8, 28, 70);

    // ── Camera ──
    const camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 500);
    camera.position.set(0, 8, 14);

    // ── OrbitControls ──
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 5;
    controls.maxDistance = 40;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.target.set(0, 0, 0);
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.35;

    // ── Sun (DirectionalLight) ──
    const sun = new THREE.DirectionalLight(0xfff2d6, 2.4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 60;
    sun.shadow.camera.left = -15;
    sun.shadow.camera.right = 15;
    sun.shadow.camera.top = 10;
    sun.shadow.camera.bottom = -10;
    sun.shadow.bias = -0.0005;
    scene.add(sun);

    const sunSphericalDist = 30;
    const sunPhi = THREE.MathUtils.degToRad(90 - 40); // elevation from horizon
    const sunTheta = THREE.MathUtils.degToRad(150); // azimuth
    const sunPos = new THREE.Vector3().setFromSphericalCoords(sunSphericalDist, sunPhi, sunTheta);
    sun.position.copy(sunPos);

    // ── Ambient + Hemisphere ──
    scene.add(new THREE.AmbientLight(0xb8d4f0, 0.35));
    const hemi = new THREE.HemisphereLight(0xa8c8f0, 0x223344, 0.5);
    scene.add(hemi);

    // ── Sky ──
    const sky = new Sky();
    sky.scale.setScalar(450);
    scene.add(sky);
    const skyUniforms = sky.material.uniforms;
    skyUniforms["turbidity"].value = 4;
    skyUniforms["rayleigh"].value = 1.6;
    skyUniforms["mieCoefficient"].value = 0.005;
    skyUniforms["mieDirectionalG"].value = 0.8;
    const sunDirNorm = sunPos.clone().normalize();
    skyUniforms["sunPosition"].value.copy(sunDirNorm);

    // ── Loading ──
    const loader = new THREE.TextureLoader();
    const loadTex = (url: string) =>
      new Promise<THREE.Texture>((resolve, reject) => {
        loader.load(url, resolve, undefined, (err) => reject(err));
      });

    let animFrame = 0;
    let water: Water | null = null;
    let terrain: THREE.Mesh | null = null;
    const clock = new THREE.Clock();
    let disposed = false;

    Promise.all([
      loadTex("/textures/earth_color.jpg"),
      loadTex("/textures/earth_height.jpg"),
      loadTex("/textures/earth_normal.jpg"),
      loadTex("/textures/earth_specular.jpg"),
      loadTex("/textures/water_normal.jpg"),
    ])
      .then(([colorTex, heightTex, normalTex, specTex, waterNormalTex]) => {
        if (disposed) return;

        [colorTex, heightTex, normalTex, specTex].forEach((t) => {
          t.colorSpace = t === colorTex ? THREE.SRGBColorSpace : THREE.NoColorSpace;
          t.wrapS = THREE.ClampToEdgeWrapping;
          t.wrapT = THREE.ClampToEdgeWrapping;
          t.anisotropy = renderer.capabilities.getMaxAnisotropy();
        });

        // ── Terrain plane (displaced by world heightmap, UVs cropped to Indonesia) ──
        const terrainGeo = new THREE.PlaneGeometry(
          PLANE_WIDTH,
          PLANE_HEIGHT,
          SEGMENTS_X,
          SEGMENTS_Y
        );
        // Remap UVs to Indonesia region
        const uvAttr = terrainGeo.attributes.uv;
        for (let i = 0; i < uvAttr.count; i++) {
          const u = uvAttr.getX(i);
          const v = uvAttr.getY(i);
          uvAttr.setX(i, U_MIN + u * (U_MAX - U_MIN));
          uvAttr.setY(i, V_MIN + v * (V_MAX - V_MIN));
        }
        uvAttr.needsUpdate = true;

        const terrainMat = new THREE.MeshStandardMaterial({
          map: colorTex,
          normalMap: normalTex,
          normalScale: new THREE.Vector2(0.8, 0.8),
          displacementMap: heightTex,
          displacementScale: DISPLACEMENT,
          displacementBias: -0.02,
          roughnessMap: specTex,
          roughness: 1.0,
          metalness: 0.0,
        });
        terrain = new THREE.Mesh(terrainGeo, terrainMat);
        terrain.rotation.x = -Math.PI / 2;
        terrain.position.y = 0;
        terrain.castShadow = true;
        terrain.receiveShadow = true;
        scene.add(terrain);

        // ── Realistic Water ──
        const waterGeo = new THREE.PlaneGeometry(120, 120);
        waterNormalTex.wrapS = waterNormalTex.wrapT = THREE.RepeatWrapping;
        water = new Water(waterGeo, {
          textureWidth: 512,
          textureHeight: 512,
          waterNormals: waterNormalTex,
          sunDirection: sunDirNorm.clone(),
          sunColor: 0xfff2d6,
          waterColor: 0x0b3d66,
          distortionScale: 2.2,
          fog: true,
        });
        water.rotation.x = -Math.PI / 2;
        water.position.y = 0.02;
        scene.add(water);

        setLoading(false);
      })
      .catch((err) => {
        console.error("[IndonesiaMap3D] texture load failed:", err);
        setLoadError("Failed to load 3D textures.");
        setLoading(false);
      });

    // ── Animate ──
    const animate = () => {
      animFrame = requestAnimationFrame(animate);
      const dt = clock.getDelta();
      controls.update();
      if (water) {
        (water.material as THREE.ShaderMaterial).uniforms["time"].value += dt * 0.6;
      }
      renderer.render(scene, camera);
    };
    animate();

    // ── Stop autorotate on user interaction ──
    const onUserStart = () => { controls.autoRotate = false; };
    renderer.domElement.addEventListener("pointerdown", onUserStart);
    renderer.domElement.addEventListener("wheel", onUserStart, { passive: true });

    // ── Resize ──
    const handleResize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      disposed = true;
      window.removeEventListener("resize", handleResize);
      renderer.domElement.removeEventListener("pointerdown", onUserStart);
      renderer.domElement.removeEventListener("wheel", onUserStart);
      cancelAnimationFrame(animFrame);
      controls.dispose();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose?.();
          const m = obj.material;
          if (Array.isArray(m)) m.forEach((mm) => mm.dispose());
          else m?.dispose?.();
        }
      });
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div className="indonesia-map-wrap">
      <div
        ref={mountRef}
        className="indonesia-map-canvas"
        title="Drag to rotate · Scroll to zoom"
      />
      {loading && !loadError && (
        <div className="indonesia-map-overlay">
          <div className="indonesia-map-spinner" />
          <div>Loading terrain…</div>
        </div>
      )}
      {loadError && (
        <div className="indonesia-map-overlay indonesia-map-error">{loadError}</div>
      )}
      <div className="indonesia-map-hint">
        <span>Drag to rotate</span>
        <span>·</span>
        <span>Scroll to zoom</span>
      </div>
    </div>
  );
}
