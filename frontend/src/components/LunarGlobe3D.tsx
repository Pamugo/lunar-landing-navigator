import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { CuratedSite, LunarCoordinate, VisibilitySample } from "../types/contracts";
import type { AppMode } from "./HeaderHUD";
import { useLanguage } from "../i18n/LanguageContext";
import { getLocalizedSiteCopy } from "../i18n/translations";

export interface LunarGlobe3DProps {
  sites: CuratedSite[];
  selectedSiteIds: string[];
  selectedSites?: LunarCoordinate[];
  focusedSite: LunarCoordinate | null;
  focusedIndex?: number;
  currentSample: VisibilitySample | null;
  mode: AppMode;
  onSelectCuratedSite: (siteId: string) => void;
  onSelectCustomCoordinate: (lat_deg: number, lon_deg: number) => void;
  onOpenLocalTerrain3D?: () => void;
}

// Calibrated limits to keep 8K/4K texture 100% sharp before Auto-LOD transition to Terrain3D
const MIN_CAM_DIST = 1.08;
const MAX_CAM_DIST = 4.2;
const MIN_FOV_DEG = 20.0;
const MAX_FOV_DEG = 45.0;
const INITIAL_GLOBAL_DIST = 3.45;
const INITIAL_GLOBAL_FOV = 42.0;
const CONSTANT_ZOOM_SPEED = 1.2;

// Mandatory cache-busting query parameter
const TEXTURE_VERSION = "v=real_lroc_v3";

/**
 * Converts MOON_ME selenographic (lat_deg, lon_deg) to 3D coordinates on a sphere of radius R.
 */
export function latLonToVector3(lat_deg: number, lon_deg: number, radius: number): THREE.Vector3 {
  const phi = (lat_deg * Math.PI) / 180.0;
  const lambda = (lon_deg * Math.PI) / 180.0;
  const x = radius * Math.cos(phi) * Math.sin(lambda);
  const y = radius * Math.sin(phi);
  const z = radius * Math.cos(phi) * Math.cos(lambda);
  return new THREE.Vector3(x, y, z);
}

export function vector3ToLatLon(point: THREE.Vector3): { lat_deg: number; lon_deg: number } {
  const norm = point.clone().normalize();
  const lat_deg = (Math.asin(Math.max(-1, Math.min(1, norm.y))) * 180.0) / Math.PI;
  const lon_deg = (Math.atan2(norm.x, norm.z) * 180.0) / Math.PI;
  return {
    lat_deg: Number(lat_deg.toFixed(4)),
    lon_deg: Number(lon_deg.toFixed(4)),
  };
}

export function shortestYawDeltaRad(currentYawRad: number, targetYawRad: number): number {
  const twoPi = 2 * Math.PI;
  return ((((targetYawRad - currentYawRad + Math.PI) % twoPi) + twoPi) % twoPi) - Math.PI;
}

export interface CanvasPickRecord {
  lat_deg: number;
  lon_deg: number;
  siteId: string | null;
  ts: number;
}

const CANVAS_PICK_SUPPRESS_FLY_MS = 800;

/**
 * Returns true when a focus change matches a direct 3D globe canvas click made
 * moments earlier, keeping the camera framing steady under the cursor.
 */
export function isRecentCanvasPick(
  pick: CanvasPickRecord | null,
  site: { lat_deg: number; lon_deg: number; site_id?: string | null } | null,
  nowMs: number,
): boolean {
  if (!pick || !site) return false;
  if (nowMs - pick.ts < 0 || nowMs - pick.ts > CANVAS_PICK_SUPPRESS_FLY_MS) {
    return false;
  }
  if (pick.siteId !== null) {
    return site.site_id === pick.siteId;
  }
  return (
    Math.abs(pick.lat_deg - site.lat_deg) < 1e-3 &&
    Math.abs(pick.lon_deg - site.lon_deg) < 1e-3
  );
}

/**
 * Returns true when the camera azimuth (yaw in radians) faces the lunar Far Side
 * (|lon| > 90°, i.e. cos(yaw) < 0 in MOON_ME coordinates where +Z is 0° lon).
 */
export function isViewingFarSideHemisphere(yawRad: number): boolean {
  return Math.cos(yawRad) < 0;
}

function disposeGroupMeshes(group: THREE.Group | null): void {
  if (!group) return;
  for (const child of group.children) {
    child.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        const mat = obj.material;
        if (Array.isArray(mat)) {
          mat.forEach((m) => m.dispose());
        } else if (mat) {
          mat.dispose();
        }
      }
    });
  }
  group.clear();
}

export function LunarGlobe3D({
  sites,
  selectedSiteIds,
  selectedSites,
  focusedSite,
  focusedIndex,
  currentSample,
  mode,
  onSelectCuratedSite,
  onSelectCustomCoordinate,
  onOpenLocalTerrain3D,
}: LunarGlobe3DProps) {
  const { lang, t } = useLanguage();
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [cameraPreset, setCameraPreset] = useState<
    "south_pole" | "nearside" | "farside" | "site_zoom" | "custom_zoom"
  >("nearside");
  const [isFarSide, setIsFarSide] = useState<boolean>(false);
  const [showEduCard, setShowEduCard] = useState<boolean>(true);
  const [crossFadeOut, setCrossFadeOut] = useState<boolean>(false);

  const camStateRef = useRef({ yaw: 0.0, pitch: 0.0, dist: INITIAL_GLOBAL_DIST, fov: INITIAL_GLOBAL_FOV });
  const targetCamRef = useRef({ yaw: 0.0, pitch: 0.0, dist: INITIAL_GLOBAL_DIST, fov: INITIAL_GLOBAL_FOV });
  const presetLockRef = useRef<"south_pole" | "site_zoom" | null>(null);
  const hadSelectionRef = useRef<boolean>(Boolean(focusedSite));
  const lastCanvasPickRef = useRef<CanvasPickRecord | null>(null);
  const autoLodCounterRef = useRef<number>(0);
  const onOpenLocalRef = useRef(onOpenLocalTerrain3D);
  onOpenLocalRef.current = onOpenLocalTerrain3D;

  const markersRef = useRef<Map<string, THREE.Group>>(new Map());
  const customMarkersGroupRef = useRef<THREE.Group | null>(null);
  const focusReticleRef = useRef<THREE.Group | null>(null);
  const sunArrowRef = useRef<THREE.ArrowHelper | null>(null);
  const earthArrowRef = useRef<THREE.ArrowHelper | null>(null);
  const sunLightRef = useRef<THREE.DirectionalLight | null>(null);
  const nightFillLightRef = useRef<THREE.DirectionalLight | null>(null);
  const eduGroupRef = useRef<THREE.Group | null>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const onSelectCuratedRef = useRef(onSelectCuratedSite);
  onSelectCuratedRef.current = onSelectCuratedSite;
  const onSelectCustomRef = useRef(onSelectCustomCoordinate);
  onSelectCustomRef.current = onSelectCustomCoordinate;

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
    const deltaYaw = shortestYawDeltaRad(currentYaw, targetYaw);

    targetCamRef.current = {
      yaw: currentYaw + deltaYaw,
      pitch: targetPitch,
      dist: targetDist !== undefined ? Math.max(MIN_CAM_DIST, Math.min(MAX_CAM_DIST, targetDist)) : targetCamRef.current.dist,
      fov: targetFov !== undefined ? Math.max(MIN_FOV_DEG, Math.min(MAX_FOV_DEG, targetFov)) : targetCamRef.current.fov,
    };
  };

  const applyCameraPreset = (preset: "south_pole" | "nearside" | "farside" | "site_zoom") => {
    autoLodCounterRef.current = 0;
    if (preset === "south_pole") {
      presetLockRef.current = "south_pole";
      setCameraPreset(preset);
      setIsFarSide(false);
      flyToCoordinate(-90.0, 0.0, 1.38, 34.0);
    } else if (preset === "site_zoom") {
      if (!focusedSite) return;
      presetLockRef.current = "site_zoom";
      setCameraPreset(preset);
      flyToCoordinate(focusedSite.lat_deg, focusedSite.lon_deg, 1.85, 34.0);
      setIsFarSide(isViewingFarSideHemisphere(targetCamRef.current.yaw));
    } else if (preset === "nearside") {
      presetLockRef.current = null;
      setCameraPreset("nearside");
      setIsFarSide(false);
      flyToCoordinate(0.0, 0.0, INITIAL_GLOBAL_DIST, INITIAL_GLOBAL_FOV);
    } else {
      presetLockRef.current = null;
      if (isFarSide) {
        setCameraPreset("nearside");
        setIsFarSide(false);
        flyToCoordinate(0.0, 0.0, INITIAL_GLOBAL_DIST, INITIAL_GLOBAL_FOV);
      } else {
        setCameraPreset("farside");
        setIsFarSide(true);
        flyToCoordinate(-10.0, 180.0, INITIAL_GLOBAL_DIST, INITIAL_GLOBAL_FOV);
      }
    }
  };

  // Constant-speed zoom (1.2) with Auto-LOD to 3D local surface when passing the orbital threshold
  const applyZoomDelta = (wheelDeltaY: number) => {
    const cur = targetCamRef.current;
    presetLockRef.current = null;
    if (wheelDeltaY < 0) {
      // If the user is already at the lower orbital limit (altitude <= 0.09 and fov <= 21 deg) and keeps zooming in,
      // perform a smooth Auto-LOD transition to the 128x128 local topographic mesh (Terrain3D.tsx)
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
    if (cur.dist < INITIAL_GLOBAL_DIST - 0.12) {
      setCameraPreset("custom_zoom");
    } else {
      const viewingFar = isViewingFarSideHemisphere(cur.yaw);
      setCameraPreset(viewingFar ? "farside" : "nearside");
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
    renderer.domElement.style.display = "block";
    // High-contrast ACES Filmic space tone mapping
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

    // 1. Realistic Airless Space Lighting + Enhanced Earthshine/Night-Side Fill
    const sunLight = new THREE.DirectionalLight(0xfffcf5, 2.65);
    sunLight.position.set(6.0, -0.2, 8.0);
    scene.add(sunLight);
    sunLightRef.current = sunLight;

    // Counter-directional fill light on the anti-solar hemisphere so craters and relief on the dark side stay visible
    const nightFillLight = new THREE.DirectionalLight(0x93c5fd, 0.48);
    nightFillLight.position.set(-6.0, 1.2, -8.0);
    scene.add(nightFillLight);
    nightFillLightRef.current = nightFillLight;

    // Balanced Earthshine hemisphere + ambient fill so the shadowed side is legible without looking washed out
    const earthshine = new THREE.HemisphereLight(0xdbeafe, 0x7c8ea6, 0.85);
    scene.add(earthshine);

    const ambientLight = new THREE.AmbientLight(0xdbeafe, 0.52);
    scene.add(ambientLight);

    // 2. 100% Real Photographic Textures from NASA LROC WAC + LOLA 16-bit (?v=real_lroc_v3)
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

    // 3. Single High-Density Lunar Sphere (256x256) without overlay meshes or procedural noise
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

    // 4. Fine NASA-style telemetry reticle for the focused site
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

    reticleGroup.visible = false;
    scene.add(reticleGroup);
    focusReticleRef.current = reticleGroup;

    // 5. 3D Vectors toward Sun (#F59E0B) and Earth (#06B6D4) - visible in Engineer Mode only
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
    sunArrow.visible = false;
    earthArrow.visible = false;
    scene.add(sunArrow);
    scene.add(earthArrow);
    sunArrowRef.current = sunArrow;
    earthArrowRef.current = earthArrow;

    // 6. Minimalist precision markers for curated sites
    const markerMap = new Map<string, THREE.Group>();
    const raycastTargets: THREE.Mesh[] = [];

    for (const site of sites) {
      const isPolar = site.region === "south_polar";
      const siteGroup = new THREE.Group();
      siteGroup.visible = false;
      const pos = latLonToVector3(site.lat_deg, site.lon_deg, 1.003);
      siteGroup.position.copy(pos);
      siteGroup.lookAt(pos.clone().multiplyScalar(2.0));

      const dotGeo = new THREE.SphereGeometry(0.0115, 16, 16);
      const dotMat = new THREE.MeshBasicMaterial({
        color: isPolar ? 0x38bdf8 : 0xfbbf24,
      });
      const dot = new THREE.Mesh(dotGeo, dotMat);
      dot.userData = { siteId: site.id };
      siteGroup.add(dot);
      raycastTargets.push(dot);

      const ringG = new THREE.RingGeometry(0.018, 0.024, 32);
      const ringM = new THREE.MeshBasicMaterial({
        color: isPolar ? 0x38bdf8 : 0xfbbf24,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.92,
      });
      const ringMesh = new THREE.Mesh(ringG, ringM);
      ringMesh.userData = { siteId: site.id };
      siteGroup.add(ringMesh);
      raycastTargets.push(ringMesh);

      // Enlarged invisible collision sphere to make clicking markers easier
      const hitGeo = new THREE.SphereGeometry(0.018, 12, 12);
      const hitMat = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0.0,
        depthWrite: false,
      });
      const hitMesh = new THREE.Mesh(hitGeo, hitMat);
      hitMesh.userData = { siteId: site.id };
      siteGroup.add(hitMesh);
      raycastTargets.push(hitMesh);

      scene.add(siteGroup);
      markerMap.set(site.id, siteGroup);
    }
    markersRef.current = markerMap;

    // 7. Educational Mode Dynamic Layer: Historic Mission Paths + PSR Zones
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
      const arcLine = new THREE.Line(arcGeo, arcMat);
      arcLine.visible = false;
      arcLine.userData = { segmentSiteIds: [sA.id, sB.id] };
      eduGroup.add(arcLine);
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
      psrRing.visible = false;
      psrRing.userData = { siteId: psrId };
      eduGroup.add(psrRing);
    }

    eduGroup.visible = false;
    scene.add(eduGroup);
    eduGroupRef.current = eduGroup;

    const customMarkersGroup = new THREE.Group();
    scene.add(customMarkersGroup);
    customMarkersGroupRef.current = customMarkersGroup;

    // 8. Camera Controls: rotateSpeed proportional to altitude and FOV; CONSTANT zoomSpeed (1.2)
    let isDragging = false;
    let dragDistance = 0;
    let prevX = 0;
    let prevY = 0;

    const dom = renderer.domElement;
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
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
      if (dragDistance > 3) {
        presetLockRef.current = null;
        const viewingFar = isViewingFarSideHemisphere(targetCamRef.current.yaw);
        setIsFarSide(viewingFar);
        if (targetCamRef.current.dist < INITIAL_GLOBAL_DIST - 0.12) {
          setCameraPreset("custom_zoom");
        } else {
          setCameraPreset(viewingFar ? "farside" : "nearside");
        }
      }
    };
    const onPointerUp = (e: PointerEvent) => {
      if (!isDragging) return;
      isDragging = false;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (dragDistance < 5) {
        const rect = dom.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        const ndc = new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1,
        );
        camera.updateMatrixWorld();
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(ndc, camera);

        const hitSphere = raycaster.intersectObject(moonMesh, false);
        const moonHitDist = hitSphere[0]?.distance ?? Infinity;

        const hitMarkers = raycaster
          .intersectObjects(raycastTargets, false)
          .filter((hit) => hit.object.parent?.visible === true && hit.distance <= moonHitDist + 0.02);
        if (hitMarkers.length > 0 && hitMarkers[0]) {
          const siteId = hitMarkers[0].object.userData.siteId as string | undefined;
          if (siteId) {
            lastCanvasPickRef.current = {
              lat_deg: 0,
              lon_deg: 0,
              siteId,
              ts: performance.now(),
            };
            onSelectCuratedRef.current(siteId);
            return;
          }
        }

        if (hitSphere.length > 0 && hitSphere[0]) {
          const { lat_deg, lon_deg } = vector3ToLatLon(hitSphere[0].point);
          lastCanvasPickRef.current = {
            lat_deg,
            lon_deg,
            siteId: null,
            ts: performance.now(),
          };
          onSelectCustomRef.current(lat_deg, lon_deg);
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

      // Scale markers and reticle with altitude and FOV to keep visual size crisp
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
      const markerScale = Math.max(0.22, Math.min(1.35, visualScale * 1.2));
      for (const group of markersRef.current.values()) {
        group.scale.setScalar(markerScale);
      }
      if (customMarkersGroupRef.current) {
        for (const pinGroup of customMarkersGroupRef.current.children) {
          pinGroup.scale.setScalar(markerScale);
        }
      }

      frameCounter++;
      if (frameCounter % 6 === 0) {
        const viewingFar = isViewingFarSideHemisphere(targetCamRef.current.yaw);
        setIsFarSide(viewingFar);
        if (!presetLockRef.current) {
          if (targetCamRef.current.dist < INITIAL_GLOBAL_DIST - 0.12) {
            setCameraPreset("custom_zoom");
          } else {
            setCameraPreset(viewingFar ? "farside" : "nearside");
          }
        }
      }

      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || 480;
      const h = container.clientHeight || 380;
      if (w <= 0 || h <= 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);
    const resizeObserver =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => onResize()) : null;
    resizeObserver?.observe(container);

    return () => {
      cancelAnimationFrame(animId);
      dom.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      dom.removeEventListener("wheel", onWheel);
      window.removeEventListener("resize", onResize);
      resizeObserver?.disconnect();
      disposeGroupMeshes(customMarkersGroupRef.current);
      customMarkersGroupRef.current = null;
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

  // Keep Near Side / Far Side button label and preset strictly synchronized with live camera orientation
  useEffect(() => {
    let syncId = 0;
    const syncHemisphere = () => {
      syncId = requestAnimationFrame(syncHemisphere);
      const viewingFar = isViewingFarSideHemisphere(targetCamRef.current.yaw);
      setIsFarSide((prev) => (prev !== viewingFar ? viewingFar : prev));
      if (!presetLockRef.current) {
        const nextPreset =
          targetCamRef.current.dist < INITIAL_GLOBAL_DIST - 0.12
            ? "custom_zoom"
            : viewingFar
              ? "farside"
              : "nearside";
        setCameraPreset((prev) => (prev !== nextPreset ? nextPreset : prev));
      }
    };
    syncId = requestAnimationFrame(syncHemisphere);
    return () => cancelAnimationFrame(syncId);
  }, []);

  // Automatic smooth fly-to when focused site changes externally; keep camera steady on direct canvas clicks
  useEffect(() => {
    if (!focusedSite) {
      lastCanvasPickRef.current = null;
      if (hadSelectionRef.current) {
        hadSelectionRef.current = false;
        presetLockRef.current = null;
        setCameraPreset("nearside");
        setIsFarSide(false);
        flyToCoordinate(0.0, 0.0, INITIAL_GLOBAL_DIST, INITIAL_GLOBAL_FOV);
      }
      return;
    }
    hadSelectionRef.current = true;
    const recentPick = lastCanvasPickRef.current;
    lastCanvasPickRef.current = null;
    if (isRecentCanvasPick(recentPick, focusedSite, performance.now())) {
      return;
    }
    presetLockRef.current = null;
    const nextDist = Math.min(targetCamRef.current.dist, INITIAL_GLOBAL_DIST);
    const nextFov = Math.min(targetCamRef.current.fov, INITIAL_GLOBAL_FOV);
    flyToCoordinate(
      focusedSite.lat_deg,
      focusedSite.lon_deg,
      Math.max(MIN_CAM_DIST, nextDist),
      Math.max(MIN_FOV_DEG, nextFov),
    );
    const viewingFar = isViewingFarSideHemisphere(targetCamRef.current.yaw);
    setIsFarSide(viewingFar);
    setCameraPreset(
      nextDist < INITIAL_GLOBAL_DIST - 0.12 ? "custom_zoom" : viewingFar ? "farside" : "nearside",
    );
  }, [focusedSite?.lat_deg, focusedSite?.lon_deg, focusedSite?.site_id]);

  // Update marker colors, reticle position, and astronomical vector orientations
  useEffect(() => {
    if (eduGroupRef.current) {
      const isEdu = mode === "edu";
      eduGroupRef.current.visible = isEdu;
      for (const child of eduGroupRef.current.children) {
        const seg = child.userData.segmentSiteIds as [string, string] | undefined;
        const singleId = child.userData.siteId as string | undefined;
        if (seg) {
          child.visible =
            isEdu &&
            (selectedSiteIds.includes(seg[0]) || focusedSite?.site_id === seg[0]) &&
            (selectedSiteIds.includes(seg[1]) || focusedSite?.site_id === seg[1]);
        } else if (singleId) {
          child.visible = isEdu && (selectedSiteIds.includes(singleId) || focusedSite?.site_id === singleId);
        } else {
          child.visible = false;
        }
      }
    }

    for (const [siteId, group] of markersRef.current.entries()) {
      const isFocused = Boolean(focusedSite && focusedSite.site_id === siteId);
      const isSelected = selectedSiteIds.includes(siteId);
      group.visible = isFocused || isSelected;

      const dot = group.children[0] as THREE.Mesh | undefined;
      const ring = group.children[1] as THREE.Mesh | undefined;
      if (dot && ring) {
        const dotMat = dot.material as THREE.MeshBasicMaterial;
        const ringMat = ring.material as THREE.MeshBasicMaterial;
        if (isFocused) {
          dotMat.color.setHex(0xfbbf24);
          ringMat.color.setHex(0xfbbf24);
          dot.scale.setScalar(1.2);
          ring.scale.setScalar(1.18);
        } else if (isSelected) {
          dotMat.color.setHex(0x38bdf8);
          ringMat.color.setHex(0x38bdf8);
          dot.scale.setScalar(1.05);
          ring.scale.setScalar(1.05);
        } else {
          dotMat.color.setHex(0x94a3b8);
          ringMat.color.setHex(0x94a3b8);
          dot.scale.setScalar(1.0);
          ring.scale.setScalar(1.0);
        }
      }
    }

    // Render 3D surface beacon pins for custom coordinates active in the comparator
    const customGroup = customMarkersGroupRef.current;
    if (customGroup) {
      disposeGroupMeshes(customGroup);
      const curatedIds = new Set(sites.map((s) => s.id));
      for (const [idx, coord] of (selectedSites ?? []).entries()) {
        if (coord.site_id && curatedIds.has(coord.site_id)) continue;
        const isFocusedCustom =
          focusedIndex !== undefined
            ? idx === focusedIndex
            : Boolean(
                focusedSite &&
                  !focusedSite.site_id &&
                  Math.abs(focusedSite.lat_deg - coord.lat_deg) < 1e-4 &&
                  Math.abs(focusedSite.lon_deg - coord.lon_deg) < 1e-4,
              );
        const pinColor = isFocusedCustom ? 0xfbbf24 : 0x38bdf8;
        const pinGroup = new THREE.Group();
        const pinPos = latLonToVector3(coord.lat_deg, coord.lon_deg, 1.003);
        pinGroup.position.copy(pinPos);
        pinGroup.lookAt(pinPos.clone().multiplyScalar(2.0));

        const pinDot = new THREE.Mesh(
          new THREE.SphereGeometry(isFocusedCustom ? 0.0135 : 0.0115, 16, 16),
          new THREE.MeshBasicMaterial({ color: pinColor }),
        );
        const pinRing = new THREE.Mesh(
          new THREE.RingGeometry(0.018, 0.024, 32),
          new THREE.MeshBasicMaterial({
            color: pinColor,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.92,
          }),
        );
        pinGroup.add(pinDot, pinRing);
        customGroup.add(pinGroup);
      }
    }

    if (!focusedSite) {
      if (focusReticleRef.current) {
        focusReticleRef.current.visible = false;
      }
      if (sunArrowRef.current) {
        sunArrowRef.current.visible = false;
      }
      if (earthArrowRef.current) {
        earthArrowRef.current.visible = false;
      }
      if (sunLightRef.current) {
        sunLightRef.current.position.set(6.0, -0.2, 8.0);
      }
      if (nightFillLightRef.current) {
        nightFillLightRef.current.position.set(-6.0, 1.2, -8.0);
      }
      return;
    }

    const sitePos = latLonToVector3(focusedSite.lat_deg, focusedSite.lon_deg, 1.004);
    if (focusReticleRef.current) {
      focusReticleRef.current.visible = true;
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

    const showTechVectors = mode === "eng";
    if (sunArrowRef.current) {
      sunArrowRef.current.visible = showTechVectors && Boolean(currentSample);
    }
    if (earthArrowRef.current) {
      earthArrowRef.current.visible = showTechVectors && Boolean(currentSample);
    }

    if (currentSample && sunArrowRef.current && earthArrowRef.current) {
      const sunDir = azElToDir(currentSample.sun.azimuth_deg, currentSample.sun.elevation_deg);
      const earthDir = azElToDir(currentSample.earth.azimuth_deg, currentSample.earth.elevation_deg);

      sunArrowRef.current.position.copy(sitePos);
      sunArrowRef.current.setDirection(sunDir);

      earthArrowRef.current.position.copy(sitePos);
      earthArrowRef.current.setDirection(earthDir);

      if (sunLightRef.current) {
        sunLightRef.current.position.copy(sunDir.clone().multiplyScalar(10.0));
      }
      if (nightFillLightRef.current) {
        nightFillLightRef.current.position.copy(sunDir.clone().multiplyScalar(-10.0));
      }
    }
  }, [focusedSite, focusedIndex, selectedSiteIds, selectedSites, currentSample, mode, sites]);

  const focusedCuratedSite = focusedSite ? sites.find((s) => s.id === focusedSite.site_id) ?? null : null;
  const localizedFocusedSite = focusedCuratedSite ? getLocalizedSiteCopy(focusedCuratedSite, lang) : null;

  return (
    <div
      className="viewport-stage"
      aria-label={t.globe.stageAria}
      style={{
        opacity: crossFadeOut ? 0.08 : 1.0,
        transition: "opacity 0.22s ease-out",
      }}
    >
      <div className="viewport-overlay-top">
        <div />

        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
          <button
            type="button"
            className="hud-btn-mini"
            onClick={() => handleZoomButton("in")}
            title={t.globe.zoomInTitle}
          >
            {t.globe.zoomInBtn}
          </button>
          <button
            type="button"
            className="hud-btn-mini"
            onClick={() => handleZoomButton("out")}
            title={t.globe.zoomOutTitle}
          >
            {t.globe.zoomOutBtn}
          </button>
          <button
            type="button"
            className={`hud-btn-mini ${cameraPreset === "site_zoom" ? "active" : ""}`}
            onClick={() => applyCameraPreset("site_zoom")}
            title={t.globe.focusSiteTitle}
            disabled={!focusedSite}
            style={!focusedSite ? { opacity: 0.45, cursor: "not-allowed" } : undefined}
          >
            {t.globe.focusSiteBtn}
          </button>
          <button
            type="button"
            className={`hud-btn-mini ${cameraPreset === "nearside" || cameraPreset === "farside" ? "active" : ""}`}
            onClick={() => applyCameraPreset("nearside")}
          >
            {t.globe.globalViewBtn}
          </button>
          <button
            type="button"
            className="hud-btn-mini"
            onClick={() => applyCameraPreset("farside")}
          >
            {isFarSide ? t.globe.nearSideBtn : t.globe.farSideBtn}
          </button>
          {mode === "eng" && (
            <button
              type="button"
              className={`hud-btn-mini ${cameraPreset === "south_pole" ? "active" : ""}`}
              onClick={() => applyCameraPreset("south_pole")}
            >
              {t.globe.focusSouthPoleBtn}
            </button>
          )}
          {mode === "edu" && (
            <button
              type="button"
              className={`hud-btn-mini ${showEduCard ? "active" : ""}`}
              onClick={() => setShowEduCard((v) => !v)}
            >
              {showEduCard ? t.globe.hideCardBtn : t.globe.showCardBtn}
            </button>
          )}
        </div>
      </div>

      <div ref={mountRef} style={{ width: "100%", height: "100%" }} />

      {/* Interactive Mission History and PSR Info Card in Educational Mode */}
      {mode === "edu" && showEduCard && focusedCuratedSite && localizedFocusedSite && (
        <div
          style={{
            position: "absolute",
            left: "10px",
            bottom: "50px",
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
              {localizedFocusedSite.name}
            </strong>
            <span className="mission-badge">{localizedFocusedSite.mission}</span>
          </div>
          <p style={{ margin: "5px 0", lineHeight: 1.38 }}>{localizedFocusedSite.description_edu}</p>
          <div
            style={{
              fontSize: "0.68rem",
              color: "var(--dte-cyan)",
              borderTop: "1px solid rgba(255,255,255,0.08)",
              paddingTop: "4px",
            }}
          >
            {focusedCuratedSite.id === "cabeus-crater"
              ? t.globe.psrCabeusNote
              : focusedCuratedSite.region === "south_polar"
                ? t.globe.psrPolarPeakNote
                : t.globe.historicMilestoneNote}
          </div>
        </div>
      )}

      <div className="viewport-overlay-bottom">
        {mode === "eng" && (
          <span className="hud-pill">
            <span style={{ color: "var(--solar-amber)" }}>{t.globe.sunVectorLegend}</span>
            <span style={{ color: "var(--dte-cyan)" }}>{t.globe.earthVectorLegend}</span>
          </span>
        )}
        <span
          className="hud-pill"
          style={
            mode === "edu"
              ? {
                  fontSize: "14px",
                  fontWeight: 600,
                  padding: "8px 15px",
                  color: "#F8FAFC",
                  background: "rgba(15, 23, 42, 0.92)",
                  border: "1px solid rgba(56, 189, 248, 0.45)",
                  boxShadow: "0 4px 14px rgba(0, 0, 0, 0.5)",
                }
              : undefined
          }
        >
          {mode === "edu" ? t.globe.eduHint : t.globe.engHint}
        </span>
      </div>
    </div>
  );
}
