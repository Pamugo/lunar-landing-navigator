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
  onOpenLocalTerrain3D?: () => void;
}

const R_MOON_M = 1_737_400.0;
const POLAR_CAP_HALF_EXTENT_M = 340_000.0;
const MIN_CAM_DIST = 1.015; // ~26 km de altitud orbital sobre la superficie lunar (R = 1.0)
const MAX_CAM_DIST = 4.5;

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

/**
 * Construye una malla esferica de alta densidad para el Casquete Polar Sur (-78.5° a -90°)
 * cuyas coordenadas UV mapean de forma exacta a la proyeccion estereografica polar sur
 * de south_pole_lola_hires.png ([-340 km, +340 km]).
 */
function createSouthPolarCapGeometry(
  radius: number,
  lonSegments: number,
  latSegments: number,
): THREE.BufferGeometry {
  const latMinDeg = -90.0;
  const latMaxDeg = -78.5;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let iy = 0; iy <= latSegments; iy++) {
    const vFrac = iy / latSegments;
    const latDeg = latMinDeg + vFrac * (latMaxDeg - latMinDeg);
    const phi = (latDeg * Math.PI) / 180.0;
    const rho = 2.0 * R_MOON_M * Math.tan(Math.PI / 4.0 + phi / 2.0);

    for (let ix = 0; ix <= lonSegments; ix++) {
      const uFrac = ix / lonSegments;
      const lonDeg = -180.0 + uFrac * 360.0;
      const lambda = (lonDeg * Math.PI) / 180.0;

      const nx = Math.cos(phi) * Math.sin(lambda);
      const ny = Math.sin(phi);
      const nz = Math.cos(phi) * Math.cos(lambda);

      positions.push(radius * nx, radius * ny, radius * nz);
      normals.push(nx, ny, nz);

      // Coordenadas estereograficas (x_m, y_m) -> UV [0, 1]
      const x_m = rho * Math.sin(lambda);
      const y_m = rho * Math.cos(lambda);
      const u = (x_m + POLAR_CAP_HALF_EXTENT_M) / (2.0 * POLAR_CAP_HALF_EXTENT_M);
      const v = (y_m + POLAR_CAP_HALF_EXTENT_M) / (2.0 * POLAR_CAP_HALF_EXTENT_M);
      uvs.push(u, v);
    }
  }

  const stride = lonSegments + 1;
  for (let iy = 0; iy < latSegments; iy++) {
    for (let ix = 0; ix < lonSegments; ix++) {
      const a = iy * stride + ix;
      const b = a + 1;
      const c = (iy + 1) * stride + ix;
      const d = c + 1;
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setIndex(indices);
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  return geo;
}

export function LunarGlobe3D({
  sites,
  selectedSiteIds,
  focusedSite,
  currentSample,
  mode,
  onSelectCuratedSite,
  onSelectCustomCoordinate,
  onOpenLocalTerrain3D,
}: LunarGlobe3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [cameraPreset, setCameraPreset] = useState<"south_pole" | "nearside" | "farside" | "site_zoom">("south_pole");
  const [showEduCard, setShowEduCard] = useState<boolean>(true);
  const [altitudeKm, setAltitudeKm] = useState<number>(Math.round((1.95 - 1.0) * 1737.4));
  const [isDeepZoom, setIsDeepZoom] = useState<boolean>(false);

  // Estado interpolado de camara (damping suave tipo OrbitControls)
  const camStateRef = useRef({ yaw: 0.15, pitch: -1.38, dist: 1.95 });
  const targetCamRef = useRef({ yaw: 0.15, pitch: -1.38, dist: 1.95 });
  const markersRef = useRef<Map<string, THREE.Group>>(new Map());
  const focusReticleRef = useRef<THREE.Group | null>(null);
  const sunArrowRef = useRef<THREE.ArrowHelper | null>(null);
  const earthArrowRef = useRef<THREE.ArrowHelper | null>(null);
  const sunLightRef = useRef<THREE.DirectionalLight | null>(null);
  const eduGroupRef = useRef<THREE.Group | null>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const flyToCoordinate = (lat_deg: number, lon_deg: number, targetDist?: number) => {
    const targetPitch = Math.max(-1.568, Math.min(1.568, (lat_deg * Math.PI) / 180.0));
    const targetYaw = (lon_deg * Math.PI) / 180.0;
    // Normalizar delta de yaw para el giro mas corto
    const currentYaw = targetCamRef.current.yaw;
    let deltaYaw = ((targetYaw - currentYaw + Math.PI) % (2 * Math.PI)) - Math.PI;
    if (deltaYaw < -Math.PI) deltaYaw += 2 * Math.PI;

    targetCamRef.current = {
      yaw: currentYaw + deltaYaw,
      pitch: targetPitch,
      dist: targetDist !== undefined ? Math.max(MIN_CAM_DIST, Math.min(MAX_CAM_DIST, targetDist)) : targetCamRef.current.dist,
    };
  };

  const applyCameraPreset = (preset: "south_pole" | "nearside" | "farside" | "site_zoom") => {
    setCameraPreset(preset);
    if (preset === "south_pole") {
      flyToCoordinate(-88.5, 0.0, 1.32);
    } else if (preset === "site_zoom") {
      flyToCoordinate(focusedSite.lat_deg, focusedSite.lon_deg, 1.12);
    } else if (preset === "nearside") {
      flyToCoordinate(0.0, 0.0, 2.75);
    } else {
      flyToCoordinate(-10.0, 180.0, 2.75);
    }
  };

  const handleZoomStep = (direction: "in" | "out") => {
    const curDist = targetCamRef.current.dist;
    const alt = Math.max(0.01, curDist - 1.0);
    const factor = direction === "in" ? -0.32 : 0.45;
    const nextDist = Math.max(MIN_CAM_DIST, Math.min(MAX_CAM_DIST, curDist + alt * factor));
    targetCamRef.current.dist = nextDist;
  };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 480;
    const height = container.clientHeight || 380;

    const scene = new THREE.Scene();
    // near = 0.001, far = 100 para permitir Deep Zoom hasta 1.015 (~25 km) sin recorte de superficie
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.001, 100);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch {
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2.0));
    renderer.setSize(width, height);
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    const maxAniso = renderer.capabilities.getMaxAnisotropy();

    const configureTexture = (tex: THREE.Texture, isColor: boolean) => {
      if (isColor) {
        tex.colorSpace = THREE.SRGBColorSpace;
      }
      tex.anisotropy = maxAniso;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.generateMipmaps = true;
      tex.needsUpdate = true;
    };

    // 1. Iluminacion astronomica real sin atmosfera (Airless Body)
    const sunLight = new THREE.DirectionalLight(0xfff8ee, 3.25);
    sunLight.position.set(10, 0, 0);
    scene.add(sunLight);
    sunLightRef.current = sunLight;

    // Faint Earthshine / Luz cenicienta tenue para distinguir la topografia en sombra
    const earthshine = new THREE.HemisphereLight(0x1e293b, 0x030712, 0.22);
    scene.add(earthshine);

    // 2. Carga de Texturas 4K Globales + 2K Polar Sur LOD + Micro-Detalle de Regolito
    const texLoader = new THREE.TextureLoader();

    const moonAlbedo = texLoader.load("/textures/moon_albedo_map.jpg", () => {
      configureTexture(moonAlbedo, true);
    });
    configureTexture(moonAlbedo, true);

    const moonBump = texLoader.load("/textures/moon_bump_lola.jpg", () => {
      configureTexture(moonBump, false);
    });
    configureTexture(moonBump, false);

    const regolithMicroGlobal = texLoader.load("/textures/regolith_micro_normal.png", () => {
      configureTexture(regolithMicroGlobal, false);
    });
    regolithMicroGlobal.wrapS = THREE.RepeatWrapping;
    regolithMicroGlobal.wrapT = THREE.RepeatWrapping;
    regolithMicroGlobal.repeat.set(64, 32);
    configureTexture(regolithMicroGlobal, false);

    // 3. Esfera Lunar Global de Alta Densidad (256x256 en escritorio, 160x160 en movil)
    const isMobile = window.innerWidth < 768;
    const segments = isMobile ? 160 : 256;
    const moonGeo = new THREE.SphereGeometry(1.0, segments, segments);
    moonGeo.rotateY(-Math.PI / 2);

    const moonMat = new THREE.MeshStandardMaterial({
      map: moonAlbedo,
      bumpMap: moonBump,
      bumpScale: 0.042,
      normalMap: regolithMicroGlobal,
      normalScale: new THREE.Vector2(0.22, 0.22),
      roughness: 0.95,
      metalness: 0.0,
    });
    const moonMesh = new THREE.Mesh(moonGeo, moonMat);
    scene.add(moonMesh);

    // 4. Capa LOD Polar Sur de Ultra-Alta Resolucion (2048x2048 px desde GeoTIFF LOLA Local)
    const southPoleAlbedo = texLoader.load("/textures/south_pole_lola_hires.png", () => {
      configureTexture(southPoleAlbedo, true);
    });
    configureTexture(southPoleAlbedo, true);

    const southPoleBump = texLoader.load("/textures/south_pole_bump_hires.jpg", () => {
      configureTexture(southPoleBump, false);
    });
    configureTexture(southPoleBump, false);

    const regolithMicroPolar = texLoader.load("/textures/regolith_micro_normal.png", () => {
      configureTexture(regolithMicroPolar, false);
    });
    regolithMicroPolar.wrapS = THREE.RepeatWrapping;
    regolithMicroPolar.wrapT = THREE.RepeatWrapping;
    regolithMicroPolar.repeat.set(48, 48);
    configureTexture(regolithMicroPolar, false);

    const polarCapGeo = createSouthPolarCapGeometry(1.0004, isMobile ? 128 : 192, isMobile ? 64 : 96);
    const polarCapMat = new THREE.MeshStandardMaterial({
      map: southPoleAlbedo,
      bumpMap: southPoleBump,
      bumpScale: 0.055,
      normalMap: regolithMicroPolar,
      normalScale: new THREE.Vector2(0.32, 0.32),
      displacementMap: southPoleBump,
      displacementScale: 0.006,
      displacementBias: -0.003,
      roughness: 0.95,
      metalness: 0.0,
      transparent: true,
      depthWrite: true,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const polarCapMesh = new THREE.Mesh(polarCapGeo, polarCapMat);
    scene.add(polarCapMesh);

    // 5. Reticula de telemetria fina tipo NASA para el sitio enfocado
    const reticleGroup = new THREE.Group();
    const innerRingGeo = new THREE.RingGeometry(0.015, 0.018, 32);
    const reticleMat = new THREE.MeshBasicMaterial({
      color: 0xfbbf24,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.92,
      depthTest: false,
    });
    const innerRing = new THREE.Mesh(innerRingGeo, reticleMat);
    reticleGroup.add(innerRing);

    const outerRingGeo = new THREE.RingGeometry(0.025, 0.027, 32);
    const outerRing = new THREE.Mesh(outerRingGeo, reticleMat);
    reticleGroup.add(outerRing);

    const tickMat = new THREE.LineBasicMaterial({
      color: 0xfbbf24,
      transparent: true,
      opacity: 0.88,
      depthTest: false,
    });
    const tickPoints = [
      new THREE.Vector3(0, 0.018, 0),
      new THREE.Vector3(0, 0.032, 0),
      new THREE.Vector3(0, -0.018, 0),
      new THREE.Vector3(0, -0.032, 0),
      new THREE.Vector3(0.018, 0, 0),
      new THREE.Vector3(0.032, 0, 0),
      new THREE.Vector3(-0.018, 0, 0),
      new THREE.Vector3(-0.032, 0, 0),
    ];
    const tickGeo = new THREE.BufferGeometry().setFromPoints(tickPoints);
    const tickLines = new THREE.LineSegments(tickGeo, tickMat);
    reticleGroup.add(tickLines);

    scene.add(reticleGroup);
    focusReticleRef.current = reticleGroup;

    // 6. Vectores 3D hacia el Sol (#F59E0B) y la Tierra (#06B6D4)
    const sunArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, -1, 0),
      0.42,
      0xf59e0b,
      0.07,
      0.035,
    );
    const earthArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, -1, 0),
      0.42,
      0x06b6d4,
      0.07,
      0.035,
    );
    scene.add(sunArrow);
    scene.add(earthArrow);
    sunArrowRef.current = sunArrow;
    earthArrowRef.current = earthArrow;

    // 7. Marcadores minimalistas de precision para los sitios curados
    const markerMap = new Map<string, THREE.Group>();
    const raycastTargets: THREE.Mesh[] = [];

    for (const site of sites) {
      const isPolar = site.region === "south_polar";
      const siteGroup = new THREE.Group();
      const pos = latLonToVector3(site.lat_deg, site.lon_deg, 1.005);
      siteGroup.position.copy(pos);
      siteGroup.lookAt(pos.clone().multiplyScalar(2.0));

      const dotGeo = new THREE.SphereGeometry(0.0065, 12, 12);
      const dotMat = new THREE.MeshBasicMaterial({
        color: isPolar ? 0x38bdf8 : 0xfbbf24,
      });
      const dot = new THREE.Mesh(dotGeo, dotMat);
      dot.userData = { siteId: site.id };
      siteGroup.add(dot);
      raycastTargets.push(dot);

      const ringG = new THREE.RingGeometry(0.011, 0.0135, 24);
      const ringM = new THREE.MeshBasicMaterial({
        color: isPolar ? 0x38bdf8 : 0xfbbf24,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.7,
      });
      const ringMesh = new THREE.Mesh(ringG, ringM);
      ringMesh.userData = { siteId: site.id };
      siteGroup.add(ringMesh);
      raycastTargets.push(ringMesh);

      scene.add(siteGroup);
      markerMap.set(site.id, siteGroup);
    }
    markersRef.current = markerMap;

    // 8. Capa Dinamica Modo Educativo: Rutas Historicas de Misiones + Zonas PSR
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
      const vA = latLonToVector3(sA.lat_deg, sA.lon_deg, 1.009);
      const vB = latLonToVector3(sB.lat_deg, sB.lon_deg, 1.009);
      const mid = vA.clone().add(vB).multiplyScalar(0.5).normalize().multiplyScalar(1.12);
      const curve = new THREE.QuadraticBezierCurve3(vA, mid, vB);
      const arcPoints = curve.getPoints(36);
      const arcGeo = new THREE.BufferGeometry().setFromPoints(arcPoints);
      const arcMat = new THREE.LineBasicMaterial({
        color: i >= 3 ? 0x38bdf8 : 0xfbbf24,
        transparent: true,
        opacity: 0.55,
      });
      eduGroup.add(new THREE.Line(arcGeo, arcMat));
    }

    for (const psrId of ["cabeus-crater", "shackleton-rim"]) {
      const psrSite = siteById.get(psrId);
      if (!psrSite) continue;
      const psrRingGeo = new THREE.RingGeometry(0.024, 0.033, 32);
      const psrRingMat = new THREE.MeshBasicMaterial({
        color: 0x06b6d4,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.55,
      });
      const psrRing = new THREE.Mesh(psrRingGeo, psrRingMat);
      const pPos = latLonToVector3(psrSite.lat_deg, psrSite.lon_deg, 1.006);
      psrRing.position.copy(pPos);
      psrRing.lookAt(pPos.clone().multiplyScalar(2.0));
      eduGroup.add(psrRing);
    }

    scene.add(eduGroup);
    eduGroupRef.current = eduGroup;

    // 9. Control de Camara Adaptativo con Sensibilidad Dinamica por Altitud y Damping Suave
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

      // Sensibilidad dinamica: proporcional a la altitud sobre la superficie (altitude = dist - 1.0)
      const altitude = Math.max(0.008, camStateRef.current.dist - 1.0);
      const dynamicRotSpeed = 0.0065 * Math.max(0.035, Math.min(1.0, altitude * 1.15));

      targetCamRef.current.yaw -= dx * dynamicRotSpeed;
      targetCamRef.current.pitch = Math.max(
        -1.568,
        Math.min(1.568, targetCamRef.current.pitch + dy * dynamicRotSpeed),
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

        const hitMarkers = raycaster.intersectObjects(raycastTargets, false);
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
      // Zoom proporcional a la altitud para acercamiento exponencial ultra preciso a baja orbita
      const altitude = Math.max(0.006, targetCamRef.current.dist - 1.0);
      const dynamicZoomStep = e.deltaY * 0.0011 * Math.max(0.025, Math.min(1.3, altitude * 0.95));
      targetCamRef.current.dist = Math.max(
        MIN_CAM_DIST,
        Math.min(MAX_CAM_DIST, targetCamRef.current.dist + dynamicZoomStep),
      );
    };

    dom.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    dom.addEventListener("wheel", onWheel, { passive: false });

    let animId = 0;
    let frameCounter = 0;
    const dampingFactor = 0.08;

    const animate = () => {
      animId = requestAnimationFrame(animate);

      // Interpolacion amortiguada (dampingFactor = 0.08)
      camStateRef.current.yaw += (targetCamRef.current.yaw - camStateRef.current.yaw) * dampingFactor;
      camStateRef.current.pitch += (targetCamRef.current.pitch - camStateRef.current.pitch) * dampingFactor;
      camStateRef.current.dist += (targetCamRef.current.dist - camStateRef.current.dist) * dampingFactor;

      const { yaw, pitch, dist } = camStateRef.current;
      camera.position.set(
        dist * Math.cos(pitch) * Math.sin(yaw),
        dist * Math.sin(pitch),
        dist * Math.cos(pitch) * Math.cos(yaw),
      );
      camera.lookAt(0, 0, 0);

      // Escalar dinamicamente el tamano de marcadores, reticula y flechas con la altitud para no tapar los crateres en Deep Zoom
      const altitude = Math.max(0.01, dist - 1.0);
      const hudScale = Math.max(0.14, Math.min(1.0, altitude * 1.15));
      if (focusReticleRef.current) {
        focusReticleRef.current.scale.setScalar(hudScale);
      }
      if (sunArrowRef.current) {
        sunArrowRef.current.scale.setScalar(hudScale);
      }
      if (earthArrowRef.current) {
        earthArrowRef.current.scale.setScalar(hudScale);
      }

      frameCounter++;
      if (frameCounter % 8 === 0) {
        const km = Math.max(15, Math.round((dist - 1.0) * 1737.4));
        setAltitudeKm(km);
        setIsDeepZoom(dist < 1.38);
      }

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
      polarCapGeo.dispose();
      polarCapMat.dispose();
      moonAlbedo.dispose();
      moonBump.dispose();
      regolithMicroGlobal.dispose();
      southPoleAlbedo.dispose();
      southPoleBump.dispose();
      regolithMicroPolar.dispose();
      innerRingGeo.dispose();
      outerRingGeo.dispose();
      reticleMat.dispose();
      tickGeo.dispose();
      tickMat.dispose();
      renderer.dispose();
    };
  }, [sites]);

  // Fly-to suave automatico cuando cambia el sitio enfocado
  useEffect(() => {
    const desiredDist = Math.min(targetCamRef.current.dist, 1.32);
    flyToCoordinate(focusedSite.lat_deg, focusedSite.lon_deg, Math.max(1.12, desiredDist));
  }, [focusedSite.lat_deg, focusedSite.lon_deg, focusedSite.site_id]);

  // Actualizar colores de marcadores, posicion de la reticula y orientacion de vectores astronomicos
  useEffect(() => {
    if (eduGroupRef.current) {
      eduGroupRef.current.visible = mode === "edu";
    }

    for (const [siteId, group] of markersRef.current.entries()) {
      const isFocused = focusedSite.site_id === siteId;
      const isSelected = selectedSiteIds.includes(siteId);

      const dot = group.children[0] as THREE.Mesh | undefined;
      const ring = group.children[1] as THREE.Mesh | undefined;
      if (dot && ring) {
        const dotMat = dot.material as THREE.MeshBasicMaterial;
        const ringMat = ring.material as THREE.MeshBasicMaterial;
        if (isFocused) {
          dotMat.color.setHex(0xfbbf24);
          ringMat.color.setHex(0xfbbf24);
          group.scale.setScalar(1.25);
        } else if (isSelected) {
          dotMat.color.setHex(0x38bdf8);
          ringMat.color.setHex(0x38bdf8);
          group.scale.setScalar(1.05);
        } else {
          dotMat.color.setHex(0x94a3b8);
          ringMat.color.setHex(0x94a3b8);
          group.scale.setScalar(0.85);
        }
      }
    }

    const sitePos = latLonToVector3(focusedSite.lat_deg, focusedSite.lon_deg, 1.006);
    if (focusReticleRef.current) {
      focusReticleRef.current.position.copy(sitePos);
      focusReticleRef.current.lookAt(sitePos.clone().multiplyScalar(2.0));
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
        sunLightRef.current.position.copy(sunDir.clone().multiplyScalar(10.0));
      }
    }
  }, [focusedSite, selectedSiteIds, currentSample, mode]);

  const focusedCuratedSite = sites.find((s) => s.id === focusedSite.site_id) ?? null;

  return (
    <div className="viewport-stage" aria-label="Globo Lunar 3D fotorrealista con texturas 4K NASA LROC y LOLA Polar LOD">
      <div className="viewport-overlay-top">
        <div className="hud-pill mono-telemetry">
          <span>Foco:</span>
          <strong>
            {focusedSite.lat_deg.toFixed(3)}°, {focusedSite.lon_deg.toFixed(3)}°
          </strong>
          <span>· Altitud: ~{altitudeKm.toLocaleString()} km</span>
        </div>

        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
          <button
            type="button"
            className="hud-btn-mini"
            onClick={() => handleZoomStep("in")}
            title="Acercar cámara (Zoom In hasta órbita baja ~25 km)"
          >
            ＋ Zoom
          </button>
          <button
            type="button"
            className="hud-btn-mini"
            onClick={() => handleZoomStep("out")}
            title="Alejar cámara (Zoom Out)"
          >
            － Zoom
          </button>
          <button
            type="button"
            className={`hud-btn-mini ${cameraPreset === "site_zoom" ? "active" : ""}`}
            onClick={() => applyCameraPreset("site_zoom")}
            title="Volar y acercar sobre el sitio seleccionado"
          >
            Enfocar Sitio
          </button>
          <button
            type="button"
            className={`hud-btn-mini ${cameraPreset === "south_pole" ? "active" : ""}`}
            onClick={() => applyCameraPreset("south_pole")}
          >
            Enfocar Polo Sur
          </button>
          <button
            type="button"
            className={`hud-btn-mini ${cameraPreset === "nearside" ? "active" : ""}`}
            onClick={() => applyCameraPreset("nearside")}
          >
            Vista Global
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
              {showEduCard ? "Ocultar Ficha" : "Ficha Histórica"}
            </button>
          )}
        </div>
      </div>

      <div ref={mountRef} style={{ width: "100%", height: "100%" }} />

      {/* Boton flotante directo a la Malla 3D Local cuando se hace Deep Zoom (o disponible en esquina derecha) */}
      {onOpenLocalTerrain3D && (
        <div
          style={{
            position: "absolute",
            right: "12px",
            bottom: "44px",
            zIndex: 14,
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: "6px",
          }}
        >
          <button
            type="button"
            onClick={onOpenLocalTerrain3D}
            style={{
              background: isDeepZoom
                ? "linear-gradient(135deg, rgba(245, 158, 11, 0.95), rgba(217, 119, 6, 0.95))"
                : "rgba(15, 23, 42, 0.88)",
              color: isDeepZoom ? "#0b0f19" : "#f8fafc",
              border: isDeepZoom ? "1px solid #fbbf24" : "1px solid rgba(56, 189, 248, 0.45)",
              borderRadius: "8px",
              padding: isDeepZoom ? "8px 13px" : "6px 10px",
              fontSize: isDeepZoom ? "0.76rem" : "0.71rem",
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: isDeepZoom ? "0 0 18px rgba(245, 158, 11, 0.55)" : "0 6px 16px rgba(0,0,0,0.45)",
              transition: "all 0.2s ease",
            }}
          >
            ⛰️ Explorar Superficie 3D Local (LOLA DEM 128×128) →
          </button>
        </div>
      )}

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
          <span style={{ color: "#a7f3d0" }}>● LOD Polar 2K Activo</span>
        </span>
        <span className="hud-pill">
          {mode === "edu"
            ? "Rueda o botones ＋/－ para Deep Zoom · Clic en un sitio vuela hacia el cráter"
            : "Rueda para Deep Zoom (~25 km) · Clic fija coordenadas selenográficas MOON_ME"}
        </span>
      </div>
    </div>
  );
}
