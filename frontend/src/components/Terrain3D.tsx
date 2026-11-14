import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { TerrainPatch, VisibilitySample } from "../types/contracts";
import type { AppMode } from "./HeaderHUD";

export interface Terrain3DProps {
  patch: TerrainPatch | null;
  currentSample: VisibilitySample | null;
  mode: AppMode;
  onBackToGlobe?: () => void;
}

/**
 * Interpolacion bicubica/bilineal suave sobre la matriz de elevaciones LOLA (n x n)
 * para construir la malla local 128x128 de alta densidad.
 */
function sampleElevationSmooth(
  grid: number[][],
  n: number,
  u: number,
  v: number,
  fallbackElev: number,
): number {
  const fx = Math.max(0, Math.min(n - 1.0001, u * (n - 1)));
  const fy = Math.max(0, Math.min(n - 1.0001, v * (n - 1)));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(n - 1, x0 + 1);
  const y1 = Math.min(n - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;
  // Suavizado Hermite de las coordenadas fraccionales para eliminar aristas entre celdas
  const sx = tx * tx * (3.0 - 2.0 * tx);
  const sy = ty * ty * (3.0 - 2.0 * ty);

  const z00 = grid[y0]?.[x0] ?? fallbackElev;
  const z10 = grid[y0]?.[x1] ?? fallbackElev;
  const z01 = grid[y1]?.[x0] ?? fallbackElev;
  const z11 = grid[y1]?.[x1] ?? fallbackElev;

  const top = z00 * (1 - sx) + z10 * sx;
  const bot = z01 * (1 - sx) + z11 * sx;
  return top * (1 - sy) + bot * sy;
}

export function Terrain3D({ patch, currentSample, mode, onBackToGlobe }: Terrain3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sunLightRef = useRef<THREE.DirectionalLight | null>(null);
  const [terrainShaderMode, setTerrainShaderMode] = useState<"regolith" | "hypsometric">("regolith");
  const [crossFadeOut, setCrossFadeOut] = useState<boolean>(false);

  const targetCamRef = useRef({ yaw: 0.45, pitch: 0.48, dist: 16.5 });
  const camStateRef = useRef({ yaw: 0.45, pitch: 0.48, dist: 16.5 });
  const zoomOutCounterRef = useRef<number>(0);
  const onBackRef = useRef(onBackToGlobe);
  onBackRef.current = onBackToGlobe;

  const triggerReturnToGlobe = () => {
    if (!onBackRef.current) return;
    setCrossFadeOut(true);
    window.setTimeout(() => {
      onBackRef.current?.();
    }, 200);
  };

  const handleZoomStep = (dir: "in" | "out") => {
    if (dir === "out" && targetCamRef.current.dist >= 32.0) {
      triggerReturnToGlobe();
      return;
    }
    const step = dir === "in" ? -3.0 : 3.5;
    targetCamRef.current.dist = Math.max(4.5, Math.min(34.0, targetCamRef.current.dist + step));
  };

  useEffect(() => {
    const container = mountRef.current;
    if (!container || !patch) return;

    const width = container.clientWidth || 480;
    const height = container.clientHeight || 380;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.05, 250);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch {
      return;
    }

    const isMobile = window.innerWidth < 768;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2.0));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    // Iluminacion espacial de alto contraste (tipo fotografia Apollo / LRO sin dispersion atmosferica)
    const ambient = new THREE.HemisphereLight(0x1e293b, 0x020617, 0.08);
    scene.add(ambient);

    const sunLight = new THREE.DirectionalLight(0xfffcf5, 2.8);
    sunLight.position.set(14, 7, 14);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = isMobile ? 1024 : 2048;
    sunLight.shadow.mapSize.height = isMobile ? 1024 : 2048;
    sunLight.shadow.camera.near = 1.0;
    sunLight.shadow.camera.far = 90.0;
    const d = 15;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.bias = -0.0005;
    scene.add(sunLight);
    sunLightRef.current = sunLight;

    // Malla topografica 128x128 interpolada desde el parche LOLA real
    const rawN = patch.grid_size;
    const highResN = 128;
    const spanUnits = 18.0;
    const geo = new THREE.PlaneGeometry(spanUnits, spanUnits, highResN - 1, highResN - 1);
    geo.rotateX(-Math.PI / 2);

    const posAttr = geo.attributes.position;
    const colors: number[] = [];
    const minEl = patch.min_elevation_m;
    const maxEl = Math.max(minEl + 100.0, patch.max_elevation_m);
    const scaleY = 3.0 / Math.max(750.0, maxEl - minEl);

    if (posAttr) {
      for (let i = 0; i < posAttr.count; i++) {
        const row = Math.floor(i / highResN);
        const col = i % highResN;
        const u = col / (highResN - 1);
        const v = row / (highResN - 1);

        const elev = sampleElevationSmooth(
          patch.elevations_m,
          rawN,
          u,
          v,
          patch.site_elevation_m,
        );

        const y = (elev - patch.site_elevation_m) * scaleY;
        posAttr.setY(i, y);

        const t = Math.max(0, Math.min(1, (elev - minEl) / (maxEl - minEl)));

        if (terrainShaderMode === "hypsometric") {
          const r = 0.12 + 0.65 * t;
          const g = 0.20 + 0.60 * t;
          const b = 0.38 + 0.45 * (1.0 - t * 0.4);
          colors.push(r, g, b);
        } else {
          // Reflectancia fotografica gris regolito Apollo/LRO realista
          const baseGrey = 0.44 + 0.16 * t;
          colors.push(baseGrey, baseGrey * 0.99, baseGrey * 0.97);
        }
      }
      posAttr.needsUpdate = true;
      geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      geo.computeVertexNormals();
    }

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.92,
      metalness: 0.0,
      flatShading: false,
    });
    const terrainMesh = new THREE.Mesh(geo, mat);
    terrainMesh.receiveShadow = true;
    terrainMesh.castShadow = true;
    scene.add(terrainMesh);

    // Marcador de precision del mastil del observador (CSA Rover / CLPS Lander) en (0, 0)
    const mastHeightUnits = 0.35 + patch.site.observer_height_m * 0.18;
    const mastGeo = new THREE.CylinderGeometry(0.045, 0.045, mastHeightUnits, 14);
    const mastMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const mastMesh = new THREE.Mesh(mastGeo, mastMat);
    mastMesh.position.set(0, mastHeightUnits / 2, 0);
    mastMesh.castShadow = true;
    scene.add(mastMesh);

    const beaconGeo = new THREE.SphereGeometry(0.11, 16, 16);
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24 });
    const beacon = new THREE.Mesh(beaconGeo, beaconMat);
    beacon.position.set(0, mastHeightUnits, 0);
    scene.add(beacon);

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
      const distScale = Math.max(0.25, Math.min(1.0, camStateRef.current.dist / 20.0));
      targetCamRef.current.yaw -= (e.clientX - prevX) * 0.007 * distScale;
      targetCamRef.current.pitch = Math.max(
        0.1,
        Math.min(1.48, targetCamRef.current.pitch + (e.clientY - prevY) * 0.007 * distScale),
      );
      prevX = e.clientX;
      prevY = e.clientY;
    };
    const onUp = () => {
      isDragging = false;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // Si el usuario aleja la rueda del raton (zoom out) en el limite superior, regresar de forma fluida al Globo 3D
      if (e.deltaY > 0 && targetCamRef.current.dist >= 32.5) {
        zoomOutCounterRef.current += 1;
        if (zoomOutCounterRef.current >= 2) {
          zoomOutCounterRef.current = 0;
          triggerReturnToGlobe();
          return;
        }
      } else if (e.deltaY < 0) {
        zoomOutCounterRef.current = 0;
      }
      targetCamRef.current.dist = Math.max(
        4.5,
        Math.min(34.0, targetCamRef.current.dist + e.deltaY * 0.022),
      );
    };

    dom.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    dom.addEventListener("wheel", onWheel, { passive: false });

    let animId = 0;
    const damping = 0.09;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      camStateRef.current.yaw += (targetCamRef.current.yaw - camStateRef.current.yaw) * damping;
      camStateRef.current.pitch += (targetCamRef.current.pitch - camStateRef.current.pitch) * damping;
      camStateRef.current.dist += (targetCamRef.current.dist - camStateRef.current.dist) * damping;

      const { yaw, pitch, dist } = camStateRef.current;
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
    const r = 28.0;
    sunLightRef.current.position.set(
      r * Math.cos(el) * Math.sin(az),
      r * Math.sin(el),
      -r * Math.cos(el) * Math.cos(az),
    );
  }, [currentSample]);

  if (!patch) {
    return (
      <div className="viewport-stage" style={{ display: "grid", placeItems: "center" }}>
        <span className="mono-telemetry">Cargando malla topográfica 3D LOLA (128×128)...</span>
      </div>
    );
  }

  return (
    <div
      className="viewport-stage"
      aria-label="Superficie topografica 3D local LOLA 128x128 con sombreado fotorrealista de regolito"
      style={{
        opacity: crossFadeOut ? 0.08 : 1.0,
        transition: "opacity 0.2s ease-out",
      }}
    >
      <div className="viewport-overlay-top">
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
          {onBackToGlobe && (
            <button
              type="button"
              className="hud-btn-mini"
              onClick={triggerReturnToGlobe}
              style={{ borderColor: "rgba(56, 189, 248, 0.55)", color: "#38bdf8" }}
            >
              ← Volver al Globo 3D
            </button>
          )}
          <span className="hud-pill mono-telemetry">
            Malla 3D HD: 128×128 (DEM LOLA {patch.grid_size}×{patch.grid_size}, {patch.step_m.toFixed(0)} m/celda)
          </span>
          <span className="hud-pill mono-telemetry">
            [{patch.min_elevation_m.toFixed(0)} m, {patch.max_elevation_m.toFixed(0)} m]
          </span>
        </div>

        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
          <button
            type="button"
            className="hud-btn-mini"
            onClick={() => handleZoomStep("in")}
            title="Acercar cámara a la superficie local"
          >
            ＋ Zoom
          </button>
          <button
            type="button"
            className="hud-btn-mini"
            onClick={() => handleZoomStep("out")}
            title="Alejar cámara (al alejar al máximo vuelve al Globo Lunar 3D)"
          >
            － Zoom
          </button>
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
            ? "Aleja la rueda del ratón (Zoom Out) para ascender automáticamente al Globo Lunar 3D"
            : mode === "edu"
              ? "Las zonas azules son cráteres profundos; las doradas son cumbres iluminadas"
              : `Fuente: ${patch.dem_product} (${patch.horizon_source})`}
        </span>
      </div>
    </div>
  );
}
