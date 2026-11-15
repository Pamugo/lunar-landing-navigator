// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ComparisonGrid,
  computeNetElectricalOutput,
  coordinateKey,
  exportCsvReport,
  exportPrintReport,
  formatMeanPower,
  MISSION_PROFILES,
} from "../src/components/ComparisonGrid";
import { LanguageProvider } from "../src/i18n/LanguageContext";
import type { CuratedSite, LunarCoordinate, SiteSummaryMetrics, SolarEnergySummary } from "../src/types/contracts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SAMPLE_COORD: LunarCoordinate = {
  lat_deg: -89.66,
  lon_deg: -163.0,
  observer_height_m: 2.0,
  site_id: "shackleton-rim",
};

const SAMPLE_CURATED: CuratedSite = {
  id: "shackleton-rim",
  name: "Shackleton Crater Rim (Artemis III)",
  category: "artemis_candidate",
  lat_deg: -89.66,
  lon_deg: -163.0,
  elevation_m: 1200,
  default_hardware_id: "artemis-eva-mast",
  region: "south_polar",
  mission: "Artemis III",
  description_tech: "South Pole ridge",
  description_edu: "Sunny peak",
  source: "NASA LOLA",
  verification_status: "verified_literature",
  quickmap_url: "https://quickmap.lroc.im-ldi.com/",
  moontrek_url: "https://trek.nasa.gov/moon/",
};

const SAMPLE_METRICS: SiteSummaryMetrics = {
  site: SAMPLE_COORD,
  horizon_source: "lola_dem",
  sunlit_fraction: 0.85,
  dte_fraction: 0.72,
  sun_and_dte_fraction: 0.65,
  longest_sunlit_hours: 200,
  longest_darkness_hours: 48,
  mean_sun_elevation_deg: 1.2,
  next_sunset: {
    event: "sunset",
    time_utc: "2027-01-08T00:00:00Z",
    seconds_from_reference: 604800,
    beyond_window: false,
  },
  next_earthset: {
    event: "earthset",
    time_utc: null,
    seconds_from_reference: null,
    beyond_window: true,
  },
  advanced_dte: {
    terrain_clearance_deg: 1.4,
    min_clearance_deg: 0.5,
    max_clearance_deg: 4.2,
    earth_azimuth_span_deg: 6.8,
    earth_elevation_span_deg: 5.4,
    libration_span_deg: 8.6,
    earth_distance_km: 384400,
    one_way_light_time_s: 1.282,
    round_trip_time_s: 2.564,
    fspl_s_band_db: 211.0,
    fspl_x_band_db: 222.6,
    fspl_ka_band_db: 234.2,
    longest_comms_blackout_hours: 12,
    simultaneous_sun_earth_hours: 218.4,
  },
};

function makeSolarSummary(): SolarEnergySummary {
  const curve = Array.from({ length: 360 }, () => 120.0);
  curve[0] = 200.0;
  return {
    solar_constant_am0_w_m2: 1361,
    mean_solar_distance_au: 1.0,
    horizontal_panel: {
      architecture: "horizontal",
      azimuth_deg: null,
      total_energy_kwh_m2: 20.0,
      peak_flux_w_m2: 90,
      mean_flux_w_m2: 59.5,
    },
    tracking_vertical_panel: {
      architecture: "tracking_vertical",
      azimuth_deg: null,
      total_energy_kwh_m2: 300.0,
      peak_flux_w_m2: 1361,
      mean_flux_w_m2: 892.9,
    },
    fixed_vertical_panel: {
      architecture: "fixed_vertical",
      azimuth_deg: 0,
      total_energy_kwh_m2: 200.0,
      peak_flux_w_m2: 1361,
      mean_flux_w_m2: 595.2,
    },
    optimal_azimuth: {
      optimal_panel_azimuth_deg: 0,
      optimal_fixed_energy_kwh_m2: 200.0,
      azimuth_energy_curve_kwh_m2: curve,
    },
  };
}

describe("Photovoltaic Array Net Electrical Output Calculator", () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    const store = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      value: {
        get length() {
          return store.size;
        },
        clear: () => store.clear(),
        getItem: (k: string) => store.get(k) ?? null,
        key: (i: number) => Array.from(store.keys())[i] ?? null,
        removeItem: (k: string) => store.delete(k),
        setItem: (k: string, v: string) => store.set(k, v),
      },
      configurable: true,
      writable: true,
    });
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
      root = null;
    }
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("computes net kWh and mean W/kW accurately from irradiance, area, and efficiency", () => {
    const out1 = computeNetElectricalOutput(200.0, 10.0, 30, 14);
    expect(out1.energy_kwh).toBeCloseTo(600.0, 6);
    expect(out1.mean_power_w).toBeCloseTo(600000 / 336, 4);
    expect(formatMeanPower(out1.mean_power_w)).toBe("1.79 kW");

    const out2 = computeNetElectricalOutput(20.0, 10.0, 30, 14);
    expect(out2.energy_kwh).toBeCloseTo(60.0, 6);
    expect(formatMeanPower(out2.mean_power_w)).toBe("179 W");
  });

  it("remains strictly hidden in Educational Mode and updates live in Engineer Mode", async () => {
    const key = coordinateKey(SAMPLE_COORD);
    const solar = makeSolarSummary();

    const renderGrid = async (mode: "edu" | "eng") => {
      await act(async () => {
        if (!root) root = createRoot(container);
        root.render(
          <LanguageProvider>
            <ComparisonGrid
              curatedSites={[SAMPLE_CURATED]}
              selectedSites={[SAMPLE_COORD]}
              focusedIndex={0}
              onFocusIndex={() => {}}
              onToggleCuratedSite={() => {}}
              onRemoveSite={() => {}}
              onClearAllSites={() => {}}
              onAddCustomCoordinate={() => {}}
              metricsByKey={{ [key]: SAMPLE_METRICS }}
              solarEnergyByKey={{ [key]: solar }}
              seriesByKey={{}}
              horizonByKey={{}}
              currentSampleByKey={{}}
              windowDays={14}
              mode={mode}
            />
          </LanguageProvider>,
        );
      });
    };

    // Educational Mode: no PV array toggle or inputs rendered
    await renderGrid("edu");
    expect(container.querySelector("#pv-array-toggle-btn")).toBeNull();
    expect(container.querySelector("#pv-area-input")).toBeNull();
    expect(container.querySelector("#pv-efficiency-input")).toBeNull();
    expect(container.textContent).not.toContain("kWh electric");

    // Engineer Mode: default 10.0 m² and 30% -> 200*10*0.30 = 600.0 kWh, 300*10*0.30 = 900.0 kWh, 20*10*0.30 = 60.0 kWh
    await renderGrid("eng");
    expect(container.querySelector("#pv-array-toggle-btn")).not.toBeNull();
    expect(container.querySelector<HTMLInputElement>("#pv-area-input")?.value).toBe("10.0");
    expect(container.querySelector<HTMLInputElement>("#pv-efficiency-input")?.value).toBe("30");
    expect(container.textContent).toContain("600.0 kWh electric (1.79 kW mean)");
    expect(container.textContent).toContain("900.0 kWh electric");
    expect(container.textContent).toContain("60.0 kWh electric");

    // Click "40 m² Base" quick preset -> 200*40*0.30 = 2400.0 kWh
    const baseBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("40 m² Base"),
    );
    expect(baseBtn).toBeDefined();
    await act(async () => {
      baseBtn?.click();
    });
    expect(container.querySelector<HTMLInputElement>("#pv-area-input")?.value).toBe("40.0");
    expect(container.textContent).toContain("2400.0 kWh electric");

    // Change efficiency to 25% -> 200*40*0.25 = 2000.0 kWh
    const effInput = container.querySelector<HTMLInputElement>("#pv-efficiency-input")!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(effInput, "25");
      effInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.textContent).toContain("2000.0 kWh electric");
  });

  it("includes configured PV array parameters and net output in CSV and PDF print exports", () => {
    const key = coordinateKey(SAMPLE_COORD);
    const solar = makeSolarSummary();

    let capturedCsvText = "";
    const OriginalBlob = globalThis.Blob;
    vi.stubGlobal(
      "Blob",
      class MockBlob extends OriginalBlob {
        constructor(parts?: BlobPart[], options?: BlobPropertyBag) {
          super(parts, options);
          capturedCsvText = (parts ?? []).map(String).join("");
        }
      },
    );
    const origCreateObjectURL = URL.createObjectURL;
    const origRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn().mockReturnValue("blob:mock");
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    try {
      exportCsvReport(
        [SAMPLE_COORD],
        [SAMPLE_CURATED],
        { [key]: SAMPLE_METRICS },
        { [key]: solar },
        {},
        MISSION_PROFILES.balanced,
        14,
        "2026-12-21T00:00:00Z",
        "es",
        { area_m2: 20.0, efficiency_pct: 32.0 },
      );
    } finally {
      URL.createObjectURL = origCreateObjectURL;
      URL.revokeObjectURL = origRevokeObjectURL;
    }

    expect(capturedCsvText).toContain("Superficie Array Solar (m2)");
    expect(capturedCsvText).toContain("Eficiencia Célula (%)");
    // 200 * 20 * 0.32 = 1280.00 kWh; 1280*1000 / (14*24) = 3809.5 W
    expect(capturedCsvText).toContain("20.0,32.0,1280.00,3809.5");

    let printedHtml = "";
    const mockPopup = {
      document: {
        write: (html: string) => {
          printedHtml += html;
        },
        close: () => {},
      },
      focus: () => {},
      print: () => {},
    } as unknown as Window;
    vi.spyOn(window, "open").mockReturnValue(mockPopup);

    exportPrintReport(
      [SAMPLE_COORD],
      [SAMPLE_CURATED],
      { [key]: SAMPLE_METRICS },
      { [key]: solar },
      {},
      MISSION_PROFILES.balanced,
      14,
      "2026-12-21T00:00:00Z",
      "es",
      { area_m2: 20.0, efficiency_pct: 32.0 },
    );

    expect(printedHtml).toContain("20.0 m² · 32.0%");
    expect(printedHtml).toContain("1280.0 kWh");
    expect(printedHtml).toContain("3.81 kW");
  });

  it("allows clicking optimal/Earth/Sun azimuth icons directly and hides 0.0% misalignment when perfectly aligned", async () => {
    const key = coordinateKey(SAMPLE_COORD);
    const solar = makeSolarSummary();
    solar.optimal_azimuth.azimuth_energy_curve_kwh_m2[1] = 199.98;
    const sample = {
      time_utc: "2026-12-21T00:00:00Z",
      sun: {
        azimuth_deg: 15.8,
        elevation_deg: 1.5,
        distance_km: 149597870,
        angular_radius_deg: 0.266,
        horizon_elevation_deg: 1.0,
        clearance_deg: 0.5,
        state: "visible" as const,
        visible_fraction: 1,
      },
      earth: {
        azimuth_deg: 71.2,
        elevation_deg: 3.0,
        distance_km: 384400,
        angular_radius_deg: 0.95,
        horizon_elevation_deg: 1.0,
        clearance_deg: 2.0,
        state: "visible" as const,
        visible_fraction: 1,
      },
    };

    await act(async () => {
      root = createRoot(container);
      root.render(
        <LanguageProvider>
          <ComparisonGrid
            selectedSites={[SAMPLE_COORD]}
            curatedSites={[SAMPLE_CURATED]}
            focusedIndex={0}
            onFocusIndex={() => {}}
            onToggleCuratedSite={() => {}}
            onRemoveSite={() => {}}
            onClearAllSites={() => {}}
            onAddCustomCoordinate={() => {}}
            metricsByKey={{ [key]: SAMPLE_METRICS }}
            solarEnergyByKey={{ [key]: solar }}
            seriesByKey={{}}
            horizonByKey={{}}
            currentSampleByKey={{ [key]: sample }}
            windowDays={14}
            mode="eng"
          />
        </LanguageProvider>,
      );
    });

    // Initially aligned at optimal (0°): no misalignment warning, shows optimal badge
    expect(container.textContent).not.toContain("Misalignment");
    expect(container.textContent).toContain("★ Optimal");

    // Click Earth pill (71.2° -> 71°): moves panel azimuth directly to 71° and shows real misalignment
    const earthPill = Array.from(container.querySelectorAll("button.solar-compass-pill")).find((b) =>
      b.textContent?.includes("Earth:"),
    );
    expect(earthPill).toBeDefined();
    await act(async () => {
      earthPill?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const slider = container.querySelector<HTMLInputElement>("input.solar-azimuth-slider")!;
    expect(slider.value).toBe("71");
    expect(container.textContent).toContain("71° ENE");
    expect(container.textContent).toContain("Misalignment: -40.0%");

    // Move slider to 1° (199.98 vs 200.0 -> 0.0% / 0.0 kWh/m² rounded diff): no 0.0% misalignment banner
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(slider, "1");
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.textContent).not.toContain("Misalignment");
    expect(container.textContent).toContain("★ Optimal");

    // Click Sun SVG marker (15.8° -> 16°): orients panel to 16°
    const sunMarker = container.querySelector<SVGGElement>('.solar-compass-marker-btn[aria-label*="16°"]');
    expect(sunMarker).not.toBeNull();
    await act(async () => {
      sunMarker?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(slider.value).toBe("16");
    expect(container.textContent).toContain("Misalignment: -40.0%");

    // Click Optimal pill (0°): restores exact optimal alignment cleanly
    const optimalPill = Array.from(container.querySelectorAll("button.solar-compass-pill")).find((b) =>
      b.textContent?.includes("Optimal:"),
    );
    expect(optimalPill).toBeDefined();
    await act(async () => {
      optimalPill?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(slider.value).toBe("0");
    expect(container.textContent).not.toContain("Misalignment");
    expect(container.textContent).toContain("★ Optimal");
  });
});
