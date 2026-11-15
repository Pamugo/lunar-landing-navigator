import { type CSSProperties, type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { ComparisonGrid, coordinateKey } from "./components/ComparisonGrid";
import { ElevationTimeline } from "./components/ElevationTimeline";
import { type AppMode, HeaderHUD } from "./components/HeaderHUD";
import { HorizonDome } from "./components/HorizonDome";
import { LunarGlobe3D } from "./components/LunarGlobe3D";
import { Terrain3D } from "./components/Terrain3D";
import { useLanguage } from "./i18n/LanguageContext";
import { getLocalizedHardwareCopy, getLocalizedSiteCopy } from "./i18n/translations";
import { apiClient, buildExternalPortalLinks } from "./services/apiClient";
import type {
  CuratedSite,
  EphemerisKernel,
  HardwareProfile,
  HorizonProfile,
  LunarCoordinate,
  ResolutionProfile,
  ScientificVerificationSeal,
  SiteSummaryMetrics,
  SolarEnergySummary,
  TerrainPatch,
  TimeWindow,
  VisibilitySample,
  VisibilityTimeSeries,
} from "./types/contracts";

type VisualSubview = "globe3d" | "dome360" | "terrain3d";
type MobileTab = "visual" | "compare" | "timeline";

const FALLBACK_SEAL: ScientificVerificationSeal = {
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

const FALLBACK_HARDWARE: HardwareProfile[] = [
  {
    id: "csa-leap-payload",
    name: "CSA LEAP Micro-Rover / Surface Payload (0.5 m)",
    agency: "CSA (Canadian Space Agency)",
    observer_height_m: 0.5,
    description_tech: "Microrover and surface instruments from the CSA LEAP program.",
    description_edu: "A low-profile Canadian mini-rover (0.5 m).",
  },
  {
    id: "csa-utility-rover",
    name: "CSA Canadian Utility Rover Mast (1.5 m)",
    agency: "CSA (Canadian Space Agency)",
    observer_height_m: 1.5,
    description_tech: "Navigation mast and DTE antenna on the CSA Canadian Utility Rover.",
    description_edu: "Canada's utility rover (1.5 m) designed to assist astronauts.",
  },
  {
    id: "artemis-eva-mast",
    name: "Artemis Astronaut EVA / Standard Tripod (2.0 m)",
    agency: "NASA / Artemis",
    observer_height_m: 2.0,
    description_tech: "Standard height (2.0 m) for astronaut visor or deployable tripod.",
    description_edu: "Eye level of an astronaut or portable antenna (2.0 m).",
  },
  {
    id: "artemis-ltv",
    name: "Artemis Lunar Terrain Vehicle / Rover High-Gain (2.2 m)",
    agency: "NASA / Commercial LTV",
    observer_height_m: 2.2,
    description_tech: "High-gain X/Ka-band antenna mounted on the Lunar Terrain Vehicle.",
    description_edu: "The astronauts' lunar rover with a 2.2 m antenna mast.",
  },
  {
    id: "clps-lander-mast",
    name: "NASA CLPS Lander Top Deck / Solar Array (3.5 m)",
    agency: "NASA CLPS / Commercial",
    observer_height_m: 3.5,
    description_tech: "Upper deck of commercial CLPS lander (e.g. Nova-C Athena, 3.5 m).",
    description_edu: "The top deck of a commercial lunar lander (3.5 m).",
  },
];

const FALLBACK_SITES: CuratedSite[] = [
  {
    id: "shackleton-rim",
    name: "Shackleton Rim (Peak near Shackleton)",
    category: "artemis_candidate",
    lat_deg: -89.68,
    lon_deg: -166.0,
    elevation_m: 2120.0,
    default_hardware_id: "csa-utility-rover",
    region: "south_polar",
    mission: "Artemis III Candidate Region / CSA Utility Rover ops",
    description_tech:
      "Shackleton crater rim (D ~21 km, PSR interior). Rim ridges illuminated > 80% of the year; grazing Sun (|e| < ~2 deg); DTE modulated every 27.21 d by latitudinal libration.",
    description_edu:
      "The rim of a crater right at the south pole. Here the Sun almost never sets, but always hugs the horizon like an eternal sunset.",
    source: "Bussey et al. (2010), Icarus / NASA Artemis III Candidate Regions",
    verification_status: "approximate_pending_lola",
    quickmap_url: "https://quickmap.lroc.im-ldi.com/?extent=-170.0,-89.88,-162.0,-89.48&proj=17",
    moontrek_url: "https://trek.nasa.gov/moon/#v=0.1&x=-166.0&y=-89.68&z=6&p=urn%3Aogc%3Adef%3Acrs%3AIAU2000%3A%3A30120",
  },
  {
    id: "malapert-massif",
    name: "Malapert Massif",
    category: "artemis_candidate",
    lat_deg: -86.0,
    lon_deg: 2.7,
    elevation_m: 4650.0,
    default_hardware_id: "clps-lander-mast",
    region: "south_polar",
    mission: "Artemis III Candidate Region / Relay & DTE Prime Site",
    description_tech:
      "Massif ~4.6-5.0 km tall facing the Earthward nearside (lon ~2.7 E): provides nearly uninterrupted DTE visibility and broad illumination windows on its ridge.",
    description_edu:
      "An enormous mountain near the south pole that 'faces' Earth: ideal for talking with home without relay satellites.",
    source: "NASA Artemis III candidate landing regions",
    verification_status: "approximate_pending_lola",
    quickmap_url: "https://quickmap.lroc.im-ldi.com/?extent=1.7,-86.3,3.7,-85.7&proj=17",
    moontrek_url: "https://trek.nasa.gov/moon/#v=0.1&x=2.7&y=-86.0&z=6&p=urn%3Aogc%3Adef%3Acrs%3AIAU2000%3A%3A30120",
  },
  {
    id: "mons-mouton-leibnitz-beta",
    name: "Mons Mouton (Leibnitz Beta Plateau) - IM-2 Athena",
    category: "clps",
    lat_deg: -84.7906,
    lon_deg: 29.1957,
    elevation_m: 5321.0,
    default_hardware_id: "clps-lander-mast",
    region: "south_polar",
    mission: "CLPS IM-2 (Intuitive Machines, Athena), 2025-03-06",
    description_tech:
      "Elevated plateau (+5321 m above R=1737.4 km) on former Leibnitz Beta. Real CLPS landing site at the south pole.",
    description_edu:
      "A very high plateau near the south pole where the commercial lander Athena touched down in 2025.",
    source: "LROC (Athena location 84.7906 S, 29.1957 E; elevation +5321 m)",
    verification_status: "verified_literature",
    quickmap_url: "https://quickmap.lroc.im-ldi.com/?extent=28.5,-85.0,29.9,-84.5&proj=17",
    moontrek_url: "https://trek.nasa.gov/moon/#v=0.1&x=29.1957&y=-84.7906&z=6&p=urn%3Aogc%3Adef%3Acrs%3AIAU2000%3A%3A30120",
  },
  {
    id: "cabeus-crater",
    name: "Cabeus Crater (LCROSS impact site)",
    category: "science_target",
    lat_deg: -84.675,
    lon_deg: -48.725,
    elevation_m: -3850.0,
    default_hardware_id: "csa-leap-payload",
    region: "south_polar",
    mission: "LCROSS (NASA), impact 2009-10-09",
    description_tech:
      "Depressed interior (-3.85 km) in permanent shadow (PSR) with water ice confirmed by LCROSS.",
    description_edu:
      "A crater so deep its floor never sees the Sun. NASA discovered water ice here in 2009.",
    source: "Colaprete et al. (2010), Science - LCROSS impact 84.675 S, 48.725 W",
    verification_status: "verified_literature",
    quickmap_url: "https://quickmap.lroc.im-ldi.com/?extent=-50.0,-85.0,-47.5,-84.3&proj=17",
    moontrek_url: "https://trek.nasa.gov/moon/#v=0.1&x=-48.725&y=-84.675&z=6&p=urn%3Aogc%3Adef%3Acrs%3AIAU2000%3A%3A30120",
  },
];

function clampObserverHeight(h: number): number {
  return Math.min(100.0, Math.max(0.0, Number(h.toFixed(1))));
}

function detectResolutionProfile(): ResolutionProfile {
  if (typeof window === "undefined") return "desktop";
  if (window.innerWidth < 768) return "mobile";
  if (window.innerWidth < 1024) return "tablet";
  return "desktop";
}

export function App() {
  const { lang, t } = useLanguage();
  const [mode, setMode] = useState<AppMode>("edu");
  const [visualSubview, setVisualSubview] = useState<VisualSubview>("globe3d");
  const [mobileTab, setMobileTab] = useState<MobileTab>("visual");

  useEffect(() => {
    if (mode === "edu" && mobileTab === "timeline") {
      setMobileTab("visual");
    }
  }, [mode, mobileTab]);

  const [curatedSites, setCuratedSites] = useState<CuratedSite[]>(FALLBACK_SITES);
  const [hardwareProfiles, setHardwareProfiles] = useState<HardwareProfile[]>(FALLBACK_HARDWARE);
  const [selectedHardwareId, setSelectedHardwareId] = useState<string>("csa-utility-rover");
  const [scientificSeal, setScientificSeal] = useState<ScientificVerificationSeal>(FALLBACK_SEAL);

  const selectedHardware = useMemo(
    () => hardwareProfiles.find((h) => h.id === selectedHardwareId) ?? FALLBACK_HARDWARE[1]!,
    [hardwareProfiles, selectedHardwareId],
  );

  // Up to 9 sites simultaneously in both Educational and Engineer modes (starts empty on startup)
  const [selectedSites, setSelectedSites] = useState<LunarCoordinate[]>([]);
  const [focusedIndex, setFocusedIndex] = useState<number>(0);
  const maxCompareSites = 9;

  const [startDateIso, setStartDateIso] = useState<string>("2026-12-21T00:00:00Z");
  const [windowDays, setWindowDays] = useState<number>(14);
  const [sampleIndex, setSampleIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  const [seriesByKey, setSeriesByKey] = useState<Record<string, VisibilityTimeSeries>>({});
  const [metricsByKey, setMetricsByKey] = useState<Record<string, SiteSummaryMetrics>>({});
  const [solarEnergyByKey, setSolarEnergyByKey] = useState<Record<string, SolarEnergySummary>>({});
  const [horizonByKey, setHorizonByKey] = useState<Record<string, HorizonProfile>>({});
  const [focusedHorizon, setFocusedHorizon] = useState<HorizonProfile | null>(null);
  const [focusedTerrain, setFocusedTerrain] = useState<TerrainPatch | null>(null);

  // Resizable panel state (desktop split width % + optional explicit panel heights)
  const [splitLeftPct, setSplitLeftPct] = useState<number>(43);
  const [visualPanelHeight, setVisualPanelHeight] = useState<number | null>(null);
  const [comparePanelHeight, setComparePanelHeight] = useState<number | null>(null);
  const workspaceRef = useRef<HTMLElement | null>(null);
  const visualPanelRef = useRef<HTMLElement | null>(null);
  const comparePaneRef = useRef<HTMLDivElement | null>(null);

  const startResizeDrag = (
    e: ReactPointerEvent<HTMLElement>,
    opts: { axis: "x" | "y" | "xy-left" | "xy-right"; target?: "visual" | "compare"; cursor: string },
  ) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const wsRect = workspaceRef.current?.getBoundingClientRect();
    const targetEl = opts.target === "visual" ? visualPanelRef.current : comparePaneRef.current;
    const startHeight = targetEl?.getBoundingClientRect().height ?? 520;
    const startY = e.clientY;
    const prevUserSelect = document.body.style.userSelect;
    const prevCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = opts.cursor;

    const handleMove = (moveEvent: PointerEvent) => {
      if ((opts.axis === "x" || opts.axis === "xy-left" || opts.axis === "xy-right") && wsRect && wsRect.width > 0) {
        const minLeftPct = (300 / wsRect.width) * 100;
        const maxLeftPct = Math.max(minLeftPct, 100 - (320 / wsRect.width) * 100);
        const rawPct = ((moveEvent.clientX - wsRect.left) / wsRect.width) * 100;
        const clampedPct = Math.max(Math.max(22, minLeftPct), Math.min(Math.min(75, maxLeftPct), rawPct));
        setSplitLeftPct(Number(clampedPct.toFixed(2)));
      }
      if (opts.axis === "y" || opts.axis === "xy-left" || opts.axis === "xy-right") {
        const rawHeight = Math.round(startHeight + (moveEvent.clientY - startY));
        if (opts.target === "visual") {
          setVisualPanelHeight(Math.max(360, Math.min(1100, rawHeight)));
        } else if (opts.target === "compare") {
          setComparePanelHeight(Math.max(260, Math.min(1400, rawHeight)));
        }
      }
    };

    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      document.body.style.userSelect = prevUserSelect;
      document.body.style.cursor = prevCursor;
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  };

  // Load initial site catalog and scientific seal
  useEffect(() => {
    const ctrl = new AbortController();
    Promise.all([
      apiClient.health(ctrl.signal).catch(() => null),
      apiClient.listSites(ctrl.signal).catch(() => null),
      apiClient.listHardwareProfiles(ctrl.signal).catch(() => null),
    ]).then(([healthRes, sitesRes, hwRes]) => {
      if (healthRes?.scientific_seal) setScientificSeal(healthRes.scientific_seal);
      if (sitesRes && sitesRes.length > 0) setCuratedSites(sitesRes);
      if (hwRes && hwRes.length > 0) setHardwareProfiles(hwRes);
    });
    return () => ctrl.abort();
  }, []);

  // Sync observer_height_m when the selected hardware profile changes
  const handleHardwareChange = (hwId: string) => {
    setSelectedHardwareId(hwId);
    const hw = hardwareProfiles.find((h) => h.id === hwId);
    if (!hw) return;
    const clampedH = clampObserverHeight(hw.observer_height_m);
    setSelectedSites((prev) =>
      prev.map((coord) => ({
        ...coord,
        observer_height_m: clampedH,
      })),
    );
  };

  // Ensure no site in state exceeds backend bounds [0.0 m .. 100.0 m]
  useEffect(() => {
    setSelectedSites((prev) => {
      if (!prev.some((c) => c.observer_height_m > 100.0 || c.observer_height_m < 0.0)) {
        return prev;
      }
      const fallbackH = clampObserverHeight(selectedHardware.observer_height_m);
      return prev.map((c) =>
        c.observer_height_m > 100.0 || c.observer_height_m < 0.0
          ? { ...c, observer_height_m: fallbackH }
          : c,
      );
    });
  }, [selectedSites, selectedHardware.observer_height_m]);

  const effectiveWindowDays = mode === "edu" ? 14 : windowDays;

  const timeWindow: TimeWindow = useMemo(() => {
    const safeDays = Math.max(1, Math.min(365, effectiveWindowDays));
    const startMs = Date.parse(startDateIso);
    const endMs = startMs + safeDays * 86400 * 1000;
    const stepMinutes =
      safeDays <= 3
        ? 30
        : safeDays <= 10
          ? 60
          : safeDays <= 30
            ? 120
            : safeDays <= 90
              ? 240
              : Math.min(1440, Math.max(240, Math.round((safeDays * 1440) / 360)));
    return {
      start_utc: new Date(startMs).toISOString().replace(".000Z", "Z"),
      end_utc: new Date(endMs).toISOString().replace(".000Z", "Z"),
      step_minutes: stepMinutes,
    };
  }, [startDateIso, effectiveWindowDays]);

  // Evaluate site comparison and time series when sites, height, or window change
  useEffect(() => {
    if (selectedSites.length === 0) {
      setMetricsByKey({});
      setSeriesByKey({});
      setSolarEnergyByKey({});
      setHorizonByKey({});
      return;
    }
    const ctrl = new AbortController();
    const ephem: EphemerisKernel = "DE421";

    apiClient
      .compareSites(
        {
          sites: selectedSites,
          window: timeWindow,
          dte_elevation_mask_deg: 0.0,
          ephemeris: ephem,
        },
        ctrl.signal,
      )
      .then((cmpRes) => {
        const nextMetrics: Record<string, SiteSummaryMetrics> = {};
        for (const m of cmpRes.metrics) {
          nextMetrics[coordinateKey(m.site)] = m;
        }
        setMetricsByKey(nextMetrics);
      })
      .catch(() => undefined);

    Promise.all(
      selectedSites.map((site) =>
        apiClient
          .fetchVisibility(
            {
              site,
              window: timeWindow,
              dte_elevation_mask_deg: 0.0,
              ephemeris: ephem,
            },
            ctrl.signal,
          )
          .then((ts) => ({ key: coordinateKey(site), ts }))
          .catch(() => null),
      ),
    ).then((items) => {
      const nextSeries: Record<string, VisibilityTimeSeries> = {};
      for (const item of items) {
        if (item) nextSeries[item.key] = item.ts;
      }
      setSeriesByKey(nextSeries);
    });

    Promise.all(
      selectedSites.map((site) =>
        apiClient
          .fetchSolarEnergy(
            {
              site,
              window: timeWindow,
              fixed_azimuth_deg: 0.0,
              ephemeris: ephem,
            },
            ctrl.signal,
          )
          .then((summary) => ({ key: coordinateKey(site), summary }))
          .catch(() => null),
      ),
    ).then((items) => {
      const nextSolar: Record<string, SolarEnergySummary> = {};
      for (const item of items) {
        if (item) nextSolar[item.key] = item.summary;
      }
      setSolarEnergyByKey(nextSolar);
    });

    Promise.all(
      selectedSites.map((site) =>
        apiClient
          .fetchHorizon(
            {
              site,
              azimuth_step_deg: 0.5,
              max_distance_km: 150.0,
              dem_product: null,
            },
            ctrl.signal,
          )
          .then((profile) => ({ key: coordinateKey(site), profile }))
          .catch(() => null),
      ),
    ).then((items) => {
      const nextH: Record<string, HorizonProfile> = {};
      for (const item of items) {
        if (item) nextH[item.key] = item.profile;
      }
      setHorizonByKey(nextH);
    });

    return () => ctrl.abort();
  }, [selectedSites, timeWindow]);

  const handleChangeSiteHeight = (index: number, newHeight_m: number) => {
    const clamped = clampObserverHeight(newHeight_m);
    setSelectedSites((prev) =>
      prev.map((coord, i) => (i === index ? { ...coord, observer_height_m: clamped } : coord)),
    );
    const matchingHw = hardwareProfiles.find((h) => Math.abs(h.observer_height_m - clamped) < 0.05);
    if (matchingHw && index === focusedIndex) {
      setSelectedHardwareId(matchingHw.id);
    }
  };

  const focusedSite: LunarCoordinate | null = selectedSites[focusedIndex] ?? selectedSites[0] ?? null;
  const focusedKey = focusedSite ? coordinateKey(focusedSite) : null;
  const focusedSeries = focusedKey ? (seriesByKey[focusedKey] ?? null) : null;
  const focusedCurated = focusedSite ? curatedSites.find((s) => s.id === focusedSite.site_id) : undefined;

  // Load 360° horizon profile and adaptive 3D mesh for the focused site
  useEffect(() => {
    if (!focusedSite) {
      setFocusedHorizon(null);
      setFocusedTerrain(null);
      return;
    }
    const ctrl = new AbortController();
    const resProfile = detectResolutionProfile();

    apiClient
      .fetchHorizon(
        {
          site: focusedSite,
          azimuth_step_deg: 0.5,
          max_distance_km: 150.0,
          dem_product: null,
        },
        ctrl.signal,
      )
      .then((profile) => setFocusedHorizon(profile))
      .catch(() => undefined);

    apiClient
      .fetchTerrainPatch(
        {
          site: focusedSite,
          half_extent_km: 10.0,
          resolution_profile: resProfile,
        },
        ctrl.signal,
      )
      .then((patch) => setFocusedTerrain(patch))
      .catch(() => undefined);

    return () => ctrl.abort();
  }, [focusedSite]);

  // Animation loop for the time scrubber
  useEffect(() => {
    if (!isPlaying) return;
    const maxLen = focusedSeries?.samples.length ?? 1;
    const timer = window.setInterval(() => {
      setSampleIndex((prev) => (prev + 1) % Math.max(1, maxLen));
    }, 180);
    return () => window.clearInterval(timer);
  }, [isPlaying, focusedSeries]);

  const currentSampleByKey = useMemo(() => {
    const out: Record<string, VisibilitySample | undefined> = {};
    for (const [k, ts] of Object.entries(seriesByKey)) {
      const idx = Math.min(sampleIndex, Math.max(0, ts.samples.length - 1));
      out[k] = ts.samples[idx];
    }
    return out;
  }, [seriesByKey, sampleIndex]);

  const focusedSample = focusedKey ? (currentSampleByKey[focusedKey] ?? null) : null;

  const handleRemoveSite = (indexToRemove: number) => {
    setSelectedSites((prev) => {
      const next = prev.filter((_, idx) => idx !== indexToRemove);
      setFocusedIndex((prevFocus) => {
        if (next.length === 0) return 0;
        if (prevFocus >= next.length) return Math.max(0, next.length - 1);
        if (indexToRemove < prevFocus) return Math.max(0, prevFocus - 1);
        return prevFocus;
      });
      return next;
    });
  };

  const handleClearAllSites = () => {
    setSelectedSites([]);
    setFocusedIndex(0);
  };

  const handleToggleCuratedSite = (site: CuratedSite) => {
    const existingIdx = selectedSites.findIndex((s) => s.site_id === site.id);
    if (existingIdx !== -1) {
      handleRemoveSite(existingIdx);
      return;
    }
    const newCoord: LunarCoordinate = {
      lat_deg: site.lat_deg,
      lon_deg: site.lon_deg,
      observer_height_m: clampObserverHeight(selectedHardware.observer_height_m),
      site_id: site.id,
    };
    setSelectedSites((prev) => {
      const next =
        prev.length >= maxCompareSites
          ? [...prev.slice(0, maxCompareSites - 1), newCoord]
          : [...prev, newCoord];
      setFocusedIndex(next.length - 1);
      return next;
    });
  };

  const handleSelectCuratedFromMap = (siteId: string) => {
    const site = curatedSites.find((s) => s.id === siteId);
    const defaultHeight = clampObserverHeight(selectedHardware.observer_height_m);
    setSelectedSites((prev) => {
      const existingIdx = prev.findIndex((s) => s.site_id === siteId);
      if (existingIdx !== -1) {
        setFocusedIndex(existingIdx);
        return prev;
      }
      if (!site) return prev;
      const newCoord: LunarCoordinate = {
        lat_deg: site.lat_deg,
        lon_deg: site.lon_deg,
        observer_height_m: defaultHeight,
        site_id: site.id,
      };
      const next =
        prev.length >= maxCompareSites
          ? [...prev.slice(0, maxCompareSites - 1), newCoord]
          : [...prev, newCoord];
      setFocusedIndex(next.length - 1);
      return next;
    });
  };

  const handleAddCustomCoordinate = (lat_deg: number, lon_deg: number) => {
    const customCoord: LunarCoordinate = {
      lat_deg: Number(lat_deg.toFixed(4)),
      lon_deg: Number(lon_deg.toFixed(4)),
      observer_height_m: clampObserverHeight(selectedHardware.observer_height_m),
      site_id: null,
    };
    setSelectedSites((prev) => {
      const next =
        prev.length >= maxCompareSites
          ? [...prev.slice(0, maxCompareSites - 1), customCoord]
          : [...prev, customCoord];
      setFocusedIndex(next.length - 1);
      return next;
    });
  };

  const focusedLinks = !focusedSite
    ? null
    : focusedCurated
      ? { quickmap_url: focusedCurated.quickmap_url, moontrek_url: focusedCurated.moontrek_url }
      : buildExternalPortalLinks(focusedSite.lat_deg, focusedSite.lon_deg);

  const localizedFocusedSite = focusedCurated ? getLocalizedSiteCopy(focusedCurated, lang) : null;
  const localizedSelectedHardware = getLocalizedHardwareCopy(selectedHardware, lang);

  return (
    <div className="hud-shell">
      <HeaderHUD
        mode={mode}
        onModeChange={setMode}
        hardwareProfiles={hardwareProfiles}
        selectedHardwareId={selectedHardwareId}
        onHardwareChange={handleHardwareChange}
        scientificSeal={scientificSeal}
        startDateIso={startDateIso}
        onStartDateChange={(iso) => {
          setStartDateIso(iso);
          setSampleIndex(0);
        }}
        windowDays={windowDays}
        onWindowDaysChange={(d) => {
          setWindowDays(d);
          setSampleIndex(0);
        }}
      />

      {/* Touch tabs for Mobile & Tablet (< 1024px) */}
      <nav className="glass-panel mobile-nav-tabs" aria-label={t.app.mobileNavAria}>
        <button
          type="button"
          className={`mobile-tab-btn ${mobileTab === "visual" ? "active" : ""}`}
          onClick={() => setMobileTab("visual")}
        >
          {t.app.tabVisual}
        </button>
        <button
          type="button"
          className={`mobile-tab-btn ${mobileTab === "compare" ? "active" : ""}`}
          onClick={() => setMobileTab("compare")}
        >
          {t.app.tabCompare} ({selectedSites.length})
        </button>
        {mode === "eng" && (
          <button
            type="button"
            className={`mobile-tab-btn ${mobileTab === "timeline" ? "active" : ""}`}
            onClick={() => setMobileTab("timeline")}
          >
            {t.app.tabTimeline}
          </button>
        )}
      </nav>

      {/* Central Console: Left Panel (3D/2D Visual Core) + Resizable Splitter + Right Panel (Comparator) */}
      <main
        ref={workspaceRef}
        className="mission-workspace"
        style={{ "--visual-pane-width": `${splitLeftPct}%` } as CSSProperties}
      >
        <section
          ref={visualPanelRef}
          className={`glass-panel visual-core-panel ${mobileTab !== "visual" ? "hide-on-mobile" : ""} ${visualPanelHeight !== null ? "is-custom-sized" : ""}`}
          style={visualPanelHeight !== null ? { height: `${visualPanelHeight}px` } : undefined}
          aria-label={t.app.visualCoreAria}
        >
          <div className="panel-header">
            <h2 className="panel-title">
              {mode === "edu" ? t.app.visualTitleEdu : t.app.visualTitleEng}
            </h2>

            <div className="subview-tabs" role="tablist" aria-label={t.app.subviewTablistAria}>
              <button
                type="button"
                role="tab"
                aria-selected={visualSubview === "globe3d"}
                className={`subview-btn ${visualSubview === "globe3d" ? "active" : ""}`}
                onClick={() => setVisualSubview("globe3d")}
              >
                {t.app.subviewGlobe}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={visualSubview === "dome360"}
                className={`subview-btn ${visualSubview === "dome360" ? "active" : ""}`}
                onClick={() => setVisualSubview("dome360")}
              >
                {t.app.subviewDome}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={visualSubview === "terrain3d"}
                className={`subview-btn ${visualSubview === "terrain3d" ? "active" : ""}`}
                onClick={() => setVisualSubview("terrain3d")}
              >
                {t.app.subviewTerrain}
              </button>
            </div>
          </div>

          {visualSubview === "globe3d" && (
            <LunarGlobe3D
              sites={curatedSites}
              selectedSiteIds={selectedSites.map((s) => s.site_id).filter((id): id is string => Boolean(id))}
              selectedSites={selectedSites}
              focusedSite={focusedSite}
              focusedIndex={focusedIndex}
              currentSample={focusedSample}
              mode={mode}
              onSelectCuratedSite={handleSelectCuratedFromMap}
              onSelectCustomCoordinate={handleAddCustomCoordinate}
              onOpenLocalTerrain3D={() => setVisualSubview("terrain3d")}
            />
          )}

          {visualSubview === "dome360" && (
            <HorizonDome
              profile={focusedHorizon}
              currentSample={focusedSeries?.samples[0] ?? focusedSample}
              mode={mode}
              hasSelection={Boolean(focusedSite)}
              curatedSites={curatedSites}
              selectedSites={selectedSites}
              focusedIndex={focusedIndex}
              onSelectSiteIndex={setFocusedIndex}
            />
          )}

          {visualSubview === "terrain3d" && (
            <Terrain3D
              patch={focusedTerrain}
              currentSample={focusedSample}
              mode={mode}
              hasSelection={Boolean(focusedSite)}
              onBackToGlobe={() => setVisualSubview("globe3d")}
              curatedSites={curatedSites}
              selectedSites={selectedSites}
              focusedIndex={focusedIndex}
              onSelectSiteIndex={setFocusedIndex}
            />
          )}

          {/* Contextual card for the focused site + Value proposition vs Moon Trek */}
          <div className="mission-story-card">
            {focusedSite && focusedLinks ? (
              <>
                <div className="mission-story-header">
                  <strong>
                    {localizedFocusedSite
                      ? `${localizedFocusedSite.name} · ${localizedFocusedSite.mission}`
                      : `${t.app.customCoordHeading} (${focusedSite.lat_deg.toFixed(4)}°, ${focusedSite.lon_deg.toFixed(4)}°)`}
                  </strong>
                  <span className="mono-telemetry" style={{ fontSize: "11px", color: "var(--accent-blue-text)" }}>
                    {t.app.hardwareLabel} {localizedSelectedHardware.name}
                  </span>
                </div>

                {localizedFocusedSite && (
                  <p style={{ margin: 0, fontSize: "12px", color: "var(--text-secondary)" }}>
                    {mode === "edu"
                      ? localizedFocusedSite.description_edu
                      : localizedFocusedSite.description_tech}
                  </p>
                )}

                <div className="portal-links-row">
                  <a
                    href={focusedLinks.quickmap_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="portal-link"
                  >
                    {t.app.exploreQuickmap}
                  </a>
                  <a
                    href={focusedLinks.moontrek_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="portal-link"
                  >
                    {t.app.viewMoontrek}
                  </a>
                </div>
              </>
            ) : (
              <>
                <div className="mission-story-header">
                  <strong>{t.app.noSiteSelectedTitle}</strong>
                </div>
                <p style={{ margin: 0, fontSize: "12px", color: "var(--text-secondary)" }}>
                  {t.app.noSiteSelectedDesc}
                </p>
              </>
            )}
          </div>

          <div
            className="panel-resize-handle-y"
            role="separator"
            aria-orientation="horizontal"
            title={t.app.resizeHeightTitle}
            onPointerDown={(e) => startResizeDrag(e, { axis: "y", target: "visual", cursor: "ns-resize" })}
            onDoubleClick={() => setVisualPanelHeight(null)}
          />
          <div
            className="panel-resize-handle-corner corner-br"
            title={t.app.resizeCornerTitle}
            onPointerDown={(e) => startResizeDrag(e, { axis: "xy-left", target: "visual", cursor: "nwse-resize" })}
            onDoubleClick={() => {
              setSplitLeftPct(43);
              setVisualPanelHeight(null);
            }}
          />
        </section>

        <div
          className="workspace-splitter-x"
          role="separator"
          aria-orientation="vertical"
          title={t.app.resizeSplitterTitle}
          onPointerDown={(e) => startResizeDrag(e, { axis: "x", cursor: "col-resize" })}
          onDoubleClick={() => setSplitLeftPct(43)}
        />

        <div
          ref={comparePaneRef}
          className={`comparator-pane ${mobileTab !== "compare" ? "hide-on-mobile" : ""} ${comparePanelHeight !== null ? "is-custom-sized" : ""}`}
          style={comparePanelHeight !== null ? { height: `${comparePanelHeight}px` } : undefined}
        >
          <ComparisonGrid
            curatedSites={curatedSites}
            selectedSites={selectedSites}
            focusedIndex={focusedIndex}
            onFocusIndex={setFocusedIndex}
            onToggleCuratedSite={handleToggleCuratedSite}
            onRemoveSite={handleRemoveSite}
            onClearAllSites={handleClearAllSites}
            onAddCustomCoordinate={handleAddCustomCoordinate}
            onChangeSiteHeight={handleChangeSiteHeight}
            metricsByKey={metricsByKey}
            solarEnergyByKey={solarEnergyByKey}
            seriesByKey={seriesByKey}
            horizonByKey={horizonByKey}
            currentSampleByKey={currentSampleByKey}
            windowDays={effectiveWindowDays}
            startDateIso={startDateIso}
            mode={mode}
            activeVisualSubview={visualSubview}
            onShowInTerrain3D={(idx) => {
              setFocusedIndex(idx);
              setVisualSubview("terrain3d");
              if (typeof window !== "undefined" && window.innerWidth < 1024) {
                setMobileTab("visual");
              }
            }}
          />
          <div
            className="panel-resize-handle-y"
            role="separator"
            aria-orientation="horizontal"
            title={t.app.resizeHeightTitle}
            onPointerDown={(e) => startResizeDrag(e, { axis: "y", target: "compare", cursor: "ns-resize" })}
            onDoubleClick={() => setComparePanelHeight(null)}
          />
          <div
            className="panel-resize-handle-corner corner-bl"
            title={t.app.resizeCornerTitle}
            onPointerDown={(e) => startResizeDrag(e, { axis: "xy-right", target: "compare", cursor: "nesw-resize" })}
            onDoubleClick={() => {
              setSplitLeftPct(43);
              setComparePanelHeight(null);
            }}
          />
        </div>
      </main>

      {/* Docked Bottom Panel: ECharts Timeline + Playback Controls (Engineer Mode Only) */}
      {mode === "eng" && (
        <div className={mobileTab !== "timeline" ? "hide-on-mobile" : ""}>
          <ElevationTimeline
            series={focusedSeries}
            focusedSiteName={
              focusedSite
                ? localizedFocusedSite
                  ? localizedFocusedSite.name
                  : `${t.app.customTimelineLabel} (${focusedSite.lat_deg.toFixed(2)}°, ${focusedSite.lon_deg.toFixed(2)}°)`
                : null
            }
            selectedSites={selectedSites}
            curatedSites={curatedSites}
            focusedIndex={focusedIndex}
            onSelectSiteIndex={setFocusedIndex}
            sampleIndex={sampleIndex}
            onSampleIndexChange={setSampleIndex}
            isPlaying={isPlaying}
            onTogglePlay={() => setIsPlaying((prev) => !prev)}
            startDateIso={startDateIso}
            mode={mode}
          />
        </div>
      )}
    </div>
  );
}
