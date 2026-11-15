import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  isRecentCanvasPick,
  isViewingFarSideHemisphere,
  latLonToVector3,
  shortestYawDeltaRad,
  vector3ToLatLon,
} from "../src/components/LunarGlobe3D";

describe("LunarGlobe3D coordinate and camera math", () => {
  it("maps front-face global-view clicks to matching nearside coordinates and camera direction (never opposite side)", () => {
    const geo = new THREE.SphereGeometry(1.0, 64, 64);
    geo.rotateY(-Math.PI / 2);
    const moonMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());

    const cam = new THREE.PerspectiveCamera(42.0, 480 / 390, 0.005, 100);
    cam.position.set(0, 0, 3.45);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld();
    cam.updateProjectionMatrix();

    const ndcClicks: Array<[number, number]> = [
      [0, 0],
      [0.2, 0.15],
      [-0.25, -0.18],
      [0.3, -0.25],
      [-0.15, 0.3],
    ];

    for (const [nx, ny] of ndcClicks) {
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(nx, ny), cam);
      const hits = raycaster.intersectObject(moonMesh, false);
      expect(hits.length).toBeGreaterThan(0);

      const hitPoint = hits[0]!.point;
      const { lat_deg, lon_deg } = vector3ToLatLon(hitPoint);

      // Front hemisphere facing +Z must never resolve to farside longitudes
      expect(Math.abs(lon_deg)).toBeLessThan(75);
      expect(hitPoint.z).toBeGreaterThan(0.28);

      // Flying camera to (lat_deg, lon_deg) must align camera position vector with clicked hitPoint
      const pitch = (lat_deg * Math.PI) / 180.0;
      const yaw = shortestYawDeltaRad(0.0, (lon_deg * Math.PI) / 180.0);
      const targetCamDir = new THREE.Vector3(
        Math.cos(pitch) * Math.sin(yaw),
        Math.sin(pitch),
        Math.cos(pitch) * Math.cos(yaw),
      ).normalize();

      expect(targetCamDir.distanceTo(hitPoint.clone().normalize())).toBeLessThan(1e-3);
      expect(targetCamDir.dot(hitPoint.clone().normalize())).toBeGreaterThan(0.9999);
    }

    geo.dispose();
  });

  it("preserves shortest-path yaw delta within [-PI, PI] for arbitrary multi-turn prior rotations", () => {
    for (let currentYaw = -18.0; currentYaw <= 18.0; currentYaw += 0.43) {
      for (let lon = -180; lon <= 180; lon += 15) {
        const targetYaw = (lon * Math.PI) / 180.0;
        const delta = shortestYawDeltaRad(currentYaw, targetYaw);
        expect(delta).toBeGreaterThanOrEqual(-Math.PI - 1e-12);
        expect(delta).toBeLessThanOrEqual(Math.PI + 1e-12);
        const resolvedYaw = currentYaw + delta;
        expect(Math.sin(resolvedYaw)).toBeCloseTo(Math.sin(targetYaw), 10);
        expect(Math.cos(resolvedYaw)).toBeCloseTo(Math.cos(targetYaw), 10);
      }
    }
  });

  it("round-trips latLonToVector3 and vector3ToLatLon accurately across quadrants", () => {
    const samples: Array<[number, number]> = [
      [0, 0],
      [0.6741, 23.473],
      [-43.3, -11.2],
      [-86.0, 2.7],
      [-45.456, 177.588],
    ];
    for (const [lat, lon] of samples) {
      const vec = latLonToVector3(lat, lon, 1.0);
      const back = vector3ToLatLon(vec);
      expect(back.lat_deg).toBeCloseTo(lat, 3);
      expect(back.lon_deg).toBeCloseTo(lon, 3);
    }
  });

  it("suppresses camera fly-to only for matching recent direct 3D canvas picks", () => {
    const pickTime = 10_000;
    const surfacePick = { lat_deg: 5.5, lon_deg: 16.79, siteId: null, ts: pickTime };
    expect(
      isRecentCanvasPick(
        surfacePick,
        { lat_deg: 5.5, lon_deg: 16.79, site_id: null },
        pickTime + 120,
      ),
    ).toBe(true);

    const markerPick = { lat_deg: 0, lon_deg: 0, siteId: "apollo-11", ts: pickTime };
    expect(
      isRecentCanvasPick(
        markerPick,
        { lat_deg: 0.6741, lon_deg: 23.473, site_id: "apollo-11" },
        pickTime + 150,
      ),
    ).toBe(true);

    // External selection (e.g. ComparisonGrid chip) has no prior canvas pick
    expect(
      isRecentCanvasPick(
        null,
        { lat_deg: -89.54, lon_deg: 0.0, site_id: "shackleton-rim" },
        pickTime + 100,
      ),
    ).toBe(false);

    // Expired timestamp or mismatched coordinates/siteId must trigger fly-to
    expect(
      isRecentCanvasPick(
        surfacePick,
        { lat_deg: 5.5, lon_deg: 16.79, site_id: null },
        pickTime + 950,
      ),
    ).toBe(false);
    expect(
      isRecentCanvasPick(
        markerPick,
        { lat_deg: -85.0, lon_deg: 0.0, site_id: "malapert-massif" },
        pickTime + 100,
      ),
    ).toBe(false);
  });

  it("correctly classifies Near Side vs Far Side camera azimuths across multi-turn rotations", () => {
    expect(isViewingFarSideHemisphere(0)).toBe(false);
    expect(isViewingFarSideHemisphere((45 * Math.PI) / 180)).toBe(false);
    expect(isViewingFarSideHemisphere((-60 * Math.PI) / 180)).toBe(false);
    expect(isViewingFarSideHemisphere(Math.PI)).toBe(true);
    expect(isViewingFarSideHemisphere((135 * Math.PI) / 180)).toBe(true);
    expect(isViewingFarSideHemisphere((-150 * Math.PI) / 180)).toBe(true);
    expect(isViewingFarSideHemisphere(2 * Math.PI)).toBe(false);
    expect(isViewingFarSideHemisphere(3 * Math.PI)).toBe(true);
  });
});
