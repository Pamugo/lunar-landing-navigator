import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import bootstrapJson from "../public/static-api/bootstrap.json";
import horizonsJson from "../public/static-api/horizons.json";
import presetsJson from "../public/static-api/presets.json";
import terrainPatchesJson from "../public/static-api/terrain_patches.json";
import {
  staticCompareSites,
  staticFetchHorizon,
  staticFetchSolarEnergy,
  staticFetchTerrainPatch,
  staticFetchVisibility,
  staticHealth,
  staticListHardwareProfiles,
  staticListSites,
} from "../src/services/staticFallback";

const STATIC_BUNDLES: Record<string, unknown> = {
  "bootstrap.json": bootstrapJson,
  "horizons.json": horizonsJson,
  "presets.json": presetsJson,
  "terrain_patches.json": terrainPatchesJson,
};

describe("Static fallback service for GitHub Pages deployment", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const urlStr = typeof input === "string" ? input : input.toString();
        const filename = urlStr.split("/static-api/")[1] ?? "";
        const payload = STATIC_BUNDLES[filename];
        if (!payload) {
          return new Response("Not found", { status: 404 });
        }
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads health seal, 9 curated sites, and 5 hardware profiles", async () => {
    const [health, sites, hws] = await Promise.all([
      staticHealth(),
      staticListSites(),
      staticListHardwareProfiles(),
    ]);
    expect(health.status).toBe("ok");
    expect(health.scientific_seal.refraction).toBe("AIRLESS");
    expect(sites).toHaveLength(9);
    expect(hws).toHaveLength(5);
  });

  it("serves real LOLA horizon, 96x96 terrain patch, and DE421 preset visibility for curated sites", async () => {
    const coord = { lat_deg: -89.68, lon_deg: -166.0, observer_height_m: 1.5, site_id: "shackleton-rim" };
    const horizon = await staticFetchHorizon({
      site: coord,
      azimuth_step_deg: 0.5,
      max_distance_km: 150.0,
      dem_product: null,
    });
    expect(horizon.horizon_source).not.toBe("spherical_analytical");
    expect(horizon.horizon_elevation_deg).toHaveLength(720);

    const patchDesktop = await staticFetchTerrainPatch({
      site: coord,
      half_extent_km: 10.0,
      resolution_profile: "desktop",
    });
    expect(patchDesktop.grid_size).toBe(96);
    expect(patchDesktop.elevations_m).toHaveLength(96);

    const patchMobile = await staticFetchTerrainPatch({
      site: coord,
      half_extent_km: 10.0,
      resolution_profile: "mobile",
    });
    expect(patchMobile.grid_size).toBe(32);

    const windowSpec = {
      start_utc: "2026-12-21T00:00:00Z",
      end_utc: "2027-01-04T00:00:00Z",
      step_minutes: 120,
    };

    const vis = await staticFetchVisibility({
      site: coord,
      window: windowSpec,
      dte_elevation_mask_deg: 0.0,
      ephemeris: "DE421",
    });
    expect(vis.computation.lunar_frame).toBe("MOON_ME_DE421");
    expect(vis.computation.refraction).toBe(false);
    expect(vis.samples).toHaveLength(169);

    const cmp = await staticCompareSites({
      sites: [coord],
      window: windowSpec,
      dte_elevation_mask_deg: 0.0,
      ephemeris: "DE421",
    });
    expect(cmp.metrics).toHaveLength(1);
    expect(cmp.metrics[0]!.sunlit_fraction).toBeGreaterThan(0.5);
    expect(cmp.metrics[0]!.advanced_dte.fspl_s_band_db).toBeGreaterThan(180);

    const solar = await staticFetchSolarEnergy({
      site: coord,
      window: windowSpec,
      fixed_azimuth_deg: 45,
      ephemeris: "DE421",
    });
    expect(solar.optimal_azimuth.azimuth_energy_curve_kwh_m2).toHaveLength(360);
    expect(solar.tracking_vertical_panel.total_energy_kwh_m2).toBeGreaterThan(0);
  });

  it("computes analytical visibility, spherical horizon, and terrain patch for arbitrary custom coordinates and dates", async () => {
    const customCoord = { lat_deg: -75.25, lon_deg: 18.4, observer_height_m: 2.0, site_id: null };
    const windowSpec = {
      start_utc: "2028-04-10T00:00:00Z",
      end_utc: "2028-04-24T00:00:00Z",
      step_minutes: 120,
    };

    const vis = await staticFetchVisibility({
      site: customCoord,
      window: windowSpec,
      dte_elevation_mask_deg: 0.0,
      ephemeris: "DE421",
    });
    expect(vis.computation.horizon_source).toBe("spherical_analytical");
    expect(vis.computation.refraction).toBe(false);
    expect(vis.samples.length).toBe(169);

    const patch = await staticFetchTerrainPatch({
      site: customCoord,
      half_extent_km: 10.0,
      resolution_profile: "desktop",
    });
    expect(patch.horizon_source).toBe("spherical_analytical");
    expect(patch.grid_size).toBe(96);
  });
});
