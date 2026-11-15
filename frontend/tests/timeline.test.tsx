// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  classifyOperationalState,
  computeOperationalBands,
  ElevationTimeline,
} from "../src/components/ElevationTimeline";
import { LanguageProvider } from "../src/i18n/LanguageContext";
import type { VisibilitySample, VisibilityTimeSeries } from "../src/types/contracts";

const mockSetOption = vi.fn();
const mockClear = vi.fn();
const mockDispose = vi.fn();
const mockResize = vi.fn();
const mockOn = vi.fn();

vi.mock("echarts", () => ({
  init: vi.fn(() => ({
    setOption: mockSetOption,
    clear: mockClear,
    dispose: mockDispose,
    resize: mockResize,
    on: mockOn,
  })),
  graphic: {
    LinearGradient: class {
      constructor() {}
    },
  },
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function makeSample(
  timeUtc: string,
  sunEl: number,
  sunHor: number,
  earthEl: number,
  earthHor: number,
): VisibilitySample {
  const sunClear = Number((sunEl - sunHor).toFixed(4));
  const earthClear = Number((earthEl - earthHor).toFixed(4));
  return {
    time_utc: timeUtc,
    sun: {
      azimuth_deg: 90,
      elevation_deg: sunEl,
      distance_km: 149597870,
      angular_radius_deg: 0.266,
      horizon_elevation_deg: sunHor,
      clearance_deg: sunClear,
      state: sunClear >= 0 ? "visible" : "occulted",
      visible_fraction: sunClear >= 0 ? 1 : 0,
    },
    earth: {
      azimuth_deg: 0,
      elevation_deg: earthEl,
      distance_km: 384400,
      angular_radius_deg: 0.95,
      horizon_elevation_deg: earthHor,
      clearance_deg: earthClear,
      state: earthClear >= 0 ? "visible" : "occulted",
      visible_fraction: earthClear >= 0 ? 1 : 0,
    },
  };
}

const SAMPLE_SERIES: VisibilityTimeSeries = {
  site: { lat_deg: -89.66, lon_deg: -163.0, observer_height_m: 2.0, site_id: "shackleton-rim" },
  window: { start_utc: "2027-01-01T00:00:00Z", end_utc: "2027-01-02T00:00:00Z", step_minutes: 360 },
  computation: {
    ephemeris: "DE421",
    lunar_frame: "MOON_ME",
    dem_product: "LOLA LDEM_80S_20M",
    horizon_source: "lola_dem",
    azimuth_step_deg: 1.0,
    max_distance_km: 300,
    refraction: false,
  },
  samples: [
    // idx 0-1: Golden Window (Sun > Horizon, Earth > Horizon)
    makeSample("2027-01-01T00:00:00Z", 2.5, 1.0, 4.0, 1.5),
    makeSample("2027-01-01T06:00:00Z", 2.0, 1.0, 3.0, 1.5),
    // idx 2-3: Solar Only / No DTE (Sun > Horizon, Earth < Horizon)
    makeSample("2027-01-01T12:00:00Z", 1.8, 0.5, 0.8, 1.5),
    makeSample("2027-01-01T18:00:00Z", 1.2, 0.5, 0.2, 1.5),
    // idx 4-5: Eclipse / Batteries (Sun < Horizon)
    makeSample("2027-01-02T00:00:00Z", -0.5, 0.5, 2.5, 1.5),
    makeSample("2027-01-02T06:00:00Z", -1.0, 0.5, 2.2, 1.5),
  ],
  events: [],
};

describe("Engineer Mode Operational Timeline Planner", () => {
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
    mockSetOption.mockClear();
    mockClear.mockClear();
    mockDispose.mockClear();
    mockResize.mockClear();
    mockOn.mockClear();
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
      root = null;
    }
    container.remove();
  });

  it("classifies operational states and contiguous timeline bands accurately", () => {
    expect(classifyOperationalState(1.5, 2.5)).toBe("golden");
    expect(classifyOperationalState(1.3, -0.7)).toBe("solar_only");
    expect(classifyOperationalState(-1.0, 1.0)).toBe("eclipse");

    const bands = computeOperationalBands(SAMPLE_SERIES.samples);
    expect(bands).toEqual([
      { state: "golden", startIdx: 0, endIdx: 1 },
      { state: "solar_only", startIdx: 2, endIdx: 3 },
      { state: "eclipse", startIdx: 4, endIdx: 5 },
    ]);
  });

  it("renders operational planner header, interactive trace legend, and live telemetry bar strictly in Engineer Mode", async () => {
    const renderTimeline = async (mode: "edu" | "eng", sampleIndex = 0) => {
      await act(async () => {
        if (!root) root = createRoot(container);
        root.render(
          <LanguageProvider>
            <ElevationTimeline
              series={SAMPLE_SERIES}
              focusedSiteName="Shackleton"
              sampleIndex={sampleIndex}
              onSampleIndexChange={() => {}}
              isPlaying={false}
              onTogglePlay={() => {}}
              startDateIso="2027-01-01T00:00:00Z"
              mode={mode}
            />
          </LanguageProvider>,
        );
      });
    };

    // Educational Mode stays clean and simple
    await renderTimeline("edu", 0);
    expect(container.querySelector(".timeline-eng-subtitle")).toBeNull();
    expect(container.querySelector(".timeline-eng-legend-bar")).toBeNull();
    expect(container.querySelector("#timeline-telemetry-bar")).toBeNull();

    // Engineer Mode at idx 0 -> Golden Window (no duplicate start/duration inputs inside timeline)
    await renderTimeline("eng", 0);
    expect(container.querySelector("#start-date-input")).toBeNull();
    expect(container.querySelector("#window-days-select")).toBeNull();
    expect(container.querySelector(".timeline-scrubber-time")?.textContent).toBe("2027-01-01T00:00:00Z");
    expect(container.querySelector(".timeline-eng-subtitle")?.textContent).toContain("Operational Window Planner");
    expect(container.querySelector("#legend-toggle-sun")).not.toBeNull();
    expect(container.querySelector("#legend-toggle-earth")).not.toBeNull();
    expect(container.querySelector("#legend-toggle-horizon")).not.toBeNull();

    const telemetry0 = container.querySelector("#timeline-telemetry-bar")!;
    expect(telemetry0.textContent).toContain("2027-01-01T00:00:00Z");
    expect(telemetry0.textContent).toContain("+1.50°");
    expect(telemetry0.textContent).toContain("+2.50°");
    expect(telemetry0.textContent).toContain("🟢 GOLDEN WINDOW");

    // Engineer Mode at idx 2 -> Solar Only
    await renderTimeline("eng", 2);
    expect(container.querySelector("#timeline-telemetry-bar")?.textContent).toContain("🟡 SOLAR ONLY");

    // Engineer Mode at idx 4 -> Eclipse / Batteries
    await renderTimeline("eng", 4);
    expect(container.querySelector("#timeline-telemetry-bar")?.textContent).toContain("🔴 ECLIPSE / BATTERIES");

    // Interactive legend toggles aria-pressed cleanly and removes series in ECharts
    const sunChip = container.querySelector<HTMLButtonElement>("#legend-toggle-sun")!;
    expect(sunChip.getAttribute("aria-pressed")).toBe("true");
    await act(async () => {
      sunChip.click();
    });
    expect(sunChip.getAttribute("aria-pressed")).toBe("false");

    // Verify ECharts received markArea operational bands and updated series list after toggle
    const lastOption = mockSetOption.mock.calls[mockSetOption.mock.calls.length - 1]?.[0] as {
      series?: Array<{ name?: string; markArea?: { data?: unknown[] } }>;
    };
    const opsBandSeries = lastOption.series?.find((s) => s.name === "__ops_bands__");
    expect(opsBandSeries?.markArea?.data?.length).toBe(3); // golden (0..2), solar_only (2..4), eclipse (4..5)
    expect(lastOption.series?.some((s) => s.name?.includes("Sun"))).toBe(false);
    expect(lastOption.series?.some((s) => s.name?.includes("Earth"))).toBe(true);
    expect(lastOption.series?.some((s) => s.name?.includes("Horizon"))).toBe(true);
  });

  it("allows selecting which active site to plot directly inside the timeline", async () => {
    const onSelectSiteIndex = vi.fn();
    const sites = [
      { lat_deg: -89.66, lon_deg: -163.0, observer_height_m: 2.0, site_id: "shackleton-rim" },
      { lat_deg: -84.0, lon_deg: 25.0, observer_height_m: 2.0, site_id: null },
    ];

    await act(async () => {
      root = createRoot(container);
      root.render(
        <LanguageProvider>
          <ElevationTimeline
            series={SAMPLE_SERIES}
            focusedSiteName="Shackleton"
            selectedSites={sites}
            curatedSites={[]}
            focusedIndex={0}
            onSelectSiteIndex={onSelectSiteIndex}
            sampleIndex={0}
            onSampleIndexChange={() => {}}
            isPlaying={false}
            onTogglePlay={() => {}}
            startDateIso="2027-01-01T00:00:00Z"
            mode="eng"
          />
        </LanguageProvider>,
      );
    });

    const siteButtons = Array.from(container.querySelectorAll<HTMLButtonElement>(".timeline-site-pill"));
    expect(siteButtons.length).toBe(2);
    expect(siteButtons[0]?.getAttribute("aria-pressed")).toBe("true");
    expect(siteButtons[1]?.textContent).toContain("-84.00°, 25.00°");

    await act(async () => {
      siteButtons[1]?.click();
    });
    expect(onSelectSiteIndex).toHaveBeenCalledWith(1);
  });
});
