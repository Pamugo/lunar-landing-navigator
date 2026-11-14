import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { TerrainPatch, VisibilitySample } from "../types/contracts";
import type { AppMode } from "./HeaderHUD";

export interface Terrain3DProps {
  patch: TerrainPatch | null;
  currentSample: VisibilitySample | null;
  mode: AppMode;
}

export function Terrain3D({ patch, currentSample, mode }: Terrain3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sunLightRef = useRef<THREE.DirectionalLight | null>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container || !patch) return;

    const width = container.clientWidth || 480;
    const height = container.clientHeight || 380;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 200);
    camera.position.set(0, 14, 18);
    camera.lookAt(0, 0, 0);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return;
    }

    const isMobile = window.innerWidth < 768;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2.0));
    renderer.setSize(width, height);
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0x334155, 0.85);
    scene.add(ambient);

    const sunLight = new THREE.DirectionalLight(0xfef08a, 2.4);
    sunLight.position.set(12, 8, 10);
    scene.add(sunLight);
    sunLightRef.current = sunLight;

    // Construir malla de terreno a partir de patch.elevations_m (grid_size x grid_size)
    const n = patch.grid_size;
    const spanUnits = 16.0;
    const geo = new THREE.PlaneGeometry(spanUnits, spanUnits, n - 1, n - 1);
    geo.rotateX(-Math.PI / 2);

    const posAttr = geo.attributes.position;
    const colors: number[] = [];
    const minEl = patch.min_elevation_m;
    const maxEl = Math.max(minEl + 100.0, patch.max_elevation_m);
    const scaleY = 2.6 / Math.max(800.0, maxEl - minEl);

    if (posAttr) {
      for (let i = 0; i < posAttr.count; i++) {
        const row = Math.floor(i / n);
        const col = i % n;
        const elev = patch.elevations_m[row]?.[col] ?? patch.site_elevation_m;
        const y = (elev - patch.site_elevation_m) * scaleY;
        posAttr.setY(i, y);

        const t = Math.max(0, Math.min(1, (elev - minEl) / (maxEl - minEl)));
        // Hipsometria lunar sobria: azul pizarra oscuro (crateres PSR) -> gris claro/ambar (crestas iluminadas)
        const r = 0.16 + 0.58 * t;
        const g = 0.22 + 0.56 * t;
        const b = 0.34 + 0.48 * t;
        colors.push(r, g, b);
      }
      posAttr.needsUpdate = true;
      geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      geo.computeVertexNormals();
    }

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.88,
      metalness: 0.08,
      flatShading: false,
    });
    const terrainMesh = new THREE.Mesh(geo, mat);
    scene.add(terrainMesh);

    // Marcador de mastil del observador (CSA Rover / CLPS Lander) en el centro (0, 0)
    const mastHeightUnits = 0.4 + patch.site.observer_height_m * 0.22;
    const mastGeo = new THREE.CylinderGeometry(0.08, 0.08, mastHeightUnits, 12);
    const mastMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const mastMesh = new THREE.Mesh(mastGeo, mastMat);
    mastMesh.position.set(0, mastHeightUnits / 2, 0);
    scene.add(mastMesh);

    const beaconGeo = new THREE.SphereGeometry(0.22, 16, 16);
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24 });
    const beacon = new THREE.Mesh(beaconGeo, beaconMat);
    beacon.position.set(0, mastHeightUnits, 0);
    scene.add(beacon);

    let yaw = 0.45;
    let pitch = 0.58;
    let dist = 19.5;
    let isDragging = false;
    let prevX = 0;
    let prevY = 0;

    const dom = renderer.domElement;
    const onDown = (e: PointerEvent) => {
      isDragging = true;
      prevX = e.clientX;
      prevY = e.clientY;
    };
    const onMove = (e: PointerEvent) => {
      if (!isDragging) return;
      yaw -= (e.clientX - prevX) * 0.008;
      pitch = Math.max(0.15, Math.min(1.45, pitch + (e.clientY - prevY) * 0.008));
      prevX = e.clientX;
      prevY = e.clientY;
    };
    const onUp = () => {
      isDragging = false;
    };

    dom.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);

    let animId = 0;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      camera.position.set(
        dist * Math.cos(pitch) * Math.sin(yaw),
        dist * Math.sin(pitch),
        dist * Math.cos(pitch) * Math.cos(yaw),
      );
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      dom.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      geo.dispose();
      mat.dispose();
      mastGeo.dispose();
      mastMat.dispose();
      beaconGeo.dispose();
      beaconMat.dispose();
      renderer.dispose();
    };
  }, [patch]);

  useEffect(() => {
    if (!currentSample || !sunLightRef.current) return;
    const az = (currentSample.sun.azimuth_deg * Math.PI) / 180.0;
    const el = Math.max(0.04, (currentSample.sun.elevation_deg * Math.PI) / 180.0);
    const r = 24.0;
    sunLightRef.current.position.set(
      r * Math.cos(el) * Math.sin(az),
      r * Math.sin(el),
      -r * Math.cos(el) * Math.cos(az),
    );
  }, [currentSample]);

  if (!patch) {
    return (
      <div className="viewport-stage" style={{ display: "grid", placeItems: "center" }}>
        <span className="mono-telemetry">Cargando malla topográfica 3D LOLA...</span>
      </div>
    );
  }

  return (
    <div className="viewport-stage" aria-label="Superficie topografica 3D local LOLA">
      <div className="viewport-overlay-top">
        <span className="hud-pill mono-telemetry">
          Malla 3D: {patch.grid_size}×{patch.grid_size} ({patch.step_m.toFixed(0)} m/celda · ±{patch.half_extent_km} km)
        </span>
        <span className="hud-pill mono-telemetry">
          Rango DEM: [{patch.min_elevation_m.toFixed(0)} m, {patch.max_elevation_m.toFixed(0)} m]
        </span>
      </div>

      <div ref={mountRef} style={{ width: "100%", height: "100%" }} />

      <div className="viewport-overlay-bottom">
        <span className="hud-pill">
          Mástil activo: <strong className="mono-telemetry">{patch.site.observer_height_m.toFixed(1)} m</strong>
        </span>
        <span className="hud-pill">
          {mode === "edu"
            ? "Las zonas azules son cráteres profundos; las doradas son cumbres iluminadas"
            : `Fuente: ${patch.dem_product} (${patch.horizon_source})`}
        </span>
      </div>
    </div>
  );
}
