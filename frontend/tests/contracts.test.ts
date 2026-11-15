import { describe, expect, it } from "vitest";
import {
  angularDifference,
  azimuthToCardinal,
  computeShadowSectors,
  computeViabilityAssessments,
  coordinateKey,
  MISSION_PROFILES,
  polarToSvg,
} from "../src/components/ComparisonGrid";
import { formatDurationSeconds } from "../src/components/EventCountdown";
import { MISSION_TIME_PRESETS } from "../src/components/HeaderHUD";
import { buildExternalPortalLinks } from "../src/services/apiClient";
import { CONTRACT_VERSION } from "../src/types/contracts";

describe("Lunar Landing Site Navigator — Contracts & UI Utilities (v0.2.0)", () => {
  it("exposes CONTRACT_VERSION 0.2.0", () => {
    expect(CONTRACT_VERSION).toBe("0.2.0");
  });

  it("generates deep links to the official LROC QuickMap domain and NASA Moon Trek", () => {
    const polar = buildExternalPortalLinks(-89.68, -166.0);
    expect(polar.quickmap_url.startsWith("https://quickmap.lroc.im-ldi.com/")).toBe(true);
    expect(polar.quickmap_url.includes("proj=17")).toBe(true);
    expect(polar.moontrek_url.startsWith("https://trek.nasa.gov/moon/")).toBe(true);

    const eq = buildExternalPortalLinks(0.67409, 23.47298);
    expect(eq.quickmap_url.includes("proj=16")).toBe(true);
  });

  it("formats Sunset and Earthset countdowns properly", () => {
    expect(formatDurationSeconds(null, true, 14)).toBe("> window (14 d)");
    expect(formatDurationSeconds(90060, false, 14)).toBe("1d 01h 01m");
    expect(formatDurationSeconds(7200, false, 14)).toBe("02h 00m");
  });

  it("builds unique keys for curated sites and custom coordinates", () => {
    expect(
      coordinateKey({ lat_deg: -89.68, lon_deg: -166.0, observer_height_m: 1.5, site_id: "shackleton-rim" }),
    ).toBe("shackleton-rim");
    expect(
      coordinateKey({ lat_deg: -85.1234, lon_deg: 12.5, observer_height_m: 2.0, site_id: null }),
    ).toBe("custom_-85.1234_12.5000");
  });

  it("computes trigonometric projections for the Solar Compass (polarToSvg and angularDifference)", () => {
    // 0 deg North: top (x = cx, y = cy - r)
    const north = polarToSvg(0, 80, 110, 110);
    expect(north.x).toBe(110);
    expect(north.y).toBe(30);

    // 90 deg East: right (x = cx + r, y = cy)
    const east = polarToSvg(90, 80, 110, 110);
    expect(east.x).toBe(190);
    expect(east.y).toBe(110);

    // 180 deg South: bottom (x = cx, y = cy + r)
    const south = polarToSvg(180, 80, 110, 110);
    expect(south.x).toBe(110);
    expect(south.y).toBe(190);

    // 270 deg West: left (x = cx - r, y = cy)
    const west = polarToSvg(270, 80, 110, 110);
    expect(west.x).toBe(30);
    expect(west.y).toBe(110);

    // Cardinal directions
    expect(azimuthToCardinal(0)).toBe("N");
    expect(azimuthToCardinal(57)).toBe("ENE");
    expect(azimuthToCardinal(91)).toBe("E");
    expect(azimuthToCardinal(180)).toBe("S");
    expect(azimuthToCardinal(270)).toBe("W");

    // Angular difference
    expect(angularDifference(10, 350)).toBe(20);
    expect(angularDifference(90, 90)).toBe(0);
    expect(angularDifference(0, 180)).toBe(180);
  });

  it("computes angular topographic shadow sectors (computeShadowSectors)", () => {
    // Empty array when there are no samples
    expect(computeShadowSectors([], null)).toEqual([]);

    // Mock sample with Sun occluded at 180 deg
    const mockSample: any = {
      sun: {
        azimuth_deg: 180.0,
        elevation_deg: 0.5,
        horizon_elevation_deg: 2.0,
        clearance_deg: -1.5,
        state: "occulted",
        visible_fraction: 0.0,
      },
    };

    const sectors = computeShadowSectors([mockSample], null);
    expect(sectors.length).toBeGreaterThan(0);
    // Sector must include 180 deg
    const sector180 = sectors.find((s) => s.startDeg <= 180 && s.endDeg >= 180);
    expect(sector180).toBeDefined();
  });

  it("computes viability verdict and ranking by mission profile (computeViabilityAssessments)", () => {
    const sites = [
      { coord: { lat_deg: -89.68, lon_deg: -166.0, observer_height_m: 1.5, site_id: "shackleton-rim" }, key: "shackleton-rim" },
      { coord: { lat_deg: -86.0, lon_deg: 2.7, observer_height_m: 3.5, site_id: "malapert-massif" }, key: "malapert-massif" },
      { coord: { lat_deg: -45.44, lon_deg: 177.6, observer_height_m: 1.5, site_id: "change-4" }, key: "change-4" },
    ];

    const mockMetrics: any = {
      "shackleton-rim": {
        sunlit_fraction: 0.85,
        dte_fraction: 0.55,
        longest_darkness_hours: 12.0,
      },
      "malapert-massif": {
        sunlit_fraction: 0.70,
        dte_fraction: 0.95,
        longest_darkness_hours: 18.0,
      },
      "change-4": {
        sunlit_fraction: 0.50,
        dte_fraction: 0.0,
        longest_darkness_hours: 354.0,
      },
    };

    const mockSolar: any = {
      "shackleton-rim": {
        optimal_azimuth: { optimal_fixed_energy_kwh_m2: 240.0 },
      },
      "malapert-massif": {
        optimal_azimuth: { optimal_fixed_energy_kwh_m2: 190.0 },
      },
      "change-4": {
        optimal_azimuth: { optimal_fixed_energy_kwh_m2: 80.0 },
      },
    };

    // Verify profile configuration
    expect(MISSION_PROFILES.balanced.weights.solar).toBe(0.40);
    expect(MISSION_PROFILES.energy.weights.solar).toBe(0.60);
    expect(MISSION_PROFILES.comms.weights.dte).toBe(0.60);

    // 1. Balanced Profile (Artemis)
    const balancedAssessments = computeViabilityAssessments(sites, mockMetrics, mockSolar, "balanced");
    expect(balancedAssessments["shackleton-rim"]?.score).toBeGreaterThan(0);
    expect(balancedAssessments["malapert-massif"]?.score).toBeGreaterThan(0);
    expect(balancedAssessments["change-4"]?.score).toBeLessThan(balancedAssessments["shackleton-rim"]!.score);
    // One of them must be the winner
    const winnerCount = Object.values(balancedAssessments).filter((a) => a.isWinner).length;
    expect(winnerCount).toBe(1);

    // 2. Comms Priority Profile: Malapert (95% DTE) must beat Shackleton (55% DTE)
    const commsAssessments = computeViabilityAssessments(sites, mockMetrics, mockSolar, "comms");
    expect(commsAssessments["malapert-massif"]?.isWinner).toBe(true);
    expect(commsAssessments["malapert-massif"]?.rank).toBe(1);

    // 3. Energy Priority Profile: Shackleton (240 kWh/m2) must beat Malapert (190 kWh/m2)
    const energyAssessments = computeViabilityAssessments(sites, mockMetrics, mockSolar, "energy");
    expect(energyAssessments["shackleton-rim"]?.isWinner).toBe(true);
    expect(energyAssessments["shackleton-rim"]?.rank).toBe(1);
  });

  it("provides 4 mission timeline presets with valid, parseable UTC dates", () => {
    expect(MISSION_TIME_PRESETS.length).toBe(4);
    const ids = MISSION_TIME_PRESETS.map((p) => p.id);
    expect(ids).toContain("now");
    expect(ids).toContain("solstice-2026");
    expect(ids).toContain("winter-2027");
    expect(ids).toContain("artemis-2027");

    for (const preset of MISSION_TIME_PRESETS) {
      if (preset.id === "now") {
        expect(preset.iso).toBe("NOW");
      } else {
        expect(preset.iso.endsWith("Z")).toBe(true);
        const parsed = Date.parse(preset.iso);
        expect(Number.isNaN(parsed)).toBe(false);
        const year = new Date(parsed).getUTCFullYear();
        expect(year).toBeGreaterThanOrEqual(2026);
        expect(year).toBeLessThanOrEqual(2053);
      }
    }
  });
});
