import { useEffect, useRef, useState } from "react";
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
  const [terrainShaderMode, setTerrainShaderMode] = useState<"regolith" | "hypsometric">("regolith");

  useEffect(() => {
    const container = mountRef.current;
    if (!container || !patch) return;

    const width = container.clientWidth || 480;
    const height = container.clientHeight || 380;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 200);
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
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    // Iluminacion de entorno espacial (faint earthshine)
    const ambient = new THREE.AmbientLight(0x1e293b, 0.35);
    scene.add(ambient);

    // Luz solar directa con proyeccion de sombras reales
    const sunLight = new THREE.DirectionalLight(0xfffaea, 3.0);
    sunLight.position.set(12, 6, 12);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = isMobile ? 1024 : 2048;
    sunLight.shadow.mapSize.height = isMobile ? 1024 : 2048;
    sunLight.shadow.camera.near = 1.0;
    sunLight.shadow.camera.far = 80.0;
    const d = 14;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.bias = -0.0006;
    scene.add(sunLight);
    sunLightRef.current = sunLight;

    // Construir malla de terreno fotorrealista a partir de patch.elevations_m (grid_size x grid_size)
    const n = patch.grid_size;
    const spanUnits = 18.0;
    const geo = new THREE.PlaneGeometry(spanUnits, spanUnits, n - 1, n - 1);
    geo.rotateX(-Math.PI / 2);

    const posAttr = geo.attributes.position;
    const colors: number[] = [];
    const minEl = patch.min_elevation_m;
    const maxEl = Math.max(minEl + 100.0, patch.max_elevation_m);
    const scaleY = 2.8 / Math.max(800.0, maxEl - minEl);

    if (posAttr) {
      for (let i = 0; i < posAttr.count; i++) {
        const row = Math.floor(i / n);
        const col = i % n;
        const elev = patch.elevations_m[row]?.[col] ?? patch.site_elevation_m;
        const y = (elev - patch.site_elevation_m) * scaleY;
        posAttr.setY(i, y);

        const t = Math.max(0, Math.min(1, (elev - minEl) / (maxEl - minEl)));

        if (terrainShaderMode === "hypsometric") {
          // Capa Cientifica (Altimetria LOLA): azul pizarra oscuro (crateres PSR) -> cian -> ambar/blanco (crestas)
          const r = 0.12 + 0.65 * t;
          const g = 0.20 + 0.60 * t;
          const b = 0.38 + 0.45 * (1.0 - t * 0.4);
          colors.push(r, g, b);
        } else {
          // Vista Fotografica Real (Regolito Lunar Basaltico Mate)
          // Albedo real ~0.12-0.16 con micro-textura de regolito y variacion por pendiente
          const pseudoNoise = (((row * 43 + col * 29) % 23) / 23.0 - 0.5) * 0.05;
          const baseGrey = 0.40 + 0.14 * t + pseudoNoise;
          colors.push(baseGrey, baseGrey * 0.98, baseGrey * 0.95);
        }
      }
      posAttr.needsUpdate = true;
      geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      geo.computeVertexNormals();
    }

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.96,
      metalness: 0.0,
      flatShading: false,
    });
    const terrainMesh = new THREE.Mesh(geo, mat);
    terrainMesh.receiveShadow = true;
    terrainMesh.castShadow = true;
    scene.add(terrainMesh);

    // Marcador de precision del mastil del observador (CSA Rover / CLPS Lander) en (0, 0)
    const mastHeightUnits = 0.35 + patch.site.observer_height_m * 0.18;
    const mastGeo = new THREE.CylinderGeometry(0.05, 0.05, mastHeightUnits, 12);
    const mastMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const mastMesh = new THREE.Mesh(mastGeo, mastMat);
    mastMesh.position.set(0, mastHeightUnits / 2, 0);
    mastMesh.castShadow = true;
    scene.add(mastMesh);

    const beaconGeo = new THREE.SphereGeometry(0.12, 16, 16);
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24 });
    const beacon = new THREE.Mesh(beaconGeo, beaconMat);
    beacon.position.set(0, mastHeightUnits, 0);
    scene.add(beacon);

    let yaw = 0.45;
    let pitch = 0.52;
    let dist = 21.0;
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
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      dist = Math.max(10.0, Math.min(45.0, dist + e.deltaY * 0.02));
    };

    dom.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    dom.addEventListener("wheel", onWheel, { passive: false });

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

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || 480;
      const h = container.clientHeight || 380;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(animId);
      dom.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      dom.removeEventListener("wheel", onWheel);
      window.removeEventListener("resize", onResize);
      geo.dispose();
      mat.dispose();
      mastGeo.dispose();
      mastMat.dispose();
      beaconGeo.dispose();
      beaconMat.dispose();
      renderer.dispose();
    };
  }, [patch, terrainShaderMode]);

  useEffect(() => {
    if (!currentSample || !sunLightRef.current) return;
    const az = (currentSample.sun.azimuth_deg * Math.PI) / 180.0;
    const el = Math.max(0.02, (currentSample.sun.elevation_deg * Math.PI) / 180.0);
    const r = 26.0;
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
    <div className="viewport-stage" aria-label="Superficie topografica 3D local LOLA con sombreado fotorrealista de regolito">
      <div className="viewport-overlay-top">
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
          <span className="hud-pill mono-telemetry">
            Malla 3D: {patch.grid_size}×{patch.grid_size} ({patch.step_m.toFixed(0)} m/celda)
          </span>
          <span className="hud-pill mono-telemetry">
            [{patch.min_elevation_m.toFixed(0)} m, {patch.max_elevation_m.toFixed(0)} m]
          </span>
        </div>

        {/* Conmutador de sombreado: Fotorealista (Regolito) vs Capa Cientifica (Altimetria LOLA) */}
        <div style={{ display: "flex", gap: "4px" }}>
          <button
            type="button"
            className={`hud-btn-mini ${terrainShaderMode === "regolith" ? "active" : ""}`}
            onClick={() => setTerrainShaderMode("regolith")}
            title="Sombreado fotorrealista de regolito lunar con sombras de relieve reales"
          >
            Vista Real (Regolito)
          </button>
          <button
            type="button"
            className={`hud-btn-mini ${terrainShaderMode === "hypsometric" ? "active" : ""}`}
            onClick={() => setTerrainShaderMode("hypsometric")}
            title="Gradiente hipsométrico de elevación topográfica LOLA"
          >
            Capa Científica (Altimetría LOLA)
          </button>
        </div>
      </div>

      <div ref={mountRef} style={{ width: "100%", height: "100%" }} />

      <div className="viewport-overlay-bottom">
        <span className="hud-pill">
          Mástil activo: <strong className="mono-telemetry">{patch.site.observer_height_m.toFixed(1)} m</strong>
        </span>
        <span className="hud-pill">
          {terrainShaderMode === "regolith"
            ? "Sombreado fotorrealista de regolito lunar con proyección de sombras astronómicas"
            : mode === "edu"
              ? "Las zonas azules son cráteres profundos; las doradas son cumbres iluminadas"
              : `Fuente: ${patch.dem_product} (${patch.horizon_source})`}
        </span>
      </div>
    </div>
  );
}
