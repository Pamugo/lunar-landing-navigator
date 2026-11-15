// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import { ComparisonGrid } from "../src/components/ComparisonGrid";
import { HeaderHUD } from "../src/components/HeaderHUD";
import { LunarGlobe3D } from "../src/components/LunarGlobe3D";
import { LanguageProvider } from "../src/i18n/LanguageContext";
import {
  HARDWARE_TRANSLATIONS,
  LANGUAGE_STORAGE_KEY,
  SITE_TRANSLATIONS,
  TRANSLATIONS,
  TRANSLATIONS_EN,
  TRANSLATIONS_ES,
} from "../src/i18n/translations";
import type {
  CuratedSite,
  HardwareProfile,
  LunarCoordinate,
  ScientificVerificationSeal,
  SiteSummaryMetrics,
} from "../src/types/contracts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function collectLeafPaths(obj: unknown, prefix = ""): string[] {
  if (typeof obj === "string") {
    return [prefix];
  }
  if (Array.isArray(obj)) {
    return obj.flatMap((item, idx) => collectLeafPaths(item, `${prefix}[${idx}]`));
  }
  if (obj && typeof obj === "object") {
    return Object.keys(obj)
      .sort()
      .flatMap((key) =>
        collectLeafPaths(
          (obj as Record<string, unknown>)[key],
          prefix ? `${prefix}.${key}` : key,
        ),
      );
  }
  return [];
}

function collectStringValues(obj: unknown): string[] {
  if (typeof obj === "string") return [obj];
  if (Array.isArray(obj)) return obj.flatMap(collectStringValues);
  if (obj && typeof obj === "object") {
    return Object.values(obj as Record<string, unknown>).flatMap(collectStringValues);
  }
  return [];
}

const SAMPLE_HARDWARE: HardwareProfile[] = [
  {
    id: "csa-leap-payload",
    name: "CSA LEAP (0.5 m)",
    agency: "CSA",
    observer_height_m: 0.5,
    description_tech: "Tech",
    description_edu: "Edu",
  },
  {
    id: "csa-utility-rover",
    name: "CSA Utility Rover (1.5 m)",
    agency: "CSA",
    observer_height_m: 1.5,
    description_tech: "Tech",
    description_edu: "Edu",
  },
  {
    id: "artemis-eva-mast",
    name: "Artemis EVA (2.0 m)",
    agency: "NASA",
    observer_height_m: 2.0,
    description_tech: "Tech",
    description_edu: "Edu",
  },
];

const SAMPLE_SEAL: ScientificVerificationSeal = {
  validation_id: "VAL-20261114-02",
  reference_oracle: "NASA/JPL Horizons System API (coord@301, APPARENT=AIRLESS)",
  ephemeris_kernel: "de421.bsp",
  lunar_frame: "MOON_ME_DE421",
  refraction: "AIRLESS",
  max_az_error_deg: 0.000009,
  max_el_error_deg: 0.000009,
  rms_az_error_deg: 0.000006,
  rms_el_error_deg: 0.000006,
  verified_sites_count: 5,
  verified_samples_count: 90,
  verified_at_utc: "2026-11-14T09:57:21Z",
};

describe("Bilingual i18n dictionary and metadata parity", () => {
  it("keeps identical nested key structures and non-empty strings across ES and EN", () => {
    const enPaths = collectLeafPaths(TRANSLATIONS_EN);
    const esPaths = collectLeafPaths(TRANSLATIONS_ES);
    expect(esPaths).toEqual(enPaths);

    for (const val of collectStringValues(TRANSLATIONS)) {
      expect(val.trim().length).toBeGreaterThan(0);
    }
  });

  it("provides both ES and EN copy for all 9 curated sites and all 5 hardware profiles", () => {
    const expectedSiteIds = [
      "shackleton-rim",
      "malapert-massif",
      "cabeus-crater",
      "mons-mouton-leibnitz-beta",
      "nobile-rim-1",
      "apollo-11",
      "apollo-17",
      "chandrayaan-3",
      "change-4",
    ];
    for (const id of expectedSiteIds) {
      expect(SITE_TRANSLATIONS.en[id]?.name.trim().length).toBeGreaterThan(0);
      expect(SITE_TRANSLATIONS.en[id]?.description_edu.trim().length).toBeGreaterThan(0);
      expect(SITE_TRANSLATIONS.en[id]?.description_tech.trim().length).toBeGreaterThan(0);
      expect(SITE_TRANSLATIONS.es[id]?.name.trim().length).toBeGreaterThan(0);
      expect(SITE_TRANSLATIONS.es[id]?.description_edu.trim().length).toBeGreaterThan(0);
      expect(SITE_TRANSLATIONS.es[id]?.description_tech.trim().length).toBeGreaterThan(0);
    }

    const expectedHwIds = [
      "csa-leap-payload",
      "csa-utility-rover",
      "artemis-eva-mast",
      "artemis-ltv",
      "clps-lander-mast",
    ];
    for (const id of expectedHwIds) {
      expect(HARDWARE_TRANSLATIONS.en[id]?.name.trim().length).toBeGreaterThan(0);
      expect(HARDWARE_TRANSLATIONS.es[id]?.name.trim().length).toBeGreaterThan(0);
    }
  });

  it("never introduces refraction terminology into any UI translation string", () => {
    const raw = JSON.stringify(TRANSLATIONS);
    expect(raw.toLowerCase()).not.toContain("refract");
  });
});

describe("Bilingual UI switcher and Educational/Engineer mode isolation", () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    const store = new Map<string, string>();
    const memoryStorage: Storage = {
      get length() {
        return store.size;
      },
      clear() {
        store.clear();
      },
      getItem(k: string) {
        return store.get(k) ?? null;
      },
      key(index: number) {
        return Array.from(store.keys())[index] ?? null;
      },
      removeItem(k: string) {
        store.delete(k);
      },
      setItem(k: string, v: string) {
        store.set(k, v);
      },
    };
    Object.defineProperty(window, "localStorage", {
      value: memoryStorage,
      configurable: true,
      writable: true,
    });
    document.documentElement.lang = "en";
    container = document.createElement("div");
    document.body.appendChild(container);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Offline test stub")),
    );
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
      root = null;
    }
    container?.remove();
    vi.unstubAllGlobals();
  });

  it("hot-swaps HeaderHUD between EN and ES while persisting preference and preserving state", async () => {
    await act(async () => {
      root = createRoot(container);
      root.render(
        <LanguageProvider>
          <HeaderHUD
            mode="eng"
            onModeChange={() => {}}
            hardwareProfiles={SAMPLE_HARDWARE}
            selectedHardwareId="artemis-eva-mast"
            onHardwareChange={() => {}}
            scientificSeal={SAMPLE_SEAL}
            startDateIso="2027-06-15T12:00:00Z"
            onStartDateChange={() => {}}
            windowDays={28}
            onWindowDaysChange={() => {}}
          />
        </LanguageProvider>,
      );
    });

    expect(document.documentElement.lang).toBe("en");
    const logoImg = container.querySelector<HTMLImageElement>("img.nasa-insignia-logo");
    expect(logoImg).not.toBeNull();
    expect(logoImg?.getAttribute("src")).toBe("/space-apps-malaga-logo.png");
    expect(container.textContent).toContain("Engineer Mode");
    expect(container.textContent).toContain("JPL Horizons Verified");

    const dateInputBefore = container.querySelector<HTMLInputElement>("#mission-start-datetime");
    const windowSelectBefore = container.querySelector<HTMLSelectElement>("#header-window-days");
    expect(dateInputBefore?.value).toBe("2027-06-15T12:00");
    expect(windowSelectBefore?.value).toBe("28");

    const buttons = Array.from(container.querySelectorAll("button"));
    const esBtn = buttons.find((b) => b.textContent?.trim() === "ES");
    const enBtn = buttons.find((b) => b.textContent?.trim() === "EN");
    expect(esBtn).toBeDefined();
    expect(enBtn).toBeDefined();

    await act(async () => {
      esBtn?.click();
    });

    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("es");
    expect(document.documentElement.lang).toBe("es");
    expect(container.textContent).toContain("Modo Ingeniero");
    expect(container.textContent).toContain("Verificado JPL Horizons");

    // Selected epoch and window duration must remain untouched after switching language
    expect(container.querySelector<HTMLInputElement>("#mission-start-datetime")?.value).toBe(
      "2027-06-15T12:00",
    );
    expect(container.querySelector<HTMLSelectElement>("#header-window-days")?.value).toBe("28");

    await act(async () => {
      enBtn?.click();
    });

    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("en");
    expect(document.documentElement.lang).toBe("en");
    expect(container.textContent).toContain("Engineer Mode");
    const themeBtn = container.querySelector<HTMLButtonElement>("#theme-toggle-btn");
    expect(themeBtn).not.toBeNull();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(themeBtn?.querySelector('[data-theme-icon="moon"]')).not.toBeNull();
    expect(themeBtn?.textContent).toContain("Dark Mode");

    await act(async () => {
      themeBtn?.click();
    });

    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(window.localStorage.getItem("lunar_navigator_theme")).toBe("light");
    expect(themeBtn?.querySelector('[data-theme-icon="sun"]')).not.toBeNull();
    expect(themeBtn?.textContent).toContain("Light Mode");
    expect(logoImg?.getAttribute("src")).toBe("/space-apps-malaga-logo-light.png");

    await act(async () => {
      esBtn?.click();
    });

    expect(themeBtn?.textContent).toContain("Modo Claro");
    expect(container.querySelectorAll(".preset-btn").length).toBeGreaterThan(0);
  });

  it("keeps Engineer-only elements strictly hidden in Educational Mode in both EN and ES, and translates them in Engineer Mode", async () => {
    await act(async () => {
      root = createRoot(container);
      root.render(
        <LanguageProvider>
          <App />
        </LanguageProvider>,
      );
    });

    // Educational Mode (EN default) + empty startup state & zoomed-out Global View
    expect(container.textContent).toContain("Educational Mode");
    expect(container.textContent).toContain("3D lunar visual explorer and horizon");
    expect(container.textContent).toContain("Lunar surface point comparator (up to 9 simultaneous scenarios)");
    expect(container.textContent).toContain("2. Comparator (0)");
    expect(container.textContent).toContain("No site is currently open in the comparator.");
    expect(container.textContent).toContain("No lunar site selected");
    expect(container.textContent).not.toContain("FOV 42°");
    expect(container.querySelector("#mission-start-datetime")).toBeNull();
    expect(container.querySelector("#header-window-days")).toBeNull();
    expect(container.querySelector("#hardware-profile-select")).toBeNull();
    expect(container.querySelector(".timeline-dock")).toBeNull();
    expect(container.textContent).not.toContain("JPL Horizons Verified");
    expect(container.textContent).not.toContain("Sun Vector");

    const getBtn = (labelSubstring: string) =>
      Array.from(container.querySelectorAll("button")).find((b) =>
        b.textContent?.trim().includes(labelSubstring),
      );

    expect(getBtn("Global View")?.classList.contains("active")).toBe(true);
    expect(getBtn("Focus Site")?.disabled).toBe(true);
    expect(getBtn("South Pole")).toBeUndefined();

    // Switch to Spanish while staying in Educational Mode
    await act(async () => {
      getBtn("ES")?.click();
    });

    expect(container.textContent).toContain("Modo Educativo");
    expect(container.textContent).toContain("Explorador visual lunar 3D y horizonte");
    expect(container.textContent).toContain("Comparador de puntos de la superficie lunar (hasta 9 escenarios simultáneos)");
    expect(container.textContent).toContain("2. Comparador (0)");
    expect(container.textContent).toContain("Ningún sitio lunar seleccionado");
    expect(container.textContent).not.toContain("FOV 42°");
    expect(getBtn("Vista Global")?.classList.contains("active")).toBe(true);
    expect(getBtn("Enfocar Sitio")?.disabled).toBe(true);
    expect(getBtn("Polo Sur")).toBeUndefined();
    // Engineer-only elements MUST remain completely absent in Spanish Educational Mode
    expect(container.querySelector("#mission-start-datetime")).toBeNull();
    expect(container.querySelector("#header-window-days")).toBeNull();
    expect(container.querySelector("#hardware-profile-select")).toBeNull();
    expect(container.querySelector(".timeline-dock")).toBeNull();
    expect(container.textContent).not.toContain("Verificado JPL Horizons");
    expect(container.textContent).not.toContain("Vector Sol");

    // Switch to Engineer Mode while staying in Spanish
    await act(async () => {
      getBtn("Modo Ingeniero")?.click();
    });

    expect(container.textContent).toContain("Consola de Planificación Polar Sur");
    expect(container.textContent).toContain("Explorador visual lunar 3D y horizonte");
    expect(container.textContent).toContain("Comparador de puntos de la superficie lunar (hasta 9 escenarios simultáneos)");
    expect(container.textContent).toContain("Verificado JPL Horizons");
    expect(container.textContent).not.toContain("Sin sitio seleccionado");
    expect(container.textContent).not.toContain("FOV 42°");
    expect(container.textContent).not.toMatch(/~4\.?257 km/);
    expect(getBtn("Polo Sur")).toBeDefined();
    expect(container.querySelector("#mission-start-datetime")).not.toBeNull();
    expect(container.querySelector("#header-window-days")).not.toBeNull();
    expect(container.querySelector(".timeline-dock")).not.toBeNull();
    expect(container.textContent).toContain("Cronograma Sincronizado");
    expect(container.textContent).toContain("Vector Sol");

    // Switch back to English while staying in Engineer Mode
    await act(async () => {
      getBtn("EN")?.click();
    });

    expect(container.textContent).toContain("South Polar Mission Planning Console");
    expect(container.textContent).toContain("3D lunar visual explorer and horizon");
    expect(container.textContent).toContain("Lunar surface point comparator (up to 9 simultaneous scenarios)");
    expect(container.textContent).toContain("JPL Horizons Verified");
    expect(container.textContent).not.toContain("No site selected");
    expect(container.textContent).not.toContain("FOV 42°");
    expect(container.textContent).not.toContain("~4,257 km");
    expect(getBtn("South Pole")).toBeDefined();
    expect(container.querySelector(".timeline-dock")).not.toBeNull();
    expect(container.textContent).toContain("Synchronized Elevation & Horizon Clearance Timeline");
    expect(container.textContent).toContain("Sun Vector");
  });

  it("renders comparator pills without checkmarks and separates +/- icons cleanly", async () => {
    const sites: CuratedSite[] = [
      {
        id: "shackleton-rim",
        name: "Shackleton Crater Rim (Artemis III)",
        category: "artemis_candidate",
        lat_deg: -89.66,
        lon_deg: -163.0,
        elevation_m: 1200,
        default_hardware_id: "artemis-eva-mast",
        region: "south_polar",
        mission: "Artemis III",
        description_tech: "Tech",
        description_edu: "Edu",
        source: "NASA LOLA",
        verification_status: "verified_literature",
        quickmap_url: "https://quickmap.lroc.im-ldi.com/",
        moontrek_url: "https://trek.nasa.gov/moon/",
      },
      {
        id: "apollo-17",
        name: "Apollo 17",
        category: "apollo",
        lat_deg: 20.19,
        lon_deg: 30.77,
        elevation_m: -2400,
        default_hardware_id: "artemis-eva-mast",
        region: "equatorial",
        mission: "Apollo 17",
        description_tech: "Tech",
        description_edu: "Edu",
        source: "NASA LRO",
        verification_status: "verified_literature",
        quickmap_url: "https://quickmap.lroc.im-ldi.com/",
        moontrek_url: "https://trek.nasa.gov/moon/",
      },
    ];
    const selected: LunarCoordinate[] = [
      { lat_deg: -89.66, lon_deg: -163.0, observer_height_m: 2.0, site_id: "shackleton-rim" },
    ];

    await act(async () => {
      root = createRoot(container);
      root.render(
        <LanguageProvider>
          <ComparisonGrid
            curatedSites={sites}
            selectedSites={selected}
            focusedIndex={0}
            onFocusIndex={() => {}}
            onToggleCuratedSite={() => {}}
            onRemoveSite={() => {}}
            onClearAllSites={() => {}}
            onAddCustomCoordinate={() => {}}
            metricsByKey={{}}
            solarEnergyByKey={{}}
            seriesByKey={{}}
            horizonByKey={{}}
            currentSampleByKey={{}}
            windowDays={14}
            mode="eng"
          />
        </LanguageProvider>,
      );
    });

    const closeAllBtn = container.querySelector("button.close-all-btn");
    expect(closeAllBtn).not.toBeNull();
    expect(closeAllBtn?.textContent).toContain("✕");
    expect(closeAllBtn?.textContent).toContain("Close all (1)");

    const chips = Array.from(container.querySelectorAll("button.site-chip"));
    const selectedChip = chips.find((b) => b.classList.contains("selected"));
    const unselectedChip = chips.find((b) => !b.classList.contains("selected"));
    expect(selectedChip).toBeDefined();
    expect(unselectedChip).toBeDefined();
    expect(selectedChip?.textContent).not.toContain("✓");
    expect(selectedChip?.textContent).toContain("✕");
    expect(unselectedChip?.textContent).toContain("+");
  });

  it("does not render overlay site buttons above LunarGlobe3D when comparator sites are active", async () => {
    const sites: CuratedSite[] = [
      {
        id: "shackleton-rim",
        name: "Shackleton Crater Rim (Artemis III)",
        category: "artemis_candidate",
        lat_deg: -89.66,
        lon_deg: -163.0,
        elevation_m: 1200,
        default_hardware_id: "artemis-eva-mast",
        region: "south_polar",
        mission: "Artemis III",
        description_tech: "Tech",
        description_edu: "Edu",
        source: "NASA LOLA",
        verification_status: "verified_literature",
        quickmap_url: "https://quickmap.lroc.im-ldi.com/",
        moontrek_url: "https://trek.nasa.gov/moon/",
      },
    ];
    const selected: LunarCoordinate[] = [
      { lat_deg: -89.66, lon_deg: -163.0, observer_height_m: 2.0, site_id: "shackleton-rim" },
      { lat_deg: 12.34, lon_deg: -45.67, observer_height_m: 2.0, site_id: null },
    ];

    await act(async () => {
      root = createRoot(container);
      root.render(
        <LanguageProvider>
          <LunarGlobe3D
            sites={sites}
            selectedSiteIds={["shackleton-rim"]}
            selectedSites={selected}
            focusedSite={selected[0]!}
            focusedIndex={0}
            currentSample={null}
            mode="eng"
            onSelectCuratedSite={() => {}}
            onSelectCustomCoordinate={() => {}}
          />
        </LanguageProvider>,
      );
    });

    expect(container.querySelector(".globe-active-sites-strip")).toBeNull();
    expect(container.querySelectorAll("button.globe-active-site-chip")).toHaveLength(0);
  });

  it("shows window pill only in comparator header during edu mode, omits duration tags over KPI bars, and renders sentence-case site titles", async () => {
    const sites: CuratedSite[] = [
      {
        id: "shackleton-rim",
        name: "Shackleton Crater Rim (Artemis III)",
        category: "artemis_candidate",
        lat_deg: -89.66,
        lon_deg: -163.0,
        elevation_m: 1200,
        default_hardware_id: "artemis-eva-mast",
        region: "south_polar",
        mission: "Artemis III",
        description_tech: "Tech",
        description_edu: "Edu",
        source: "NASA LOLA",
        verification_status: "verified_literature",
        quickmap_url: "https://quickmap.lroc.im-ldi.com/",
        moontrek_url: "https://trek.nasa.gov/moon/",
      },
    ];
    const selected: LunarCoordinate[] = [
      { lat_deg: -89.66, lon_deg: -163.0, observer_height_m: 2.0, site_id: "shackleton-rim" },
      { lat_deg: 12.34, lon_deg: -45.67, observer_height_m: 2.0, site_id: null },
    ];
    const sampleMetrics: Record<string, SiteSummaryMetrics> = {
      "shackleton-rim": {
        site: selected[0]!,
        horizon_source: "lola_dem",
        sunlit_fraction: 0.85,
        dte_fraction: 0.72,
        sun_and_dte_fraction: 0.65,
        longest_sunlit_hours: 200,
        longest_darkness_hours: 48,
        mean_sun_elevation_deg: 1.2,
        next_sunset: { event: "sunset", time_utc: null, seconds_from_reference: null, beyond_window: true },
        next_earthset: { event: "earthset", time_utc: null, seconds_from_reference: null, beyond_window: true },
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
      },
    };

    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, "es");
    await act(async () => {
      root = createRoot(container);
      root.render(
        <LanguageProvider>
          <ComparisonGrid
            curatedSites={sites}
            selectedSites={selected}
            focusedIndex={0}
            onFocusIndex={() => {}}
            onToggleCuratedSite={() => {}}
            onRemoveSite={() => {}}
            onClearAllSites={() => {}}
            onAddCustomCoordinate={() => {}}
            metricsByKey={sampleMetrics}
            solarEnergyByKey={{}}
            seriesByKey={{}}
            horizonByKey={{}}
            currentSampleByKey={{}}
            windowDays={14}
            mode="edu"
          />
        </LanguageProvider>,
      );
    });

    const eduPill = container.querySelector(".comparator-window-pill");
    expect(eduPill).not.toBeNull();
    expect(eduPill?.textContent).toContain("14 días");
    const kpiTextEdu = container.querySelector(".kpi-bars")?.textContent ?? "";
    expect(kpiTextEdu).not.toContain("(14 días)");
    const titlesEs = Array.from(container.querySelectorAll(".site-card-title")).map((el) => el.textContent ?? "");
    expect(titlesEs[0]).toBe("Borde de shackleton (pico cercano a shackleton)");
    expect(titlesEs[1]).toBe("Sitio personalizado (12.34°, -45.67°)");
    const categoryTagsEs = Array.from(container.querySelectorAll(".category-tag")).map((el) => el.textContent ?? "");
    expect(categoryTagsEs[0]).toBe("Candidato artemis");
    expect(categoryTagsEs[1]).toBe("Personalizado");

    await act(async () => {
      root?.render(
        <LanguageProvider>
          <ComparisonGrid
            curatedSites={sites}
            selectedSites={selected}
            focusedIndex={0}
            onFocusIndex={() => {}}
            onToggleCuratedSite={() => {}}
            onRemoveSite={() => {}}
            onClearAllSites={() => {}}
            onAddCustomCoordinate={() => {}}
            metricsByKey={sampleMetrics}
            solarEnergyByKey={{}}
            seriesByKey={{}}
            horizonByKey={{}}
            currentSampleByKey={{}}
            windowDays={14}
            mode="eng"
          />
        </LanguageProvider>,
      );
    });

    expect(container.querySelector(".comparator-window-pill")).toBeNull();
    const kpiTextEng = container.querySelector(".kpi-bars")?.textContent ?? "";
    expect(kpiTextEng).not.toContain("(14 días)");
  });
});
