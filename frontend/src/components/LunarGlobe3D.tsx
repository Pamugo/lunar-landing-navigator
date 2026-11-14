import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { CuratedSite, LunarCoordinate, VisibilitySample } from "../types/contracts";
import type { AppMode } from "./HeaderHUD";

export interface LunarGlobe3DProps {
  sites: CuratedSite[];
  selectedSiteIds: string[];
  focusedSite: LunarCoordinate;
  currentSample: VisibilitySample | null;
  mode: AppMode;
  onSelectCuratedSite: (siteId: string) => void;
  onSelectCustomCoordinate: (lat_deg: number, lon_deg: number) => void;
}

/**
 * Convierte (lat_deg, lon_deg) selenograficos MOON_ME a coordenadas 3D en una esfera de radio R.
 * Convencion Three.js: Y = eje polar Norte (+90°), Z = meridiano 0° (cara visible hacia Tierra), X = +90° Este.
 */
function latLonToVector3(lat_deg: number, lon_deg: number, radius: number): THREE.Vector3 {
  const phi = (lat_deg * Math.PI) / 180.0;
  const lambda = (lon_deg * Math.PI) / 180.0;
  const x = radius * Math.cos(phi) * Math.sin(lambda);
  const y = radius * Math.sin(phi);
  const z = radius * Math.cos(phi) * Math.cos(lambda);
  return new THREE.Vector3(x, y, z);
}

function vector3ToLatLon(point: THREE.Vector3): { lat_deg: number; lon_deg: number } {
  const norm = point.clone().normalize();
  const lat_deg = (Math.asin(Math.max(-1, Math.min(1, norm.y))) * 180.0) / Math.PI;
  const lon_deg = (Math.atan2(norm.x, norm.z) * 180.0) / Math.PI;
  return {
    lat_deg: Number(lat_deg.toFixed(4)),
    lon_deg: Number(lon_deg.toFixed(4)),
  };
}

function createProceduralMoonTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return new THREE.CanvasTexture(canvas);
  }

  // Base regolito lunar
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0.0, "#4B5563");
  grad.addColorStop(0.5, "#64748B");
  grad.addColorStop(0.88, "#475569");
  grad.addColorStop(1.0, "#1E293B"); // Polo sur con sombras profundas PSR
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 512);

  // Maria lunares (manchas basálticas oscuras en la cara visible)
  const maria = [
    { x: 560, y: 210, rx: 75, ry: 55, alpha: 0.32 }, // Mare Tranquillitatis / Serenitatis
    { x: 430, y: 190, rx: 95, ry: 75, alpha: 0.35 }, // Oceanus Procellarum / Imbrium
    { x: 640, y: 255, rx: 45, ry: 40, alpha: 0.28 }, // Mare Crisium
    { x: 510, y: 390, rx: 140, ry: 60, alpha: 0.25 }, // Cuenca South Pole-Aitken
  ];
  for (const m of maria) {
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(m.x, m.y, m.rx, m.ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(15, 23, 42, ${m.alpha})`;
    ctx.fill();
    ctx.restore();
  }

  // Cráteres deterministas
  let seed = 1737400;
  const nextRand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  for (let i = 0; i < 220; i++) {
    const cx = nextRand() * 1024;
    const cy = nextRand() * 512;
    const r = 2 + nextRand() * 18;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(15, 23, 42, 0.22)";
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(226, 232, 240, 0.16)";
    ctx.stroke();
  }

  // Reticula selenografica cada 30 deg + anillo polar sur 80°S
  ctx.strokeStyle = "rgba(148, 163, 184, 0.18)";
  ctx.lineWidth = 1;
  for (let lon = -150; lon <= 180; lon += 30) {
    const x = ((lon + 180) / 360) * 1024;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 512);
    ctx.stroke();
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const y = ((90 - lat) / 180) * 512;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(1024, y);
    ctx.stroke();
  }
  // Anillo destacado 80°S (region polar sur del reto)
  const y80S = ((90 - -80) / 180) * 512;
  ctx.strokeStyle = "rgba(56, 189, 248, 0.55)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, y80S);
  ctx.lineTo(1024, y80S);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

export function LunarGlobe3D({
  sites,
  selectedSiteIds,
  focusedSite,
  currentSample,
  mode,
  onSelectCuratedSite,
  onSelectCustomCoordinate,
}: LunarGlobe3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [cameraPreset, setCameraPreset] = useState<"south_pole" | "nearside" | "farside">("south_pole");
  const [showEduCard, setShowEduCard] = useState<boolean>(true);

  // Estado de camara esferica (yaw, pitch, distance)
  const camStateRef = useRef({ yaw: 0.25, pitch: -1.28, dist: 2.35 });
  const markersRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const focusRingRef = useRef<THREE.Mesh | null>(null);
  const sunArrowRef = useRef<THREE.ArrowHelper | null>(null);
  const earthArrowRef = useRef<THREE.ArrowHelper | null>(null);
  const sunLightRef = useRef<THREE.DirectionalLight | null>(null);
  const eduGroupRef = useRef<THREE.Group | null>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const applyCameraPreset = (preset: "south_pole" | "nearside" | "farside") => {
    setCameraPreset(preset);
    if (preset === "south_pole") {
      camStateRef.current = { yaw: 0.15, pitch: -1.35, dist: 2.15 };
    } else if (preset === "nearside") {
      camStateRef.current = { yaw: 0.25, pitch: -0.15, dist: 2.85 };
    } else {
      camStateRef.current = { yaw: Math.PI, pitch: -0.25, dist: 2.85 };
    }
  };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 480;
    const height = container.clientHeight || 380;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 50);

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

    // Iluminacion espacial: luz ambiental tenue + luz solar direccional (terminador real)
    const ambient = new THREE.AmbientLight(0x334155, 0.75);
    scene.add(ambient);

    const sunLight = new THREE.DirectionalLight(0xfffbeb, 2.2);
    sunLight.position.set(4, -1.2, 4);
    scene.add(sunLight);
    sunLightRef.current = sunLight;

    // Esfera lunar R = 1.0 unidad (= 1737.4 km)
    const moonGeo = new THREE.SphereGeometry(1.0, 64, 64);
    const moonTex = createProceduralMoonTexture();
    // Alinear UV de Three.js con nuestra convencion Z = lon 0
    moonGeo.rotateY(-Math.PI / 2);
    const moonMat = new THREE.MeshStandardMaterial({
      map: moonTex,
      roughness: 0.92,
      metalness: 0.04,
    });
    const moonMesh = new THREE.Mesh(moonGeo, moonMat);
    scene.add(moonMesh);

    // Anillo marcador del sitio enfocado
    const ringGeo = new THREE.RingGeometry(0.028, 0.044, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xfbbf24,
      side: THREE.DoubleSide,
    });
    const focusRing = new THREE.Mesh(ringGeo, ringMat);
    scene.add(focusRing);
    focusRingRef.current = focusRing;

    // Vectores 3D hacia el Sol (#F59E0B) y la Tierra (#06B6D4)
    const sunArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, -1, 0),
      0.48,
      0xf59e0b,
      0.09,
      0.05,
    );
    const earthArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, -1, 0),
      0.48,
      0x06b6d4,
      0.09,
      0.05,
    );
    scene.add(sunArrow);
    scene.add(earthArrow);
    sunArrowRef.current = sunArrow;
    earthArrowRef.current = earthArrow;

    // Marcadores de los 9 sitios curados
    const markerMap = new Map<string, THREE.Mesh>();
    for (const site of sites) {
      const mGeo = new THREE.SphereGeometry(0.022, 16, 16);
      const isPolar = site.region === "south_polar";
      const mMat = new THREE.MeshBasicMaterial({
        color: isPolar ? 0x38bdf8 : 0xfbbf24,
      });
      const mesh = new THREE.Mesh(mGeo, mMat);
      mesh.position.copy(latLonToVector3(site.lat_deg, site.lon_deg, 1.012));
      mesh.userData = { siteId: site.id };
      scene.add(mesh);
      markerMap.set(site.id, mesh);
    }
    markersRef.current = markerMap;

    // Capa Dinamica Modo Educativo: Rutas del Historico de Misiones + Anillos PSR (Hielo de Agua)
    const eduGroup = new THREE.Group();
    const chronologicalIds = [
      "apollo-11",
      "apollo-17",
      "change-4",
      "chandrayaan-3",
      "mons-mouton-leibnitz-beta",
      "shackleton-rim",
    ];
    const siteById = new Map(sites.map((s) => [s.id, s]));
    for (let i = 0; i < chronologicalIds.length - 1; i++) {
      const sA = siteById.get(chronologicalIds[i] ?? "");
      const sB = siteById.get(chronologicalIds[i + 1] ?? "");
      if (!sA || !sB) continue;
      const vA = latLonToVector3(sA.lat_deg, sA.lon_deg, 1.014);
      const vB = latLonToVector3(sB.lat_deg, sB.lon_deg, 1.014);
      const mid = vA.clone().add(vB).multiplyScalar(0.5).normalize().multiplyScalar(1.16);
      const curve = new THREE.QuadraticBezierCurve3(vA, mid, vB);
      const arcPoints = curve.getPoints(36);
      const arcGeo = new THREE.BufferGeometry().setFromPoints(arcPoints);
      const arcMat = new THREE.LineBasicMaterial({
        color: i >= 3 ? 0x38bdf8 : 0xfbbf24,
        transparent: true,
        opacity: 0.65,
      });
      eduGroup.add(new THREE.Line(arcGeo, arcMat));
    }

    // Anillos de Regiones en Sombra Permanente (PSRs con hielo de agua) en Cabeus y Shackleton
    for (const psrId of ["cabeus-crater", "shackleton-rim"]) {
      const psrSite = siteById.get(psrId);
      if (!psrSite) continue;
      const psrRingGeo = new THREE.RingGeometry(0.036, 0.052, 32);
      const psrRingMat = new THREE.MeshBasicMaterial({
        color: 0x06b6d4,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.72,
      });
      const psrRing = new THREE.Mesh(psrRingGeo, psrRingMat);
      const pPos = latLonToVector3(psrSite.lat_deg, psrSite.lon_deg, 1.011);
      psrRing.position.copy(pPos);
      psrRing.lookAt(pPos.clone().multiplyScalar(2.0));
      eduGroup.add(psrRing);
    }

    scene.add(eduGroup);
    eduGroupRef.current = eduGroup;

    // Interaccion de rotacion, zoom y clic (raycasting)
    let isDragging = false;
    let dragDistance = 0;
    let prevX = 0;
    let prevY = 0;

    const dom = renderer.domElement;
    const onPointerDown = (e: PointerEvent) => {
      isDragging = true;
      dragDistance = 0;
      prevX = e.clientX;
      prevY = e.clientY;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - prevX;
      const dy = e.clientY - prevY;
      dragDistance += Math.hypot(dx, dy);
      prevX = e.clientX;
      prevY = e.clientY;
      camStateRef.current.yaw -= dx * 0.007;
      camStateRef.current.pitch = Math.max(
        -1.53,
        Math.min(1.53, camStateRef.current.pitch + dy * 0.007),
      );
    };
    const onPointerUp = (e: PointerEvent) => {
      if (!isDragging) return;
      isDragging = false;
      if (dragDistance < 5) {
        const rect = dom.getBoundingClientRect();
        const ndc = new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1,
        );
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(ndc, camera);

        const markerMeshes = Array.from(markerMap.values());
        const hitMarkers = raycaster.intersectObjects(markerMeshes, false);
        if (hitMarkers.length > 0 && hitMarkers[0]) {
          const siteId = hitMarkers[0].object.userData.siteId as string | undefined;
          if (siteId) {
            onSelectCuratedSite(siteId);
            return;
          }
        }

        const hitSphere = raycaster.intersectObject(moonMesh, false);
        if (hitSphere.length > 0 && hitSphere[0]) {
          if (modeRef.current === "eng") {
            const { lat_deg, lon_deg } = vector3ToLatLon(hitSphere[0].point);
            onSelectCustomCoordinate(lat_deg, lon_deg);
          }
        }
      }
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      camStateRef.current.dist = Math.max(
        1.45,
        Math.min(4.2, camStateRef.current.dist + e.deltaY * 0.0012),
      );
    };

    dom.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    dom.addEventListener("wheel", onWheel, { passive: false });

    let animId = 0;
    const animate = () => {
      animId = requestAnimationFrame(animate);
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
      dom.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      dom.removeEventListener("wheel", onWheel);
      window.removeEventListener("resize", onResize);
      moonGeo.dispose();
      moonMat.dispose();
      moonTex.dispose();
      ringGeo.dispose();
      ringMat.dispose();
      renderer.dispose();
    };
  }, [sites]);

  // Actualizar colores de marcadores, posicion enfocada y vectores Sol/Tierra
  useEffect(() => {
    if (eduGroupRef.current) {
      eduGroupRef.current.visible = mode === "edu";
    }

    for (const [siteId, mesh] of markersRef.current.entries()) {
      const mat = mesh.material as THREE.MeshBasicMaterial;
      const isFocused = focusedSite.site_id === siteId;
      const isSelected = selectedSiteIds.includes(siteId);
      if (isFocused) {
        mat.color.setHex(0xfbbf24);
        mesh.scale.setScalar(1.45);
      } else if (isSelected) {
        mat.color.setHex(0x38bdf8);
        mesh.scale.setScalar(1.2);
      } else {
        mat.color.setHex(0x94a3b8);
        mesh.scale.setScalar(0.95);
      }
    }

    const sitePos = latLonToVector3(focusedSite.lat_deg, focusedSite.lon_deg, 1.015);
    if (focusRingRef.current) {
      focusRingRef.current.position.copy(sitePos);
      focusRingRef.current.lookAt(sitePos.clone().multiplyScalar(2.0));
    }

    // Construir base local ENU en el sitio enfocado para orientar vectores Sol y Tierra
    const phi = (focusedSite.lat_deg * Math.PI) / 180.0;
    const lambda = (focusedSite.lon_deg * Math.PI) / 180.0;
    const up = latLonToVector3(focusedSite.lat_deg, focusedSite.lon_deg, 1.0).normalize();
    const east = new THREE.Vector3(Math.cos(lambda), 0, -Math.sin(lambda)).normalize();
    const north = new THREE.Vector3(
      -Math.sin(phi) * Math.sin(lambda),
      Math.cos(phi),
      -Math.sin(phi) * Math.cos(lambda),
    ).normalize();

    const azElToDir = (az_deg: number, el_deg: number): THREE.Vector3 => {
      const az = (az_deg * Math.PI) / 180.0;
      const el = (el_deg * Math.PI) / 180.0;
      const horiz = north
        .clone()
        .multiplyScalar(Math.cos(az))
        .add(east.clone().multiplyScalar(Math.sin(az)));
      return horiz
        .multiplyScalar(Math.cos(el))
        .add(up.clone().multiplyScalar(Math.sin(el)))
        .normalize();
    };

    if (currentSample && sunArrowRef.current && earthArrowRef.current) {
      const sunDir = azElToDir(currentSample.sun.azimuth_deg, currentSample.sun.elevation_deg);
      const earthDir = azElToDir(currentSample.earth.azimuth_deg, currentSample.earth.elevation_deg);

      sunArrowRef.current.position.copy(sitePos);
      sunArrowRef.current.setDirection(sunDir);
      sunArrowRef.current.visible = true;

      earthArrowRef.current.position.copy(sitePos);
      earthArrowRef.current.setDirection(earthDir);
      earthArrowRef.current.visible = true;

      if (sunLightRef.current) {
        sunLightRef.current.position.copy(sunDir.clone().multiplyScalar(6.0));
      }
    }
  }, [focusedSite, selectedSiteIds, currentSample, mode]);

  const focusedCuratedSite = sites.find((s) => s.id === focusedSite.site_id) ?? null;

  return (
    <div className="viewport-stage" aria-label="Globo Lunar 3D interactivo con vectores Sol y Tierra">
      <div className="viewport-overlay-top">
        <div className="hud-pill mono-telemetry">
          <span>Foco:</span>
          <strong>
            {focusedSite.lat_deg.toFixed(3)}°, {focusedSite.lon_deg.toFixed(3)}°
          </strong>
          <span>(h₀ = {focusedSite.observer_height_m.toFixed(1)} m)</span>
        </div>

        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
          <button
            type="button"
            className={`hud-btn-mini ${cameraPreset === "south_pole" ? "active" : ""}`}
            onClick={() => applyCameraPreset("south_pole")}
          >
            Polo Sur (80°S–90°S)
          </button>
          <button
            type="button"
            className={`hud-btn-mini ${cameraPreset === "nearside" ? "active" : ""}`}
            onClick={() => applyCameraPreset("nearside")}
          >
            Cara Visible
          </button>
          <button
            type="button"
            className={`hud-btn-mini ${cameraPreset === "farside" ? "active" : ""}`}
            onClick={() => applyCameraPreset("farside")}
          >
            Cara Oculta
          </button>
          {mode === "edu" && (
            <button
              type="button"
              className={`hud-btn-mini ${showEduCard ? "active" : ""}`}
              onClick={() => setShowEduCard((v) => !v)}
            >
              {showEduCard ? "Ocultar Ficha Histórica" : "Ver Ficha Histórica"}
            </button>
          )}
        </div>
      </div>

      <div ref={mountRef} style={{ width: "100%", height: "100%" }} />

      {/* Ficha Interactiva del Historico de Misiones y PSRs en Modo Educativo */}
      {mode === "edu" && showEduCard && focusedCuratedSite && (
        <div
          style={{
            position: "absolute",
            left: "10px",
            bottom: "42px",
            maxWidth: "330px",
            background: "rgba(11, 15, 25, 0.88)",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(56, 189, 248, 0.28)",
            borderRadius: "8px",
            padding: "8px 10px",
            fontSize: "0.73rem",
            color: "var(--text-secondary)",
            zIndex: 12,
            boxShadow: "0 10px 24px rgba(0,0,0,0.55)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "6px" }}>
            <strong style={{ color: "var(--text-primary)", fontSize: "0.78rem" }}>
              {focusedCuratedSite.name}
            </strong>
            <span className="mission-badge">{focusedCuratedSite.mission}</span>
          </div>
          <p style={{ margin: "5px 0", lineHeight: 1.38 }}>{focusedCuratedSite.description_edu}</p>
          <div
            style={{
              fontSize: "0.68rem",
              color: "var(--dte-cyan)",
              borderTop: "1px solid rgba(255,255,255,0.08)",
              paddingTop: "4px",
            }}
          >
            {focusedCuratedSite.id === "cabeus-crater"
              ? "❄️ Región PSR (Sombra Permanente): trampa fría con hielo de agua confirmada por LCROSS (2009)."
              : focusedCuratedSite.region === "south_polar"
                ? "☀️ Pico Polar junto a cráteres PSR: luz solar rasante casi continua a pocos km de reservas de hielo."
                : "🚀 Hito Histórico de Exploración Lunar: ruta conectada en el globo 3D."}
          </div>
        </div>
      )}

      <div className="viewport-overlay-bottom">
        <span className="hud-pill">
          <span style={{ color: "var(--solar-amber)" }}>● Vector Sol</span>
          <span style={{ color: "var(--dte-cyan)" }}>● Vector Tierra (DTE)</span>
          {mode === "edu" && (
            <span style={{ color: "#38bdf8" }}>● Rutas Históricas & PSRs</span>
          )}
        </span>
        <span className="hud-pill">
          {mode === "edu"
            ? "Arrastra para girar · Clic en un marcador muestra su hito histórico y zonas PSR"
            : "Clic sobre la esfera fija coordenadas selenográficas MOON_ME personalizadas"}
        </span>
      </div>
    </div>
  );
}
