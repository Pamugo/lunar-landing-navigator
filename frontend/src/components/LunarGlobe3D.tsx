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

// Limites calibrados para mantener la textura 8K/4K 100 % nitida antes del Auto-LOD a Terrain3D
const MIN_CAM_DIST = 1.08;
const MAX_CAM_DIST = 4.2;
const MIN_FOV_DEG = 20.0;
const MAX_FOV_DEG = 45.0;
const CONSTANT_ZOOM_SPEED = 1.2;

// Parametro obligatorio de cache-busting
const TEXTURE_VERSION = "v=real_lroc_v3";

/**
 * Convierte (lat_deg, lon_deg) selenograficos MOON_ME a coordenadas 3D en una esfera de radio R.
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
  const [altitudeKm, setAltitudeKm] = useState<number>(Math.round((1.85 - 1.0) * 1737.4));
  const [fovDeg, setFovDeg] = useState<number>(38.0);
  const [isLowOrbit, setIsLowOrbit] = useState<boolean>(false);
  const [crossFadeOut, setCrossFadeOut] = useState<boolean>(false);

  const camStateRef = useRef({ yaw: 0.15, pitch: -1.38, dist: 1.85, fov: 38.0 });
  const targetCamRef = useRef({ yaw: 0.15, pitch: -1.38, dist: 1.85, fov: 38.0 });
  const autoLodCounterRef = useRef<number>(0);
  const onOpenLocalRef = useRef(onOpenLocalTerrain3D);
  onOpenLocalRef.current = onOpenLocalTerrain3D;

  const markersRef = useRef<Map<string, THREE.Group>>(new Map());
  const focusReticleRef = useRef<THREE.Group | null>(null);
  const sunArrowRef = useRef<THREE.ArrowHelper | null>(null);
  const earthArrowRef = useRef<THREE.ArrowHelper | null>(null);
  const sunLightRef = useRef<THREE.DirectionalLight | null>(null);
  const eduGroupRef = useRef<THREE.Group | null>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const triggerSmoothSurfaceTransition = () => {
    if (!onOpenLocalRef.current) return;
    setCrossFadeOut(true);
    window.setTimeout(() => {
      onOpenLocalRef.current?.();
    }, 220);
  };

  const flyToCoordinate = (lat_deg: number, lon_deg: number, targetDist?: number, targetFov?: number) => {
    const targetPitch = Math.max(-1.568, Math.min(1.568, (lat_deg * Math.PI) / 180.0));
    const targetYaw = (lon_deg * Math.PI) / 180.0;
    const currentYaw = targetCamRef.current.yaw;
    let deltaYaw = ((targetYaw - currentYaw + Math.PI) % (2 * Math.PI)) - Math.PI;
    if (deltaYaw < -Math.PI) deltaYaw += 2 * Math.PI;

    targetCamRef.current = {
      yaw: currentYaw + deltaYaw,
      pitch: targetPitch,
      dist: targetDist !== undefined ? Math.max(MIN_CAM_DIST, Math.min(MAX_CAM_DIST, targetDist)) : targetCamRef.current.dist,
      fov: targetFov !== undefined ? Math.max(MIN_FOV_DEG, Math.min(MAX_FOV_DEG, targetFov)) : targetCamRef.current.fov,
    };
  };

  const applyCameraPreset = (preset: "south_pole" | "nearside" | "farside" | "site_zoom") => {
    setCameraPreset(preset);
    autoLodCounterRef.current = 0;
    if (preset === "south_pole") {
      flyToCoordinate(-86.5, 0.0, 1.38, 34.0);
    } else if (preset === "site_zoom") {
      flyToCoordinate(focusedSite.lat_deg, focusedSite.lon_deg, 1.12, 22.0);
    } else if (preset === "nearside") {
      flyToCoordinate(0.0, 0.0, 2.65, 40.0);
    } else {
      flyToCoordinate(-10.0, 180.0, 2.65, 40.0);
    }
  };

  // Zoom de velocidad constante (1.2) con Auto-LOD hacia la superficie 3D al superar el limite orbital
  const applyZoomDelta = (wheelDeltaY: number) => {
    const cur = targetCamRef.current;
    if (wheelDeltaY < 0) {
      // Si el usuario ya esta en el limite orbital inferior (altitude <= 0.09 y fov <= 21°) y sigue haciendo zoom in,
      // realizar transicion automatica suave (Auto-LOD) hacia la malla topografica local 128x128 (Terrain3D.tsx)
      if (cur.dist <= MIN_CAM_DIST + 0.015 && cur.fov <= MIN_FOV_DEG + 1.5) {
        autoLodCounterRef.current += 1;
        if (autoLodCounterRef.current >= 2) {
          autoLodCounterRef.current = 0;
          triggerSmoothSurfaceTransition();
          return;
        }
      }
      const distStep = wheelDeltaY * 0.0018 * CONSTANT_ZOOM_SPEED;
      cur.dist = Math.max(MIN_CAM_DIST, cur.dist + distStep);
      if (cur.dist < 1.45) {
        const fovStep = wheelDeltaY * 0.028 * CONSTANT_ZOOM_SPEED;
        cur.fov = Math.max(MIN_FOV_DEG, cur.fov + fovStep);
      }
    } else {
      autoLodCounterRef.current = 0;
      if (cur.fov < 40.0) {
        const fovStep = wheelDeltaY * 0.032 * CONSTANT_ZOOM_SPEED;
        cur.fov = Math.min(MAX_FOV_DEG, cur.fov + fovStep);
      }
      if (cur.fov >= 26.0) {
        const distStep = wheelDeltaY * 0.0018 * CONSTANT_ZOOM_SPEED;
        cur.dist = Math.min(MAX_CAM_DIST, cur.dist + distStep);
      }
    }
  };

  const handleZoomButton = (direction: "in" | "out") => {
    if (
      direction === "in" &&
      targetCamRef.current.dist <= MIN_CAM_DIST + 0.02 &&
      targetCamRef.current.fov <= MIN_FOV_DEG + 1.5
    ) {
      triggerSmoothSurfaceTransition();
      return;
    }
    applyZoomDelta(direction === "in" ? -160 : 160);
  };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 480;
    const height = container.clientHeight || 380;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.005, 100);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch {
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2.0));
    renderer.setSize(width, height);
    // Mapeo tonal fotografico ACES Filmic de alto contraste espacial
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;

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

    // 1. Iluminacion Espacial Realista sin Atmosfera (Alto Contraste: sombras profundas en crateres)
    const sunLight = new THREE.DirectionalLight(0xfffcf5, 2.8);
    sunLight.position.set(10, 0, 0);
    scene.add(sunLight);
    sunLightRef.current = sunLight;

    // Luz ambiental minima (0.06) para preservar el contraste real del terminador lunar
    const earthshine = new THREE.HemisphereLight(0x1e293b, 0x020617, 0.06);
    scene.add(earthshine);

    // 2. Texturas 100 % Fotograficas Reales de NASA LROC WAC + LOLA 16-bit (?v=real_lroc_v3)
    const texLoader = new THREE.TextureLoader();

    const moonAlbedo = texLoader.load(`/textures/moon_albedo_map.jpg?${TEXTURE_VERSION}`, () => {
      configureTexture(moonAlbedo, true);
    });
    configureTexture(moonAlbedo, true);

    const moonBump = texLoader.load(`/textures/moon_bump_lola.jpg?${TEXTURE_VERSION}`, () => {
      configureTexture(moonBump, false);
    });
    configureTexture(moonBump, false);

    const moonNormal = texLoader.load(`/textures/moon_normal_lola.jpg?${TEXTURE_VERSION}`, () => {
      configureTexture(moonNormal, false);
    });
    configureTexture(moonNormal, false);

    // 3. Esfera Lunar Unica de Alta Densidad (256x256) sin mallas superpuestas ni ruido procedimental
    const isMobile = window.innerWidth < 768;
    const segments = isMobile ? 160 : 256;
    const moonGeo = new THREE.SphereGeometry(1.0, segments, segments);
    moonGeo.rotateY(-Math.PI / 2);

    const moonMat = new THREE.MeshStandardMaterial({
      map: moonAlbedo,
      bumpMap: moonBump,
      bumpScale: 0.038,
      normalMap: moonNormal,
      normalScale: new THREE.Vector2(1.8, 1.8),
      roughness: 0.92,
      metalness: 0.0,
    });
    const moonMesh = new THREE.Mesh(moonGeo, moonMat);
    scene.add(moonMesh);

    // 4. Reticula de telemetria fina tipo NASA para el sitio enfocado
    const reticleGroup = new THREE.Group();
    const innerRingGeo = new THREE.RingGeometry(0.014, 0.017, 32);
    const reticleMat = new THREE.MeshBasicMaterial({
      color: 0xfbbf24,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.92,
      depthTest: false,
    });
    const innerRing = new THREE.Mesh(innerRingGeo, reticleMat);
    reticleGroup.add(innerRing);

    const outerRingGeo = new THREE.RingGeometry(0.023, 0.025, 32);
    const outerRing = new THREE.Mesh(outerRingGeo, reticleMat);
    reticleGroup.add(outerRing);

    const tickMat = new THREE.LineBasicMaterial({
      color: 0xfbbf24,
      transparent: true,
      opacity: 0.88,
      depthTest: false,
    });
    const tickPoints = [
      new THREE.Vector3(0, 0.017, 0),
      new THREE.Vector3(0, 0.030, 0),
      new THREE.Vector3(0, -0.017, 0),
      new THREE.Vector3(0, -0.030, 0),
      new THREE.Vector3(0.017, 0, 0),
      new THREE.Vector3(0.030, 0, 0),
      new THREE.Vector3(-0.017, 0, 0),
      new THREE.Vector3(-0.030, 0, 0),
    ];
    const tickGeo = new THREE.BufferGeometry().setFromPoints(tickPoints);
    const tickLines = new THREE.LineSegments(tickGeo, tickMat);
    reticleGroup.add(tickLines);

    scene.add(reticleGroup);
    focusReticleRef.current = reticleGroup;

    // 5. Vectores 3D hacia el Sol (#F59E0B) y la Tierra (#06B6D4)
    const sunArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, -1, 0),
      0.40,
      0xf59e0b,
      0.065,
      0.032,
    );
    const earthArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, -1, 0),
      0.40,
      0x06b6d4,
      0.065,
      0.032,
    );
    scene.add(sunArrow);
    scene.add(earthArrow);
    sunArrowRef.current = sunArrow;
    earthArrowRef.current = earthArrow;

    // 6. Marcadores minimalistas de precision para los sitios curados
    const markerMap = new Map<string, THREE.Group>();
    const raycastTargets: THREE.Mesh[] = [];

    for (const site of sites) {
      const isPolar = site.region === "south_polar";
      const siteGroup = new THREE.Group();
      const pos = latLonToVector3(site.lat_deg, site.lon_deg, 1.003);
      siteGroup.position.copy(pos);
      siteGroup.lookAt(pos.clone().multiplyScalar(2.0));

      const dotGeo = new THREE.SphereGeometry(0.0055, 12, 12);
      const dotMat = new THREE.MeshBasicMaterial({
        color: isPolar ? 0x38bdf8 : 0xfbbf24,
      });
      const dot = new THREE.Mesh(dotGeo, dotMat);
      dot.userData = { siteId: site.id };
      siteGroup.add(dot);
      raycastTargets.push(dot);

      const ringG = new THREE.RingGeometry(0.0095, 0.012, 24);
      const ringM = new THREE.MeshBasicMaterial({
        color: isPolar ? 0x38bdf8 : 0xfbbf24,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.72,
      });
      const ringMesh = new THREE.Mesh(ringG, ringM);
      ringMesh.userData = { siteId: site.id };
      siteGroup.add(ringMesh);
      raycastTargets.push(ringMesh);

      scene.add(siteGroup);
      markerMap.set(site.id, siteGroup);
    }
    markersRef.current = markerMap;

    // 7. Capa Dinamica Modo Educativo: Rutas Historicas de Misiones + Zonas PSR
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
      const vA = latLonToVector3(sA.lat_deg, sA.lon_deg, 1.006);
      const vB = latLonToVector3(sB.lat_deg, sB.lon_deg, 1.006);
      const mid = vA.clone().add(vB).multiplyScalar(0.5).normalize().multiplyScalar(1.11);
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
      const psrRingGeo = new THREE.RingGeometry(0.022, 0.030, 32);
      const psrRingMat = new THREE.MeshBasicMaterial({
        color: 0x06b6d4,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.55,
      });
      const psrRing = new THREE.Mesh(psrRingGeo, psrRingMat);
      const pPos = latLonToVector3(psrSite.lat_deg, psrSite.lon_deg, 1.004);
      psrRing.position.copy(pPos);
      psrRing.lookAt(pPos.clone().multiplyScalar(2.0));
      eduGroup.add(psrRing);
    }

    scene.add(eduGroup);
    eduGroupRef.current = eduGroup;

    // 8. Control de Camara: rotateSpeed proporcional a altitud y FOV; zoomSpeed CONSTANTE (1.2)
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

      const altitudeFactor = Math.max(0.12, Math.min(1.0, (camStateRef.current.dist - 1.0) * 1.4));
      const fovFactor = camStateRef.current.fov / 42.0;
      const dynamicRotSpeed = 0.0065 * altitudeFactor * fovFactor;

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
      applyZoomDelta(e.deltaY);
    };

    dom.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    dom.addEventListener("wheel", onWheel, { passive: false });

    let animId = 0;
    let frameCounter = 0;
    const dampingFactor = 0.1;

    const animate = () => {
      animId = requestAnimationFrame(animate);

      camStateRef.current.yaw += (targetCamRef.current.yaw - camStateRef.current.yaw) * dampingFactor;
      camStateRef.current.pitch += (targetCamRef.current.pitch - camStateRef.current.pitch) * dampingFactor;
      camStateRef.current.dist += (targetCamRef.current.dist - camStateRef.current.dist) * dampingFactor;
      camStateRef.current.fov += (targetCamRef.current.fov - camStateRef.current.fov) * dampingFactor;

      const { yaw, pitch, dist, fov } = camStateRef.current;
      camera.position.set(
        dist * Math.cos(pitch) * Math.sin(yaw),
        dist * Math.sin(pitch),
        dist * Math.cos(pitch) * Math.cos(yaw),
      );
      camera.lookAt(0, 0, 0);

      if (Math.abs(camera.fov - fov) > 0.005) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }

      // Escalar marcadores y reticula con altitud y FOV para mantener tamano visual limpio
      const visualScale = Math.max(0.16, Math.min(1.0, (dist - 1.0) * (fov / 38.0) * 1.35));
      if (focusReticleRef.current) {
        focusReticleRef.current.scale.setScalar(visualScale);
      }
      if (sunArrowRef.current) {
        sunArrowRef.current.scale.setScalar(visualScale);
      }
      if (earthArrowRef.current) {
        earthArrowRef.current.scale.setScalar(visualScale);
      }
      for (const group of markersRef.current.values()) {
        group.scale.setScalar(Math.max(0.18, Math.min(1.2, visualScale * 1.15)));
      }

      frameCounter++;
      if (frameCounter % 6 === 0) {
        const km = Math.max(135, Math.round((dist - 1.0) * 1737.4));
        setAltitudeKm(km);
        setFovDeg(Number(fov.toFixed(0)));
        setIsLowOrbit(dist - 1.0 < 0.20);
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
      moonAlbedo.dispose();
      moonBump.dispose();
      moonNormal.dispose();
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
    const nextDist = Math.min(targetCamRef.current.dist, 1.32);
    const nextFov = Math.min(targetCamRef.current.fov, 30.0);
    flyToCoordinate(focusedSite.lat_deg, focusedSite.lon_deg, Math.max(MIN_CAM_DIST, nextDist), Math.max(MIN_FOV_DEG, nextFov));
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
        } else if (isSelected) {
          dotMat.color.setHex(0x38bdf8);
          ringMat.color.setHex(0x38bdf8);
        } else {
          dotMat.color.setHex(0x94a3b8);
          ringMat.color.setHex(0x94a3b8);
        }
      }
    }

    const sitePos = latLonToVector3(focusedSite.lat_deg, focusedSite.lon_deg, 1.004);
    if (focusReticleRef.current) {
      focusReticleRef.current.position.copy(sitePos);
      focusReticleRef.current.lookAt(sitePos.clone().multiplyScalar(2.0));
    }

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
    <div
      className="viewport-stage"
      aria-label="Globo Lunar 3D fotorrealista con fotografia real NASA LROC WAC y Auto-LOD a Terreno 3D"
      style={{
        opacity: crossFadeOut ? 0.08 : 1.0,
        transition: "opacity 0.22s ease-out",
      }}
    >
      <div className="viewport-overlay-top">
        <div className="hud-pill mono-telemetry">
          <span>Foco:</span>
          <strong>
            {focusedSite.lat_deg.toFixed(3)}°, {focusedSite.lon_deg.toFixed(3)}°
          </strong>
          <span>· FOV {fovDeg}°</span>
          <span>· Altitud: ~{altitudeKm.toLocaleString()} km</span>
        </div>

        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
          <button
            type="button"
            className="hud-btn-mini"
            onClick={() => handleZoomButton("in")}
            title="Acercar cámara (en órbita baja salta automáticamente a Superficie 3D LOLA)"
          >
            ＋ Zoom
          </button>
          <button
            type="button"
            className="hud-btn-mini"
            onClick={() => handleZoomButton("out")}
            title="Alejar cámara (Zoom Out)"
          >
            － Zoom
          </button>
          <button
            type="button"
            className={`hud-btn-mini ${cameraPreset === "site_zoom" ? "active" : ""}`}
            onClick={() => applyCameraPreset("site_zoom")}
            title="Volar a órbita baja sobre el sitio seleccionado"
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

      {/* Boton y aviso de Auto-LOD hacia la Superficie 3D Local de Alta Resolucion (Terrain3D.tsx) */}
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
          {isLowOrbit && (
            <span
              style={{
                background: "rgba(15, 23, 42, 0.9)",
                color: "#fbbf24",
                border: "1px solid rgba(251, 191, 36, 0.45)",
                borderRadius: "6px",
                padding: "4px 8px",
                fontSize: "0.68rem",
              }}
            >
              Sigue haciendo Zoom In para descenso automático a Superficie 3D LOLA
            </span>
          )}
          <button
            type="button"
            onClick={triggerSmoothSurfaceTransition}
            style={{
              background: isLowOrbit
                ? "linear-gradient(135deg, rgba(245, 158, 11, 0.95), rgba(217, 119, 6, 0.95))"
                : "rgba(15, 23, 42, 0.88)",
              color: isLowOrbit ? "#0b0f19" : "#f8fafc",
              border: isLowOrbit ? "1px solid #fbbf24" : "1px solid rgba(56, 189, 248, 0.45)",
              borderRadius: "8px",
              padding: isLowOrbit ? "8px 13px" : "6px 10px",
              fontSize: isLowOrbit ? "0.76rem" : "0.71rem",
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: isLowOrbit ? "0 0 18px rgba(245, 158, 11, 0.55)" : "0 6px 16px rgba(0,0,0,0.45)",
              transition: "all 0.2s ease",
            }}
          >
            ⛰️ Descender a Superficie 3D Local (LOLA DEM 128×128) →
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
          <span style={{ color: "#a7f3d0" }}>● Mosaico Fotográfico NASA LROC WAC + LOLA 16-bit</span>
        </span>
        <span className="hud-pill">
          {mode === "edu"
            ? "Rueda para acercar (Auto-LOD a Superficie 3D) · Clic en un marcador vuela al sitio"
            : "Zoom con transición automática a Terreno 3D LOLA · Clic fija coordenadas MOON_ME"}
        </span>
      </div>
    </div>
  );
}
