import { useEffect, useMemo, useState } from "react";
import { ComparisonGrid, coordinateKey } from "./components/ComparisonGrid";
import { ElevationTimeline } from "./components/ElevationTimeline";
import { type AppMode, HeaderHUD } from "./components/HeaderHUD";
import { HorizonDome } from "./components/HorizonDome";
import { LunarGlobe3D } from "./components/LunarGlobe3D";
import { PolarMap2D } from "./components/PolarMap2D";
import { Terrain3D } from "./components/Terrain3D";
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
  TerrainPatch,
  TimeWindow,
  VisibilitySample,
  VisibilityTimeSeries,
} from "./types/contracts";

type VisualSubview = "globe3d" | "dome360" | "terrain3d" | "polar2d";
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
    description_tech: "Microrover e instrumentos de superficie del programa LEAP de la CSA.",
    description_edu: "Un mini-rover canadiense bajito (0,5 m).",
  },
  {
    id: "csa-utility-rover",
    name: "CSA Canadian Utility Rover Mast (1.5 m)",
    agency: "CSA (Canadian Space Agency)",
    observer_height_m: 1.5,
    description_tech: "Mastil de navegacion y antena DTE del Canadian Utility Rover de la CSA.",
    description_edu: "El rover utilitario de Canada (1,5 m) disenado para asistir a los astronautas.",
  },
  {
    id: "artemis-eva-mast",
    name: "Artemis Astronaut EVA / Standard Tripod (2.0 m)",
    agency: "NASA / Artemis",
    observer_height_m: 2.0,
    description_tech: "Altura estandar (2.0 m) para visor de astronauta o tripode desplegable.",
    description_edu: "La altura de los ojos de un astronauta o antena portatil (2 m).",
  },
  {
    id: "artemis-ltv",
    name: "Artemis Lunar Terrain Vehicle / Rover High-Gain (2.2 m)",
    agency: "NASA / Commercial LTV",
    observer_height_m: 2.2,
    description_tech: "Antena de alta ganancia en banda X/Ka sobre Lunar Terrain Vehicle.",
    description_edu: "El vehiculo lunar de los astronautas con antena a 2,2 m.",
  },
  {
    id: "clps-lander-mast",
    name: "NASA CLPS Lander Top Deck / Solar Array (3.5 m)",
    agency: "NASA CLPS / Commercial",
    observer_height_m: 3.5,
    description_tech: "Cubierta superior de lander comercial CLPS (ej. Nova-C Athena, 3.5 m).",
    description_edu: "La parte alta de un modulo de aterrizaje comercial (3,5 m).",
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
    mission: "Region candidata Artemis III / CSA Utility Rover ops",
    description_tech:
      "Borde del crater Shackleton (D ~21 km, interior PSR). Puntos del borde con iluminacion > 80 % del ano; Sol rasante (|e| < ~2 deg); DTE modulado cada 27.21 d por libracion en latitud.",
    description_edu:
      "El borde de un crater junto al polo sur. Aqui el Sol casi nunca se pone, pero siempre esta pegado al horizonte, como un atardecer eterno.",
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
    mission: "Region candidata Artemis III / Relay & DTE Prime Site",
    description_tech:
      "Macizo de ~4.6-5.0 km de altitud orientado hacia la cara visible (lon ~2.7 E): ofrece visibilidad DTE casi ininterrumpida y amplias ventanas de iluminacion en su cresta.",
    description_edu:
      "Una montana enorme cerca del polo sur que 'mira' hacia la Tierra: ideal para hablar con casa sin satelites.",
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
      "Meseta elevada (+5321 m sobre R=1737.4 km) del antiguo Leibnitz Beta. Sitio de aterrizaje CLPS real en el polo sur.",
    description_edu:
      "Una meseta muy alta cerca del polo sur donde aterrizo la nave comercial Athena en 2025.",
    source: "LROC (posicion de Athena 84.7906 S, 29.1957 E; elevacion +5321 m)",
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
    mission: "LCROSS (NASA), impacto 2009-10-09",
    description_tech:
      "Interior deprimido (-3.85 km) en sombra permanente (PSR) con hielo de agua confirmado por LCROSS.",
    description_edu:
      "Un crater tan profundo que su fondo nunca ve el Sol. Alli la NASA encontro hielo de agua en 2009.",
    source: "Colaprete et al. (2010), Science - LCROSS impact 84.675 S, 48.725 W",
    verification_status: "verified_literature",
    quickmap_url: "https://quickmap.lroc.im-ldi.com/?extent=-50.0,-85.0,-47.5,-84.3&proj=17",
    moontrek_url: "https://trek.nasa.gov/moon/#v=0.1&x=-48.725&y=-84.675&z=6&p=urn%3Aogc%3Adef%3Acrs%3AIAU2000%3A%3A30120",
  },
];

function detectResolutionProfile(): ResolutionProfile {
  if (typeof window === "undefined") return "desktop";
  if (window.innerWidth < 768) return "mobile";
  if (window.innerWidth < 1024) return "tablet";
  return "desktop";
}

export function App() {
  const [mode, setMode] = useState<AppMode>("edu");
  const [visualSubview, setVisualSubview] = useState<VisualSubview>("globe3d");
  const [mobileTab, setMobileTab] = useState<MobileTab>("visual");

  const [curatedSites, setCuratedSites] = useState<CuratedSite[]>(FALLBACK_SITES);
  const [hardwareProfiles, setHardwareProfiles] = useState<HardwareProfile[]>(FALLBACK_HARDWARE);
  const [selectedHardwareId, setSelectedHardwareId] = useState<string>("csa-utility-rover");
  const [scientificSeal, setScientificSeal] = useState<ScientificVerificationSeal>(FALLBACK_SEAL);

  const selectedHardware = useMemo(
    () => hardwareProfiles.find((h) => h.id === selectedHardwareId) ?? FALLBACK_HARDWARE[1]!,
    [hardwareProfiles, selectedHardwareId],
  );

  // Hasta 4 sitios comparados simultaneamente
  const [selectedSites, setSelectedSites] = useState<LunarCoordinate[]>([
    { lat_deg: -89.68, lon_deg: -166.0, observer_height_m: 1.5, site_id: "shackleton-rim" },
    { lat_deg: -86.0, lon_deg: 2.7, observer_height_m: 1.5, site_id: "malapert-massif" },
    { lat_deg: -84.675, lon_deg: -48.725, observer_height_m: 1.5, site_id: "cabeus-crater" },
  ]);
  const [focusedIndex, setFocusedIndex] = useState<number>(0);

  const [startDateIso, setStartDateIso] = useState<string>("2027-01-01T00:00:00Z");
  const [windowDays, setWindowDays] = useState<number>(14);
  const [sampleIndex, setSampleIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  const [seriesByKey, setSeriesByKey] = useState<Record<string, VisibilityTimeSeries>>({});
  const [metricsByKey, setMetricsByKey] = useState<Record<string, SiteSummaryMetrics>>({});
  const [focusedHorizon, setFocusedHorizon] = useState<HorizonProfile | null>(null);
  const [focusedTerrain, setFocusedTerrain] = useState<TerrainPatch | null>(null);

  // Cargar catalogo inicial y sello cientifico
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

  // Sincronizar observer_height_m cuando cambia el perfil de hardware seleccionado
  const handleHardwareChange = (hwId: string) => {
    setSelectedHardwareId(hwId);
    const hw = hardwareProfiles.find((h) => h.id === hwId);
    if (!hw) return;
    setSelectedSites((prev) =>
      prev.map((coord) => ({
        ...coord,
        observer_height_m: hw.observer_height_m,
      })),
    );
  };

  const timeWindow: TimeWindow = useMemo(() => {
    const startMs = Date.parse(startDateIso);
    const endMs = startMs + windowDays * 86400 * 1000;
    return {
      start_utc: new Date(startMs).toISOString().replace(".000Z", "Z"),
      end_utc: new Date(endMs).toISOString().replace(".000Z", "Z"),
      step_minutes: windowDays <= 7 ? 60 : 120,
    };
  }, [startDateIso, windowDays]);

  // Evaluar comparacion y series temporales cuando cambian sitios, altura o ventana
  useEffect(() => {
    if (selectedSites.length === 0) {
      setMetricsByKey({});
      setSeriesByKey({});
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

    return () => ctrl.abort();
  }, [selectedSites, timeWindow]);

  const defaultPreviewSite: LunarCoordinate = {
    lat_deg: -89.68,
    lon_deg: -166.0,
    observer_height_m: selectedHardware.observer_height_m,
    site_id: "shackleton-rim",
  };
  const focusedSite = selectedSites[focusedIndex] ?? selectedSites[0] ?? defaultPreviewSite;
  const focusedKey = coordinateKey(focusedSite);
  const focusedSeries = seriesByKey[focusedKey] ?? null;
  const focusedCurated = curatedSites.find((s) => s.id === focusedSite.site_id);

  // Cargar perfil de horizonte 360° y malla 3D adaptativa para el sitio enfocado
  useEffect(() => {
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

  // Bucle de animacion del scrubber temporal
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

  const focusedSample = currentSampleByKey[focusedKey] ?? null;

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
      observer_height_m: selectedHardware.observer_height_m,
      site_id: site.id,
    };
    setSelectedSites((prev) => {
      const next = prev.length >= 4 ? [...prev.slice(0, 3), newCoord] : [...prev, newCoord];
      setFocusedIndex(next.length - 1);
      return next;
    });
  };

  const handleSelectCuratedFromMap = (siteId: string) => {
    const existingIdx = selectedSites.findIndex((s) => s.site_id === siteId);
    if (existingIdx !== -1) {
      setFocusedIndex(existingIdx);
      return;
    }
    const site = curatedSites.find((s) => s.id === siteId);
    if (site) handleToggleCuratedSite(site);
  };

  const handleAddCustomCoordinate = (lat_deg: number, lon_deg: number) => {
    const customCoord: LunarCoordinate = {
      lat_deg,
      lon_deg,
      observer_height_m: selectedHardware.observer_height_m,
      site_id: null,
    };
    setSelectedSites((prev) => {
      const next = prev.length >= 4 ? [...prev.slice(0, 3), customCoord] : [...prev, customCoord];
      setFocusedIndex(next.length - 1);
      return next;
    });
  };

  const focusedLinks = focusedCurated
    ? { quickmap_url: focusedCurated.quickmap_url, moontrek_url: focusedCurated.moontrek_url }
    : buildExternalPortalLinks(focusedSite.lat_deg, focusedSite.lon_deg);

  return (
    <div className="hud-shell">
      <HeaderHUD
        mode={mode}
        onModeChange={setMode}
        hardwareProfiles={hardwareProfiles}
        selectedHardwareId={selectedHardwareId}
        onHardwareChange={handleHardwareChange}
        scientificSeal={scientificSeal}
      />

      {/* Pestañas tactiles para Movil y Tablet (< 1024px) */}
      <nav className="glass-panel mobile-nav-tabs" aria-label="Navegacion tactil movil">
        <button
          type="button"
          className={`mobile-tab-btn ${mobileTab === "visual" ? "active" : ""}`}
          onClick={() => setMobileTab("visual")}
        >
          1. Globo 3D & Horizonte
        </button>
        <button
          type="button"
          className={`mobile-tab-btn ${mobileTab === "compare" ? "active" : ""}`}
          onClick={() => setMobileTab("compare")}
        >
          2. Comparador ({selectedSites.length})
        </button>
        <button
          type="button"
          className={`mobile-tab-btn ${mobileTab === "timeline" ? "active" : ""}`}
          onClick={() => setMobileTab("timeline")}
        >
          3. Línea Temporal
        </button>
      </nav>

      {/* Consola Central: Panel Izquierdo (Nucleo Visual 3D/2D) + Panel Derecho (Comparador Lado a Lado) */}
      <main className="mission-workspace">
        <section
          className={`glass-panel visual-core-panel ${mobileTab !== "visual" ? "hide-on-mobile" : ""}`}
          aria-label="Nucleo visual 3D y horizonte lunar"
        >
          <div className="panel-header">
            <h2 className="panel-title">
              {mode === "edu"
                ? "Explorador Visual Lunar 3D y Horizonte"
                : "3D Selenographic Visual Core & Local Horizon"}
            </h2>

            <div className="subview-tabs" role="tablist" aria-label="Selector de vista espacial">
              <button
                type="button"
                role="tab"
                aria-selected={visualSubview === "globe3d"}
                className={`subview-btn ${visualSubview === "globe3d" ? "active" : ""}`}
                onClick={() => setVisualSubview("globe3d")}
              >
                Globo Lunar 3D
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={visualSubview === "dome360"}
                className={`subview-btn ${visualSubview === "dome360" ? "active" : ""}`}
                onClick={() => setVisualSubview("dome360")}
              >
                Cúpula Horizonte 360°
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={visualSubview === "terrain3d"}
                className={`subview-btn ${visualSubview === "terrain3d" ? "active" : ""}`}
                onClick={() => setVisualSubview("terrain3d")}
              >
                Terreno 3D LOLA
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={visualSubview === "polar2d"}
                className={`subview-btn ${visualSubview === "polar2d" ? "active" : ""}`}
                onClick={() => setVisualSubview("polar2d")}
              >
                Mapa Polar 2D
              </button>
            </div>
          </div>

          {visualSubview === "globe3d" && (
            <LunarGlobe3D
              sites={curatedSites}
              selectedSiteIds={selectedSites.map((s) => s.site_id).filter((id): id is string => Boolean(id))}
              focusedSite={focusedSite}
              currentSample={focusedSample}
              mode={mode}
              onSelectCuratedSite={handleSelectCuratedFromMap}
              onSelectCustomCoordinate={handleAddCustomCoordinate}
              onOpenLocalTerrain3D={() => setVisualSubview("terrain3d")}
            />
          )}

          {visualSubview === "dome360" && (
            <HorizonDome profile={focusedHorizon} currentSample={focusedSample} mode={mode} />
          )}

          {visualSubview === "terrain3d" && (
            <Terrain3D
              patch={focusedTerrain}
              currentSample={focusedSample}
              mode={mode}
              onBackToGlobe={() => setVisualSubview("globe3d")}
            />
          )}

          {visualSubview === "polar2d" && (
            <PolarMap2D
              sites={curatedSites}
              selectedSiteIds={selectedSites.map((s) => s.site_id).filter((id): id is string => Boolean(id))}
              focusedSite={focusedSite}
              mode={mode}
              onSelectCuratedSite={handleSelectCuratedFromMap}
              onSelectCustomCoordinate={handleAddCustomCoordinate}
            />
          )}

          {/* Ficha contextual del sitio enfocado + Propuesta de valor frente a Moon Trek */}
          <div className="mission-story-card">
            <div className="mission-story-header">
              <strong>
                {focusedCurated
                  ? `${focusedCurated.name} · ${focusedCurated.mission}`
                  : `Coordenada Lunar Personalizada (${focusedSite.lat_deg.toFixed(4)}°, ${focusedSite.lon_deg.toFixed(4)}°)`}
              </strong>
              <span className="mono-telemetry" style={{ fontSize: "11px", color: "#93C5FD" }}>
                Hardware: {selectedHardware.name}
              </span>
            </div>

            <p style={{ margin: 0, fontSize: "12px", color: "var(--text-secondary)" }}>
              {mode === "edu"
                ? focusedCurated?.description_edu ??
                  "Punto personalizado sobre la superficie lunar. Observa cómo cambia la visibilidad del Sol y de la Tierra según la latitud y la altura del mástil."
                : focusedCurated?.description_tech ??
                  `Evaluación topográfica MOON_ME con altura de instrumento h₀ = ${focusedSite.observer_height_m.toFixed(1)} m (${selectedHardware.agency}).`}
            </p>

            <div className="portal-links-row">
              <a
                href={focusedLinks.quickmap_url}
                target="_blank"
                rel="noopener noreferrer"
                className="portal-link"
              >
                ↗ Explorar en LROC QuickMap (quickmap.lroc.im-ldi.com)
              </a>
              <a
                href={focusedLinks.moontrek_url}
                target="_blank"
                rel="noopener noreferrer"
                className="portal-link"
              >
                ↗ Ver en NASA Moon Trek
              </a>
              <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                ★ Acceso abierto a iluminación/horizonte LOLA (restringido a cuentas JPL en Moon Trek)
              </span>
            </div>
          </div>
        </section>

        <div className={mobileTab !== "compare" ? "hide-on-mobile" : ""}>
          <ComparisonGrid
            curatedSites={curatedSites}
            selectedSites={selectedSites}
            focusedIndex={focusedIndex}
            onFocusIndex={setFocusedIndex}
            onToggleCuratedSite={handleToggleCuratedSite}
            onRemoveSite={handleRemoveSite}
            onClearAllSites={handleClearAllSites}
            onAddCustomCoordinate={handleAddCustomCoordinate}
            metricsByKey={metricsByKey}
            currentSampleByKey={currentSampleByKey}
            windowDays={windowDays}
            mode={mode}
          />
        </div>
      </main>

      {/* Panel Inferior Acoplado: Linea Temporal ECharts + Controles de Reproduccion */}
      <div className={mobileTab !== "timeline" ? "hide-on-mobile" : ""}>
        <ElevationTimeline
          series={focusedSeries}
          focusedSiteName={
            focusedCurated
              ? focusedCurated.name
              : `Custom (${focusedSite.lat_deg.toFixed(2)}°, ${focusedSite.lon_deg.toFixed(2)}°)`
          }
          sampleIndex={sampleIndex}
          onSampleIndexChange={setSampleIndex}
          isPlaying={isPlaying}
          onTogglePlay={() => setIsPlaying((prev) => !prev)}
          windowDays={windowDays}
          onWindowDaysChange={(d) => {
            setWindowDays(d);
            setSampleIndex(0);
          }}
          startDateIso={startDateIso}
          onStartDateChange={(iso) => {
            setStartDateIso(iso);
            setSampleIndex(0);
          }}
          mode={mode}
        />
      </div>
    </div>
  );
}
