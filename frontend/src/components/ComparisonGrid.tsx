import { useMemo, useState } from "react";
import { buildExternalPortalLinks } from "../services/apiClient";
import type {
  CuratedSite,
  HorizonProfile,
  LunarCoordinate,
  SiteSummaryMetrics,
  SolarEnergySummary,
  VisibilitySample,
  VisibilityTimeSeries,
} from "../types/contracts";
import { EventCountdown } from "./EventCountdown";
import type { AppMode } from "./HeaderHUD";

export interface ComparisonGridProps {
  curatedSites: CuratedSite[];
  selectedSites: LunarCoordinate[];
  focusedIndex: number;
  onFocusIndex: (idx: number) => void;
  onToggleCuratedSite: (site: CuratedSite) => void;
  onRemoveSite: (idx: number) => void;
  onClearAllSites: () => void;
  onAddCustomCoordinate: (lat_deg: number, lon_deg: number) => void;
  onChangeSiteHeight?: (index: number, newHeight_m: number) => void;
  metricsByKey: Record<string, SiteSummaryMetrics>;
  solarEnergyByKey?: Record<string, SolarEnergySummary>;
  seriesByKey?: Record<string, VisibilityTimeSeries>;
  horizonByKey?: Record<string, HorizonProfile>;
  currentSampleByKey: Record<string, VisibilitySample | undefined>;
  windowDays: number;
  startDateIso?: string;
  mode: AppMode;
}

export function coordinateKey(coord: LunarCoordinate): string {
  return coord.site_id ?? `custom_${coord.lat_deg.toFixed(4)}_${coord.lon_deg.toFixed(4)}`;
}

export function azimuthToCardinal(deg: number): string {
  const normalized = ((deg % 360) + 360) % 360;
  const directions = [
    "N", "NNE", "NE", "ENE",
    "E", "ESE", "SE", "SSE",
    "S", "SSW", "SW", "WSW",
    "W", "WNW", "NW", "NNW",
  ];
  const index = Math.round(normalized / 22.5) % 16;
  return directions[index] ?? "N";
}

export function polarToSvg(deg: number, radius: number, cx = 110, cy = 110): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180;
  return {
    x: Number((cx + radius * Math.sin(rad)).toFixed(2)),
    y: Number((cy - radius * Math.cos(rad)).toFixed(2)),
  };
}

export function angularDifference(az1: number, az2: number): number {
  let diff = Math.abs(az1 - az2) % 360;
  if (diff > 180) diff = 360 - diff;
  return diff;
}

export interface ShadowSector {
  startDeg: number;
  endDeg: number;
}

export function computeShadowSectors(
  samples?: VisibilitySample[],
  horizonProfile?: HorizonProfile | null,
): ShadowSector[] {
  const isBlocked = new Array<boolean>(360).fill(false);

  // 1. Acimuts donde el Sol estuvo oculto tras el relieve o con holgura <= 0 en los datos orbitales
  if (samples && samples.length > 0) {
    for (const s of samples) {
      if (s.sun.state === "occulted" || s.sun.clearance_deg <= 0 || s.sun.visible_fraction < 0.05) {
        const az = Math.round(((s.sun.azimuth_deg % 360) + 360) % 360);
        for (let offset = -2; offset <= 2; offset++) {
          const idx = (az + offset + 360) % 360;
          isBlocked[idx] = true;
        }
      }
    }
  }

  // 2. Si hay perfil de horizonte LOLA, marcar acimuts donde el horizonte supera la elevacion solar maxima
  if (horizonProfile && horizonProfile.azimuths_deg && horizonProfile.azimuths_deg.length > 0) {
    const maxSunEl =
      samples && samples.length > 0
        ? Math.max(...samples.map((s) => s.sun.elevation_deg))
        : 1.5;

    for (let i = 0; i < horizonProfile.azimuths_deg.length; i++) {
      const az = horizonProfile.azimuths_deg[i];
      const el = horizonProfile.horizon_elevation_deg[i];
      if (az !== undefined && el !== undefined && el > Math.max(0.0, maxSunEl)) {
        const azInt = Math.round(((az % 360) + 360) % 360);
        isBlocked[azInt] = true;
      }
    }
  }

  // Agrupar en sectores angulares contiguos
  const sectors: ShadowSector[] = [];
  let inSector = false;
  let start = 0;

  for (let deg = 0; deg < 360; deg++) {
    if (isBlocked[deg] && !inSector) {
      inSector = true;
      start = deg;
    } else if (!isBlocked[deg] && inSector) {
      inSector = false;
      sectors.push({ startDeg: start, endDeg: deg - 1 });
    }
  }
  if (inSector) {
    sectors.push({ startDeg: start, endDeg: 359 });
  }

  return sectors;
}

interface SolarAzimuthCompassProps {
  panelAzimuthDeg: number;
  optimalAzimuthDeg: number;
  sunAzimuthDeg: number | null;
  earthAzimuthDeg: number | null;
  horizonProfile?: HorizonProfile | null | undefined;
  samples?: VisibilitySample[] | undefined;
  isTotalShadow?: boolean | undefined;
}

export function SolarAzimuthCompass({
  panelAzimuthDeg,
  optimalAzimuthDeg,
  sunAzimuthDeg,
  earthAzimuthDeg,
  horizonProfile,
  samples,
  isTotalShadow,
}: SolarAzimuthCompassProps) {
  const cx = 110;
  const cy = 110;
  const rCompass = 80;

  // Sectores de sombra topografica (montanas bloqueando el Sol)
  const shadowSectors = computeShadowSectors(samples, horizonProfile);

  // Flecha vector normal (dirección del panel)
  const arrowTip = polarToSvg(panelAzimuthDeg, 52, cx, cy);
  const arrowBase = polarToSvg(panelAzimuthDeg, 44, cx, cy);
  const arrowWing1 = polarToSvg(panelAzimuthDeg - 14, 42, cx, cy);
  const arrowWing2 = polarToSvg(panelAzimuthDeg + 14, 42, cx, cy);

  // Barra del panel solar (perpendicular a la normal)
  const barLeft = polarToSvg(panelAzimuthDeg - 90, 24, cx, cy);
  const barRight = polarToSvg(panelAzimuthDeg + 90, 24, cx, cy);

  // Cono de captación frontal (±90° respecto a la normal)
  const coneRadius = 40;
  const coneLeft = polarToSvg(panelAzimuthDeg - 90, coneRadius, cx, cy);
  const coneRight = polarToSvg(panelAzimuthDeg + 90, coneRadius, cx, cy);
  const conePath = `M ${cx} ${cy} L ${coneLeft.x} ${coneLeft.y} A ${coneRadius} ${coneRadius} 0 0 1 ${coneRight.x} ${coneRight.y} Z`;

  // Arco visual desde 0° Norte hasta el acimut del panel (sentido horario)
  const rArc = 58;
  const arcEnd = polarToSvg(panelAzimuthDeg, rArc, cx, cy);
  const largeArcFlag = panelAzimuthDeg > 180 ? 1 : 0;
  const hasArc = panelAzimuthDeg >= 1 && panelAzimuthDeg <= 359;
  const arcPath = `M ${cx} ${cy - rArc} A ${rArc} ${rArc} 0 ${largeArcFlag} 1 ${arcEnd.x} ${arcEnd.y}`;

  // Posiciones de cuerpos celestes
  const sunPos = sunAzimuthDeg !== null ? polarToSvg(sunAzimuthDeg, rCompass, cx, cy) : null;
  const earthPos = earthAzimuthDeg !== null ? polarToSvg(earthAzimuthDeg, rCompass, cx, cy) : null;
  const optimalPos = polarToSvg(optimalAzimuthDeg, rCompass, cx, cy);

  const isSunInCone = sunAzimuthDeg !== null ? angularDifference(panelAzimuthDeg, sunAzimuthDeg) <= 90 : false;

  // 12 marcas de graduación cada 30°
  const ticks = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((t) => {
    const isCardinal = t % 90 === 0;
    const pInner = polarToSvg(t, isCardinal ? 71 : 75, cx, cy);
    const pOuter = polarToSvg(t, rCompass, cx, cy);
    return { t, pInner, pOuter, isCardinal };
  });

  return (
    <div className="solar-compass-box">
      <svg
        viewBox="0 0 220 220"
        className="solar-compass-svg"
        role="img"
        aria-label={`Brújula solar lunar: panel a ${panelAzimuthDeg}°, óptimo a ${optimalAzimuthDeg}°`}
      >
        <defs>
          <radialGradient id="compassBg" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#0F172A" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#0B0F19" stopOpacity="1" />
          </radialGradient>
          <radialGradient id="coneGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#F59E0B" stopOpacity="0.06" />
          </radialGradient>
        </defs>

        {/* Círculo base de la brújula */}
        <circle cx={cx} cy={cy} r={rCompass} fill="url(#compassBg)" stroke="rgba(255, 255, 255, 0.14)" strokeWidth="1.5" />
        <circle cx={cx} cy={cy} r={rCompass - 18} fill="none" stroke="rgba(255, 255, 255, 0.05)" strokeDasharray="2,2" />

        {/* Sectores de sombra topográfica (montañas bloqueando el Sol) */}
        {shadowSectors.map((sec, idx) => {
          const span = ((sec.endDeg - sec.startDeg + 360) % 360) + 1;
          if (span <= 0) return null;
          const rIn = 66;
          const rOut = rCompass - 1; // 79

          if (span >= 359) {
            return (
              <path
                key={`shadow-full-${idx}`}
                d={`M ${cx} ${cy - rOut} A ${rOut} ${rOut} 0 1 1 ${cx} ${cy + rOut} A ${rOut} ${rOut} 0 1 1 ${cx} ${cy - rOut} M ${cx} ${cy - rIn} A ${rIn} ${rIn} 0 1 0 ${cx} ${cy + rIn} A ${rIn} ${rIn} 0 1 0 ${cx} ${cy - rIn} Z`}
                fill="rgba(15, 23, 42, 0.92)"
                stroke="rgba(239, 68, 68, 0.6)"
                strokeWidth="1"
              >
                <title>Sombra topográfica total: montañas bloquean los 360° de acimut</title>
              </path>
            );
          }

          const p1 = polarToSvg(sec.startDeg, rOut, cx, cy);
          const p2 = polarToSvg(sec.endDeg, rOut, cx, cy);
          const p3 = polarToSvg(sec.endDeg, rIn, cx, cy);
          const p4 = polarToSvg(sec.startDeg, rIn, cx, cy);
          const largeArc = span > 180 ? 1 : 0;

          const pathD = `M ${p1.x} ${p1.y} A ${rOut} ${rOut} 0 ${largeArc} 1 ${p2.x} ${p2.y} L ${p3.x} ${p3.y} A ${rIn} ${rIn} 0 ${largeArc} 0 ${p4.x} ${p4.y} Z`;

          return (
            <path
              key={`shadow-${idx}`}
              d={pathD}
              fill="rgba(15, 23, 42, 0.9)"
              stroke="rgba(239, 68, 68, 0.6)"
              strokeWidth="1"
            >
              <title>{`Sombra topográfica: montañas bloquean el Sol entre ${sec.startDeg}° y ${sec.endDeg}°`}</title>
            </path>
          );
        })}

        {/* Ejes Norte-Sur y Este-Oeste */}
        <line x1={cx} y1={cy - rCompass} x2={cx} y2={cy + rCompass} stroke="rgba(255, 255, 255, 0.08)" strokeDasharray="2,2" />
        <line x1={cx - rCompass} y1={cy} x2={cx + rCompass} y2={cy} stroke="rgba(255, 255, 255, 0.08)" strokeDasharray="2,2" />

        {/* Marcas horarias cada 30° */}
        {ticks.map(({ t, pInner, pOuter, isCardinal }) => (
          <line
            key={t}
            x1={pInner.x}
            y1={pInner.y}
            x2={pOuter.x}
            y2={pOuter.y}
            stroke={isCardinal ? "rgba(255, 255, 255, 0.55)" : "rgba(255, 255, 255, 0.2)"}
            strokeWidth={isCardinal ? 1.5 : 1}
          />
        ))}

        {/* Textos de referencia cardinal */}
        <text x={cx} y={15} textAnchor="middle" fontSize="10" fontWeight="bold" fill="#F87171">
          0° N
        </text>
        <text x={207} y={113} textAnchor="start" fontSize="9" fontWeight="600" fill="#94A3B8">
          90° E
        </text>
        <text x={cx} y={214} textAnchor="middle" fontSize="9" fontWeight="600" fill="#94A3B8">
          180° S
        </text>
        <text x={13} y={113} textAnchor="end" fontSize="9" fontWeight="600" fill="#94A3B8">
          270° O
        </text>

        {/* Arco visual desde 0° Norte hasta el acimut del panel */}
        {hasArc && (
          <path
            d={arcPath}
            fill="none"
            stroke="rgba(245, 158, 11, 0.75)"
            strokeWidth="2.5"
            strokeDasharray="3,2"
          />
        )}

        {/* Semicírculo/cono de captación frontal del panel (±90°) */}
        <path d={conePath} fill="url(#coneGlow)" stroke="rgba(245, 158, 11, 0.6)" strokeWidth="1" />

        {/* Rayo hacia el Sol (si hay muestra temporal) */}
        {sunPos && (
          <line
            x1={cx}
            y1={cy}
            x2={sunPos.x}
            y2={sunPos.y}
            stroke={isSunInCone ? "rgba(251, 191, 36, 0.6)" : "rgba(148, 163, 184, 0.25)"}
            strokeDasharray="2,2"
            strokeWidth={isSunInCone ? 1.5 : 1}
          />
        )}

        {/* Dibujo del panel solar (barra) */}
        <line
          x1={barLeft.x}
          y1={barLeft.y}
          x2={barRight.x}
          y2={barRight.y}
          stroke="#38BDF8"
          strokeWidth="4"
          strokeLinecap="round"
        />

        {/* Flecha vector normal (mira hacia el acimut del panel) */}
        <line
          x1={cx}
          y1={cy}
          x2={arrowBase.x}
          y2={arrowBase.y}
          stroke="#FBBF24"
          strokeWidth="2.5"
        />
        <polygon
          points={`${arrowTip.x},${arrowTip.y} ${arrowWing1.x},${arrowWing1.y} ${arrowWing2.x},${arrowWing2.y}`}
          fill="#FBBF24"
        />

        {/* Eje central */}
        <circle cx={cx} cy={cy} r="3" fill="#E2E8F0" />

        {/* Marcador Acimut Óptimo 🎯 */}
        <g transform={`translate(${optimalPos.x}, ${optimalPos.y})`}>
          <circle r="7.5" fill="#059669" stroke="#34D399" strokeWidth="1.5" />
          <text textAnchor="middle" dy="3" fontSize="8" fill="#FFF" pointerEvents="none">
            🎯
          </text>
        </g>

        {/* Marcador de la Tierra 🜨 */}
        {earthPos && (
          <g transform={`translate(${earthPos.x}, ${earthPos.y})`}>
            <circle r="7.5" fill="#0284C7" stroke="#38BDF8" strokeWidth="1.5" />
            <text textAnchor="middle" dy="3" fontSize="8" fill="#FFF" pointerEvents="none">
              🜨
            </text>
          </g>
        )}

        {/* Marcador del Sol ☀️ */}
        {sunPos && (
          <g transform={`translate(${sunPos.x}, ${sunPos.y})`}>
            <circle
              r="8.5"
              fill="#F59E0B"
              stroke="#FEF08A"
              strokeWidth="1.5"
              style={{ filter: "drop-shadow(0 0 4px rgba(245, 158, 11, 0.8))" }}
            />
            <text textAnchor="middle" dy="3.5" fontSize="9" fill="#000" pointerEvents="none">
              ☀
            </text>
          </g>
        )}

        {/* Aviso de sombra total sobre la brújula si aplica */}
        {isTotalShadow && (
          <g transform={`translate(${cx}, ${cy})`}>
            <rect x="-82" y="-13" width="164" height="26" rx="5" fill="rgba(15, 23, 42, 0.95)" stroke="rgba(239, 68, 68, 0.75)" strokeWidth="1.5" />
            <text textAnchor="middle" dy="4" fontSize="9" fontWeight="bold" fill="#F87171">
              🌑 En sombra topográfica total
            </text>
          </g>
        )}
      </svg>

      {/* Píldoras con acimuts exactos */}
      <div className="solar-compass-pills">
        <span className="solar-compass-pill" style={{ borderColor: "rgba(245, 158, 11, 0.4)" }}>
          📐 Panel: <strong>{panelAzimuthDeg}°</strong>
        </span>
        <span className="solar-compass-pill" style={{ borderColor: "rgba(16, 185, 129, 0.4)" }}>
          🎯 Óptimo: <strong>{optimalAzimuthDeg}°</strong>
        </span>
        {sunAzimuthDeg !== null && (
          <span
            className="solar-compass-pill"
            style={{
              borderColor: isSunInCone ? "rgba(251, 191, 36, 0.5)" : "rgba(148, 163, 184, 0.3)",
              color: isSunInCone ? "var(--solar-amber-bright)" : "var(--text-muted)",
            }}
          >
            ☀ Sol: <strong>{sunAzimuthDeg.toFixed(1)}°</strong>
            {isSunInCone ? " (capta)" : " (espalda)"}
          </span>
        )}
        {earthAzimuthDeg !== null && (
          <span className="solar-compass-pill" style={{ borderColor: "rgba(6, 182, 212, 0.4)" }}>
            🜨 Tierra: <strong>{earthAzimuthDeg.toFixed(1)}°</strong>
          </span>
        )}
        {shadowSectors.length > 0 && (
          <span className="solar-compass-pill" style={{ borderColor: "rgba(239, 68, 68, 0.45)", color: "#FCA5A5" }}>
            ⛰ Sombra ({shadowSectors.reduce((acc, s) => acc + (((s.endDeg - s.startDeg + 360) % 360) + 1), 0)}° bloqueados)
          </span>
        )}
      </div>

      {/* Leyenda explicativa oficial */}
      <p className="solar-compass-legend">
        0° = Norte Lunar (sentido horario: 90° E, 180° S, 270° O). El panel capta energía cuando su flecha mira hacia el Sol.
      </p>
    </div>
  );
}

/* ---------------- Perfiles de Misión y Ranking de Viabilidad (RF-02, RF-05) ---------------- */
export type MissionProfileId = "balanced" | "energy" | "comms";

export interface MissionProfileConfig {
  id: MissionProfileId;
  name: string;
  shortDesc: string;
  weights: {
    solar: number;
    dte: number;
    thermal: number;
  };
}

export const MISSION_PROFILES: Record<MissionProfileId, MissionProfileConfig> = {
  balanced: {
    id: "balanced",
    name: "Equilibrado (Artemis)",
    shortDesc: "40% Energía Solar · 35% DTE · 25% Supervivencia Térmica",
    weights: { solar: 0.40, dte: 0.35, thermal: 0.25 },
  },
  energy: {
    id: "energy",
    name: "Prioridad Energía / ISRU",
    shortDesc: "60% Energía Solar · 20% DTE · 20% Supervivencia Térmica",
    weights: { solar: 0.60, dte: 0.20, thermal: 0.20 },
  },
  comms: {
    id: "comms",
    name: "Prioridad Telecomunicaciones",
    shortDesc: "20% Energía Solar · 60% DTE · 20% Supervivencia Térmica",
    weights: { solar: 0.20, dte: 0.60, thermal: 0.20 },
  },
};

export interface ViabilityAssessment {
  score: number;
  solarScore: number;
  dteScore: number;
  thermalScore: number;
  isWinner: boolean;
  rank: number;
  verdictSummary: string;
}

export function computeViabilityAssessments(
  sites: { coord: LunarCoordinate; key: string }[],
  metricsByKey: Record<string, SiteSummaryMetrics | undefined>,
  solarEnergyByKey: Record<string, SolarEnergySummary | undefined> | undefined,
  profileId: MissionProfileId,
): Record<string, ViabilityAssessment> {
  const profile = MISSION_PROFILES[profileId];
  const { solar: wSolar, dte: wDte, thermal: wThermal } = profile.weights;

  // Normalizacion de energia de panel fijo entre sitios activos
  let maxOptimalEnergy = 0;
  for (const s of sites) {
    const sol = solarEnergyByKey?.[s.key];
    const energy = sol?.optimal_azimuth.optimal_fixed_energy_kwh_m2 ?? 0;
    if (energy > maxOptimalEnergy) maxOptimalEnergy = energy;
  }

  const rawScores: { key: string; score: number; solarScore: number; dteScore: number; thermalScore: number }[] = [];

  for (const s of sites) {
    const m = metricsByKey[s.key];
    const sol = solarEnergyByKey?.[s.key];

    // 1. Componente Solar (0..100)
    let solarScore = 0;
    if (sol && sol.optimal_azimuth.optimal_fixed_energy_kwh_m2 > 0) {
      if (maxOptimalEnergy > 0) {
        solarScore = (sol.optimal_azimuth.optimal_fixed_energy_kwh_m2 / maxOptimalEnergy) * 100;
      }
    } else if (m) {
      solarScore = m.sunlit_fraction * 100;
    }
    solarScore = Math.max(0, Math.min(100, solarScore));

    // 2. Componente DTE (0..100)
    let dteScore = 0;
    if (m) {
      dteScore = m.dte_fraction * 100;
      if (profileId === "comms" && m.advanced_dte) {
        if (m.advanced_dte.min_clearance_deg > 0) {
          dteScore = Math.min(100, dteScore * 1.05);
        } else if (m.advanced_dte.max_clearance_deg < 0) {
          dteScore = 0;
        }
      }
    }
    dteScore = Math.max(0, Math.min(100, dteScore));

    // 3. Componente Supervivencia Térmica (0..100) - Noche continua ecuatorial ~354 horas
    let thermalScore = 100;
    if (m) {
      const maxNight = m.longest_darkness_hours;
      thermalScore = Math.max(0, Math.min(100, 100 * (1 - maxNight / 354.0)));
    }

    const totalScore = Math.round((wSolar * solarScore + wDte * dteScore + wThermal * thermalScore) * 10) / 10;
    rawScores.push({ key: s.key, score: totalScore, solarScore, dteScore, thermalScore });
  }

  const sorted = [...rawScores].sort((a, b) => b.score - a.score);

  const results: Record<string, ViabilityAssessment> = {};
  sorted.forEach((item, idx) => {
    const isWinner = idx === 0 && item.score > 0;
    const rank = idx + 1;

    let verdictSummary = "";
    if (isWinner) {
      if (profileId === "energy") {
        verdictSummary = `Máxima captación solar (${item.solarScore.toFixed(0)}% ref.) y alta radiación útil.`;
      } else if (profileId === "comms") {
        verdictSummary = `Líder en conectividad directa con la Tierra (${item.dteScore.toFixed(0)}% enlace continuo).`;
      } else {
        verdictSummary = `Mejor balance integral entre radiación solar, enlace DTE y supervivencia térmica.`;
      }
    } else {
      if (item.score < 25) {
        verdictSummary = `Baja viabilidad: limitación crítica en ${item.dteScore < 10 ? "enlace DTE" : "iluminación solar"}.`;
      } else {
        verdictSummary = `Alternativa secundaria #${rank} (${item.score.toFixed(1)} pts).`;
      }
    }

    results[item.key] = {
      score: item.score,
      solarScore: Math.round(item.solarScore),
      dteScore: Math.round(item.dteScore),
      thermalScore: Math.round(item.thermalScore),
      isWinner,
      rank,
      verdictSummary,
    };
  });

  return results;
}

export function exportCsvReport(
  selectedSites: LunarCoordinate[],
  curatedSites: CuratedSite[],
  metricsByKey: Record<string, SiteSummaryMetrics>,
  solarEnergyByKey: Record<string, SolarEnergySummary | undefined> | undefined,
  assessments: Record<string, ViabilityAssessment>,
  profile: MissionProfileConfig,
  windowDays: number,
  startDateIso?: string,
) {
  const epoch = startDateIso ?? "2027-01-01T00:00:00Z";
  const headers = [
    "Sitio / Coordenada",
    "Tipo",
    "Latitud (deg)",
    "Longitud (deg)",
    "Altura Mastil h0 (m)",
    "Inicio Mision T0 (UTC)",
    "Ventana (dias)",
    "Puntuacion Viabilidad (0-100)",
    "Ranking",
    "Veredicto",
    "Acimut Optimo Panel (deg)",
    "Rumbo Cardinal Optimo",
    "Energia Panel Vertical Fijo (kWh/m2)",
    "Energia Panel Tracking 360 (kWh/m2)",
    "Energia Panel Suelo Horizontal (kWh/m2)",
    "Iluminacion Solar (%)",
    "Enlace Directo Tierra DTE (%)",
    "Ventana Dorada Sol+DTE (%)",
    "Ventana Dorada (horas netas)",
    "Blackout DTE Maximo Continuo (horas)",
    "Noche Continua Maxima (horas)",
    "Margen Topografico Clearance Actual (deg)",
    "Holgura Minima (deg)",
    "Holgura Maxima (deg)",
    "Distancia Tierra (km)",
    "Latencia Ida OWLT (s)",
    "Latencia RTT (s)",
    "FSPL Banda S 2.2GHz (dB)",
    "FSPL Banda X 8.4GHz (dB)",
    "FSPL Banda Ka 32GHz (dB)",
  ];

  const rows: string[][] = [headers];

  for (const coord of selectedSites) {
    const key = coordinateKey(coord);
    const curated = curatedSites.find((s) => s.id === coord.site_id);
    const m = metricsByKey[key];
    const sol = solarEnergyByKey?.[key];
    const dte = m?.advanced_dte;
    const ass = assessments[key];

    const name = curated ? curated.name : `Coord (${coord.lat_deg.toFixed(4)}, ${coord.lon_deg.toFixed(4)})`;
    const type = curated ? curated.category : "personalizada";
    const optAz = sol ? Math.round(sol.optimal_azimuth.optimal_panel_azimuth_deg) : "";
    const optCard = sol ? azimuthToCardinal(Number(optAz)) : "";

    rows.push([
      `"${name.replace(/"/g, '""')}"`,
      type,
      coord.lat_deg.toFixed(4),
      coord.lon_deg.toFixed(4),
      coord.observer_height_m.toFixed(1),
      epoch,
      windowDays.toString(),
      ass ? ass.score.toFixed(1) : "",
      ass ? `#${ass.rank}` : "",
      ass ? `"${ass.verdictSummary.replace(/"/g, '""')}"` : "",
      optAz.toString(),
      optCard,
      sol ? sol.optimal_azimuth.optimal_fixed_energy_kwh_m2.toFixed(2) : "",
      sol ? sol.tracking_vertical_panel.total_energy_kwh_m2.toFixed(2) : "",
      sol ? sol.horizontal_panel.total_energy_kwh_m2.toFixed(2) : "",
      m ? (m.sunlit_fraction * 100).toFixed(1) : "",
      m ? (m.dte_fraction * 100).toFixed(1) : "",
      m ? (m.sun_and_dte_fraction * 100).toFixed(1) : "",
      dte ? dte.simultaneous_sun_earth_hours.toFixed(1) : "",
      dte ? dte.longest_comms_blackout_hours.toFixed(1) : "",
      m ? m.longest_darkness_hours.toFixed(1) : "",
      dte ? dte.terrain_clearance_deg.toFixed(2) : "",
      dte ? dte.min_clearance_deg.toFixed(2) : "",
      dte ? dte.max_clearance_deg.toFixed(2) : "",
      dte ? dte.earth_distance_km.toFixed(0) : "",
      dte ? dte.one_way_light_time_s.toFixed(3) : "",
      dte ? dte.round_trip_time_s.toFixed(3) : "",
      dte ? dte.fspl_s_band_db.toFixed(1) : "",
      dte ? dte.fspl_x_band_db.toFixed(1) : "",
      dte ? dte.fspl_ka_band_db.toFixed(1) : "",
    ]);
  }

  const csvContent = "\uFEFF" + rows.map((r) => r.join(",")).join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const datePrefix = startDateIso ? startDateIso.slice(0, 10) + "_" : "";
  a.download = `lunar_mission_${datePrefix}${windowDays}d_${profile.id}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportPrintReport(
  selectedSites: LunarCoordinate[],
  curatedSites: CuratedSite[],
  metricsByKey: Record<string, SiteSummaryMetrics>,
  solarEnergyByKey: Record<string, SolarEnergySummary | undefined> | undefined,
  assessments: Record<string, ViabilityAssessment>,
  profile: MissionProfileConfig,
  windowDays: number,
  startDateIso?: string,
) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("Por favor permite las ventanas emergentes (pop-ups) en tu navegador para ver la Ficha Técnica imprimible.");
    return;
  }

  const nowUtc = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";

  let winnerCoord: LunarCoordinate | null = null;
  let winnerAss: ViabilityAssessment | null = null;
  for (const c of selectedSites) {
    const k = coordinateKey(c);
    if (assessments[k]?.isWinner) {
      winnerCoord = c;
      winnerAss = assessments[k];
      break;
    }
  }
  const winnerCurated = winnerCoord ? curatedSites.find((s) => s.id === winnerCoord?.site_id) : null;
  const winnerName = winnerCurated
    ? winnerCurated.name
    : winnerCoord
      ? `Coord (${winnerCoord.lat_deg.toFixed(2)}°, ${winnerCoord.lon_deg.toFixed(2)}°)`
      : "N/A";

  const rowsHtml = selectedSites
    .map((coord) => {
      const key = coordinateKey(coord);
      const curated = curatedSites.find((s) => s.id === coord.site_id);
      const m = metricsByKey[key];
      const sol = solarEnergyByKey?.[key];
      const dte = m?.advanced_dte;
      const ass = assessments[key];
      const isWin = ass?.isWinner;
      const name = curated ? curated.name : `Coord (${coord.lat_deg.toFixed(2)}°, ${coord.lon_deg.toFixed(2)}°)`;
      const optAz = sol
        ? `${Math.round(sol.optimal_azimuth.optimal_panel_azimuth_deg)}° ${azimuthToCardinal(sol.optimal_azimuth.optimal_panel_azimuth_deg)}`
        : "—";

      return `
        <tr class="${isWin ? "winner-row" : ""}">
          <td><strong>${isWin ? "🏆 " : `#${ass?.rank ?? "-"} `}${name}</strong></td>
          <td>${coord.lat_deg.toFixed(3)}°, ${coord.lon_deg.toFixed(3)}°</td>
          <td>h₀=${coord.observer_height_m.toFixed(1)}m</td>
          <td><span class="score-pill">${ass ? ass.score.toFixed(1) : "—"} pts</span></td>
          <td>${optAz}</td>
          <td>${sol ? sol.optimal_azimuth.optimal_fixed_energy_kwh_m2.toFixed(1) : "—"} kWh/m²</td>
          <td>${sol ? sol.tracking_vertical_panel.total_energy_kwh_m2.toFixed(1) : "—"} kWh/m²</td>
          <td>${m ? (m.sunlit_fraction * 100).toFixed(1) : "—"}%</td>
          <td>${m ? (m.dte_fraction * 100).toFixed(1) : "—"}%</td>
          <td>${dte ? `${dte.simultaneous_sun_earth_hours.toFixed(1)} h` : "—"}</td>
          <td>${dte ? `${dte.terrain_clearance_deg >= 0 ? "+" : ""}${dte.terrain_clearance_deg.toFixed(2)}°` : "—"}</td>
          <td>${dte ? `${dte.round_trip_time_s.toFixed(2)}s` : "—"}</td>
          <td>${dte ? `${dte.fspl_x_band_db.toFixed(1)} dB / ${dte.fspl_ka_band_db.toFixed(1)} dB` : "—"}</td>
        </tr>
      `;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Lunar Landing Site Navigator — Ficha Técnica de Misión</title>
  <style>
    @page { size: A4 landscape; margin: 10mm; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #0F172A;
      background: #FFFFFF;
      margin: 0;
      padding: 18px;
      font-size: 11px;
      line-height: 1.35;
    }
    .print-bar { display: flex; justify-content: flex-end; margin-bottom: 12px; gap: 8px; }
    .print-btn {
      background: #0B3D91; color: #FFFFFF; border: none; border-radius: 4px;
      padding: 6px 14px; font-weight: 600; cursor: pointer; font-size: 12px;
    }
    .header { border-bottom: 2px solid #0B3D91; padding-bottom: 8px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: flex-end; }
    .title-block h1 { margin: 0; font-size: 18px; color: #0B3D91; }
    .title-block p { margin: 2px 0 0 0; font-size: 11px; color: #475569; }
    .meta-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 6px; padding: 8px 12px; margin-bottom: 12px; }
    .meta-item { display: flex; flex-direction: column; gap: 1px; }
    .meta-lbl { font-size: 9px; text-transform: uppercase; color: #64748B; font-weight: 600; }
    .meta-val { font-size: 11px; font-weight: 700; color: #0F172A; }
    .winner-box {
      background: #FFFBEB; border: 1px solid #F59E0B; border-radius: 6px; padding: 10px 14px; margin-bottom: 14px;
      display: flex; justify-content: space-between; align-items: center;
    }
    .winner-info h3 { margin: 0; font-size: 14px; color: #92400E; display: flex; align-items: center; gap: 6px; }
    .winner-info p { margin: 3px 0 0 0; font-size: 11px; color: #78350F; }
    .winner-score { font-size: 20px; font-weight: 800; color: #B45309; font-family: monospace; }
    table { width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 14px; }
    th { background: #1E293B; color: #FFFFFF; padding: 6px 7px; text-align: left; font-weight: 600; border: 1px solid #334155; font-size: 9.5px; }
    td { padding: 6px 7px; border: 1px solid #E2E8F0; vertical-align: middle; }
    tr:nth-child(even) { background: #F8FAFC; }
    .winner-row { background: #FEF3C7 !important; font-weight: 600; }
    .score-pill { font-family: monospace; font-weight: 700; color: #0B3D91; }
    .footer { border-top: 1px solid #E2E8F0; padding-top: 8px; font-size: 9px; color: #64748B; display: flex; justify-content: space-between; }
    @media print {
      .print-bar { display: none; }
      body { padding: 0; }
    }
  </style>
</head>
<body>
  <div class="print-bar">
    <button class="print-btn" onclick="window.print()">🖨️ Imprimir / Guardar como PDF</button>
  </div>
  <div class="header">
    <div class="title-block">
      <h1>LUNAR LANDING SITE NAVIGATOR</h1>
      <p>NASA Space Apps Challenge 2026 · Informe Ejecutivo de Comparación de Sitios Lunares</p>
    </div>
    <div style="text-align: right; font-size: 10px; color: #64748B;">
      <div><strong>Sello Científico:</strong> VAL-20261114-02</div>
      <div>Efemérides JPL DE421 · Aireless lunar</div>
    </div>
  </div>

  <div class="meta-grid">
    <div class="meta-item">
      <span class="meta-lbl">Fecha Emisión</span>
      <span class="meta-val">${nowUtc}</span>
    </div>
    <div class="meta-item">
      <span class="meta-lbl">Inicio Misión T₀ (UTC)</span>
      <span class="meta-val">${startDateIso ?? "2027-01-01T00:00:00Z"}</span>
    </div>
    <div class="meta-item">
      <span class="meta-lbl">Ventana de Simulación</span>
      <span class="meta-val">${windowDays} días</span>
    </div>
    <div class="meta-item">
      <span class="meta-lbl">Perfil de Misión</span>
      <span class="meta-val">${profile.name}</span>
    </div>
    <div class="meta-item">
      <span class="meta-lbl">Ponderación Criterios</span>
      <span class="meta-val">${profile.shortDesc}</span>
    </div>
  </div>

  ${
    winnerCoord && winnerAss
      ? `
  <div class="winner-box">
    <div class="winner-info">
      <h3>🏆 SITIO ÓPTIMO RECOMENDADO: ${winnerName}</h3>
      <p>${winnerAss.verdictSummary}</p>
    </div>
    <div class="winner-score">${winnerAss.score.toFixed(1)} / 100 pts</div>
  </div>`
      : ""
  }

  <table>
    <thead>
      <tr>
        <th>Sitio / Candidato</th>
        <th>Coord (Lat, Lon)</th>
        <th>Mástil</th>
        <th>Viabilidad</th>
        <th>Acimut Ópt. Panel</th>
        <th>Energía Fijo</th>
        <th>Tracking 360°</th>
        <th>Sol (%)</th>
        <th>DTE (%)</th>
        <th>Ventana Dorada</th>
        <th>Clearance</th>
        <th>Latencia RTT</th>
        <th>FSPL (X / Ka)</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <div class="footer">
    <span>Fuentes de datos: NASA LOLA DEM (LRO PDS) · NASA/JPL Horizons Ephemeris API (coord@301) · IAU MOON_ME Frame</span>
    <span>Página generada por Lunar Landing Site Navigator — Consola de Vuelo</span>
  </div>
</body>
</html>`;

  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 350);
}

export function ComparisonGrid({
  curatedSites,
  selectedSites,
  focusedIndex,
  onFocusIndex,
  onToggleCuratedSite,
  onRemoveSite,
  onClearAllSites,
  onAddCustomCoordinate,
  onChangeSiteHeight,
  metricsByKey,
  solarEnergyByKey,
  seriesByKey,
  horizonByKey,
  currentSampleByKey,
  windowDays,
  startDateIso,
  mode,
}: ComparisonGridProps) {
  const [customLat, setCustomLat] = useState<string>("-88.50");
  const [customLon, setCustomLon] = useState<string>("15.00");
  const [missionProfile, setMissionProfile] = useState<MissionProfileId>("balanced");
  const [sortBy, setSortBy] = useState<"default" | "viability" | "solar" | "dte" | "golden">("viability");
  const [manualAzimuths, setManualAzimuths] = useState<Record<string, number>>({});
  const [customHeights, setCustomHeights] = useState<Record<string, string>>({});

  const assessments = useMemo(() => {
    return computeViabilityAssessments(
      selectedSites.map((coord) => ({ coord, key: coordinateKey(coord) })),
      metricsByKey,
      solarEnergyByKey,
      missionProfile,
    );
  }, [selectedSites, metricsByKey, solarEnergyByKey, missionProfile]);

  const handleCommitHeight = (idx: number, coordKey: string, rawVal: string, fallbackH: number) => {
    const val = Number.parseFloat(rawVal);
    if (!Number.isNaN(val) && val >= 0.1 && val <= 100.0) {
      const rounded = Math.round(val * 10) / 10;
      onChangeSiteHeight?.(idx, rounded);
      setCustomHeights((prev) => ({ ...prev, [coordKey]: rounded.toString() }));
    } else {
      setCustomHeights((prev) => ({ ...prev, [coordKey]: fallbackH.toFixed(1) }));
    }
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const lat = Number.parseFloat(customLat);
    const lon = Number.parseFloat(customLon);
    if (Number.isNaN(lat) || Number.isNaN(lon)) return;
    const clampedLat = Math.max(-90, Math.min(90, lat));
    const clampedLon = Math.max(-180, Math.min(180, lon));
    onAddCustomCoordinate(clampedLat, clampedLon);
  };

  const indexedSites = selectedSites.map((coord, index) => ({
    coord,
    index,
    key: coordinateKey(coord),
    metrics: metricsByKey[coordinateKey(coord)],
    assessment: assessments[coordinateKey(coord)],
  }));

  if (sortBy !== "default") {
    indexedSites.sort((a, b) => {
      if (sortBy === "viability") {
        return (b.assessment?.score ?? 0) - (a.assessment?.score ?? 0);
      }
      const ma = a.metrics;
      const mb = b.metrics;
      if (!ma || !mb) return 0;
      if (sortBy === "solar") return mb.sunlit_fraction - ma.sunlit_fraction;
      if (sortBy === "dte") return mb.dte_fraction - ma.dte_fraction;
      return mb.sun_and_dte_fraction - ma.sun_and_dte_fraction;
    });
  }

  return (
    <section className="glass-panel comparison-panel" aria-label="Comparador lado a lado de sitios lunares">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">
            {mode === "edu"
              ? "Comparador de Sitios Lunares (Hasta 4 Escenarios Simultáneos)"
              : "Multi-Site Trade-Off Matrix (Side-by-Side Synchronized Telemetry)"}
          </h2>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          {selectedSites.length > 0 && (
            <button
              type="button"
              className="hud-btn-mini"
              style={{
                padding: "4px 9px",
                color: "var(--text-secondary)",
                borderColor: "rgba(224, 60, 49, 0.45)",
              }}
              onClick={onClearAllSites}
              title="Cerrar todos los sitios abiertos en el comparador"
            >
              ✕ Cerrar todos ({selectedSites.length})
            </button>
          )}

          {/* Selector de Perfil de Misión */}
          <div className="mission-profile-control">
            <label htmlFor="mission-profile-select" style={{ fontSize: "11px", color: "var(--text-muted)" }}>
              🎯 Perfil:
            </label>
            <select
              id="mission-profile-select"
              className="hud-select"
              value={missionProfile}
              onChange={(e) => setMissionProfile(e.target.value as MissionProfileId)}
              title={MISSION_PROFILES[missionProfile].shortDesc}
            >
              <option value="balanced">Equilibrado (Artemis)</option>
              <option value="energy">Prioridad Energía / ISRU</option>
              <option value="comms">Prioridad Telecomunicaciones</option>
            </select>
          </div>

          <label htmlFor="sort-metrics-select" style={{ fontSize: "11px", color: "var(--text-muted)" }}>
            Ordenar:
          </label>
          <select
            id="sort-metrics-select"
            className="hud-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "default" | "viability" | "solar" | "dte" | "golden")}
          >
            <option value="viability">🏆 Viabilidad (Ranking)</option>
            <option value="solar">Mayor Iluminación Solar (%)</option>
            <option value="dte">Mayor Visibilidad Tierra DTE (%)</option>
            <option value="golden">Mayor Ventana Dorada (Sol + DTE)</option>
            <option value="default">Orden de selección</option>
          </select>

          {/* Botones de Exportación (Exclusivos Modo Ingeniero) */}
          {mode === "eng" && selectedSites.length > 0 && (
            <div className="export-btn-group">
              <button
                type="button"
                className="hud-btn-export"
                onClick={() =>
                  exportCsvReport(
                    selectedSites,
                    curatedSites,
                    metricsByKey,
                    solarEnergyByKey,
                    assessments,
                    MISSION_PROFILES[missionProfile],
                    windowDays,
                    startDateIso,
                  )
                }
                title="Descargar informe completo en formato CSV (.csv)"
              >
                📊 Exportar CSV
              </button>
              <button
                type="button"
                className="hud-btn-export"
                onClick={() =>
                  exportPrintReport(
                    selectedSites,
                    curatedSites,
                    metricsByKey,
                    solarEnergyByKey,
                    assessments,
                    MISSION_PROFILES[missionProfile],
                    windowDays,
                    startDateIso,
                  )
                }
                title="Generar Ficha Técnica ejecutiva e imprimir / guardar como PDF"
              >
                📄 Ficha Técnica (PDF)
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Barra de seleccion de los 9 sitios curados + entrada de coordenadas personalizadas */}
      <div className="site-selector-bar">
        <div className="site-chips" role="group" aria-label="Catalogo de sitios curados">
          {curatedSites.map((site) => {
            const isSelected = selectedSites.some((s) => s.site_id === site.id);
            const isFocused = selectedSites[focusedIndex]?.site_id === site.id;
            return (
              <button
                key={site.id}
                type="button"
                className={`site-chip ${isSelected ? "selected" : ""} ${isFocused ? "focused" : ""}`}
                onClick={() => onToggleCuratedSite(site)}
                title={
                  isSelected
                    ? `Clic para quitar ${site.name} del comparador`
                    : `Añadir ${site.name} (${site.lat_deg}°, ${site.lon_deg}°)`
                }
              >
                {isSelected ? "✓ " : "+ "}
                {site.name.split("-")[0]?.split("(")[0]?.trim()}
                {isSelected ? " ✕" : ""}
              </button>
            );
          })}
        </div>

        {mode === "eng" && (
          <form onSubmit={handleCustomSubmit} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <input
              type="number"
              step="0.01"
              min="-90"
              max="90"
              className="hud-input mono-telemetry"
              style={{ width: "78px" }}
              value={customLat}
              onChange={(e) => setCustomLat(e.target.value)}
              aria-label="Latitud personalizada grados"
              placeholder="Lat °"
            />
            <input
              type="number"
              step="0.01"
              min="-180"
              max="180"
              className="hud-input mono-telemetry"
              style={{ width: "82px" }}
              value={customLon}
              onChange={(e) => setCustomLon(e.target.value)}
              aria-label="Longitud personalizada grados"
              placeholder="Lon °"
            />
            <button type="submit" className="hud-btn-mini" style={{ padding: "6px 10px" }}>
              Evaluar Coord.
            </button>
          </form>
        )}
      </div>

      {/* Tarjetas comparativas lado a lado (escritorio) / deslizables (movil) */}
      <div className="comparison-cards-grid">
        {indexedSites.length === 0 && (
          <div
            style={{
              gridColumn: "1 / -1",
              padding: "28px 18px",
              textAlign: "center",
              borderRadius: "10px",
              border: "1px dashed rgba(148, 163, 184, 0.25)",
              background: "rgba(15, 23, 42, 0.45)",
              color: "var(--text-secondary)",
              fontSize: "13px",
            }}
          >
            <strong>No hay ningún sitio abierto en el comparador.</strong>
            <p style={{ margin: "6px 0 0", color: "var(--text-muted)", fontSize: "12px" }}>
              {mode === "edu"
                ? "Haz clic en cualquiera de los chips superiores (+) o selecciona un hito en el Globo Lunar 3D para añadirlo a la comparativa."
                : "Haz clic en cualquiera de los chips superiores (+), introduce una coordenada lunar personalizada o selecciona un punto en el Globo Lunar 3D para añadirlo."}
            </p>
          </div>
        )}
        {indexedSites.map(({ coord, index, key, metrics, assessment }) => {
          const curated = curatedSites.find((c) => c.id === coord.site_id);
          const sample = currentSampleByKey[key];
          const solar = solarEnergyByKey?.[key];
          const isFocused = index === focusedIndex;
          const links = curated
            ? { quickmap_url: curated.quickmap_url, moontrek_url: curated.moontrek_url }
            : buildExternalPortalLinks(coord.lat_deg, coord.lon_deg);

          const sunPct = ((metrics?.sunlit_fraction ?? 0) * 100).toFixed(1);
          const dtePct = ((metrics?.dte_fraction ?? 0) * 100).toFixed(1);
          const goldenPct = ((metrics?.sun_and_dte_fraction ?? 0) * 100).toFixed(1);

          return (
            <article
              key={key}
              className={`site-card ${isFocused ? "focused" : ""}`}
              onClick={() => onFocusIndex(index)}
              aria-label={`Tarjeta comparativa de ${curated?.name ?? "Coordenada personalizada"}`}
            >
              {/* Veredicto y Ranking de Viabilidad de Misión (RF-02, RF-05) */}
              {assessment && (
                <div className={`viability-banner ${assessment.isWinner ? "winner" : "rank"}`}>
                  <div className="viability-badge-row">
                    <div className="viability-badge">
                      {assessment.isWinner ? (
                        <span>🏆 SITIO ÓPTIMO</span>
                      ) : (
                        <span>#{assessment.rank} Viabilidad</span>
                      )}
                    </div>
                    <span className="viability-score-num">{assessment.score.toFixed(1)} pts</span>
                  </div>
                  <p className="viability-reason">{assessment.verdictSummary}</p>
                  <div className="viability-pillars">
                    <span>☀ Sol: {assessment.solarScore}%</span>
                    <span>·</span>
                    <span>🜨 DTE: {assessment.dteScore}%</span>
                    <span>·</span>
                    <span>🛡 Térm: {assessment.thermalScore}%</span>
                  </div>
                </div>
              )}

              <div className="site-card-header">
                <div>
                  <h3 className="site-card-title">
                    {curated ? curated.name : `Sitio Personalizado (${coord.lat_deg.toFixed(2)}°)`}
                  </h3>
                  <div className="mono-telemetry" style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                    Lat {coord.lat_deg.toFixed(4)}° · Lon {coord.lon_deg.toFixed(4)}° · h₀={coord.observer_height_m.toFixed(1)}m
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span className="category-tag">
                    {curated ? curated.category.replace("_", " ") : "custom"}
                  </span>
                  <button
                    type="button"
                    className="hud-btn-mini"
                    style={{
                      padding: "2px 7px",
                      fontSize: "11px",
                      lineHeight: 1.2,
                      color: "var(--text-secondary)",
                      borderColor: "rgba(255, 255, 255, 0.16)",
                    }}
                    title="Quitar este sitio del comparador"
                    aria-label={`Quitar ${curated?.name ?? "sitio personalizado"} del comparador`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveSite(index);
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Selector interactivo de Altura de Mastil Solar (RF-05, RT-02) */}
              <div className="mast-height-selector-row" onClick={(e) => e.stopPropagation()}>
                <div className="mast-height-label">
                  <span>📡 Altura Mástil / Placas:</span>
                  <strong className="mono-telemetry" style={{ color: "#93C5FD" }}>
                    h₀ = {coord.observer_height_m.toFixed(1)} m
                  </strong>
                </div>

                {mode === "edu" ? (
                  /* Modo Educativo: 4 botones rapidos con presets de misiones reales */
                  <div className="mast-height-buttons" role="group" aria-label={`Altura de mástil para ${curated?.name ?? "sitio"}`}>
                    {[
                      { h: 0.5, name: "0.5 m", label: "LEAP" },
                      { h: 1.5, name: "1.5 m", label: "VIPER" },
                      { h: 3.5, name: "3.5 m", label: "CLPS" },
                      { h: 10.0, name: "10.0 m", label: "Artemis" },
                    ].map((opt) => {
                      const isActive = Math.abs(coord.observer_height_m - opt.h) < 0.1;
                      return (
                        <button
                          key={opt.h}
                          type="button"
                          className={`mast-height-btn ${isActive ? "active" : ""}`}
                          onClick={() => onChangeSiteHeight?.(index, opt.h)}
                          title={`Cambiar altura de placas solares a ${opt.h} m (${opt.label}) para superar sombras locales`}
                        >
                          <span>{opt.name}</span>
                          <span className="mast-sublabel">{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  /* Modo Ingeniero: Input numerico libre [0.1 m .. 100.0 m] con soporte para decimales */
                  <div className="mast-height-eng-box">
                    <div className="mast-height-input-row">
                      <input
                        type="number"
                        step="0.1"
                        min="0.1"
                        max="100.0"
                        className="mast-number-input"
                        value={customHeights[key] ?? coord.observer_height_m.toString()}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCustomHeights((prev) => ({ ...prev, [key]: val }));
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleCommitHeight(index, key, customHeights[key] ?? coord.observer_height_m.toString(), coord.observer_height_m);
                          }
                        }}
                        onBlur={() => {
                          handleCommitHeight(index, key, customHeights[key] ?? coord.observer_height_m.toString(), coord.observer_height_m);
                        }}
                        aria-label={`Altura personalizada en metros para ${curated?.name ?? "sitio"}`}
                        placeholder="Ej. 2.4"
                      />
                      <button
                        type="button"
                        className="hud-btn-mini"
                        style={{ padding: "4px 8px", borderColor: "var(--nasa-blue-accent)" }}
                        onClick={() => handleCommitHeight(index, key, customHeights[key] ?? coord.observer_height_m.toString(), coord.observer_height_m)}
                        title="Aplicar nueva altura de mástil"
                      >
                        Aplicar
                      </button>
                      <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                        (0.1 a 100.0 m)
                      </span>
                    </div>

                    <div className="mast-preset-chips" role="group" aria-label="Presets rápidos para ingenieros">
                      {[0.5, 1.5, 2.4, 3.5, 10.0, 15.0].map((presetH) => {
                        const isActive = Math.abs(coord.observer_height_m - presetH) < 0.05;
                        return (
                          <button
                            key={presetH}
                            type="button"
                            className={`mast-chip-btn ${isActive ? "active" : ""}`}
                            onClick={() => {
                              onChangeSiteHeight?.(index, presetH);
                              setCustomHeights((prev) => ({ ...prev, [key]: presetH.toString() }));
                            }}
                          >
                            {presetH.toFixed(1)}m
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Estado instantaneo en el cursor temporal */}
              {sample && (
                <div className="telemetry-Now-grid">
                  <div className="body-status-box sun-box">
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                      <strong>☀ Sol</strong>
                      <span
                        className="mono-telemetry"
                        style={{
                          color:
                            sample.sun.state === "visible"
                              ? "var(--solar-amber-bright)"
                              : sample.sun.state === "partial"
                                ? "#FDE047"
                                : "var(--text-muted)",
                        }}
                      >
                        {sample.sun.state === "visible"
                          ? "VISIBLE"
                          : sample.sun.state === "partial"
                            ? `PARCIAL ${(sample.sun.visible_fraction * 100).toFixed(0)}%`
                            : "OCULTO"}
                      </span>
                    </div>
                    {mode === "eng" ? (
                      <div className="mono-telemetry" style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                        El {sample.sun.elevation_deg.toFixed(2)}° · Az {sample.sun.azimuth_deg.toFixed(1)}°
                        <br />
                        Holgura: {sample.sun.clearance_deg >= 0 ? "+" : ""}
                        {sample.sun.clearance_deg.toFixed(2)}°
                      </div>
                    ) : (
                      <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                        {sample.sun.visible_fraction > 0
                          ? "Paneles solares generando energía"
                          : "Sombra topográfica: usando baterías"}
                      </div>
                    )}
                  </div>

                  <div className="body-status-box earth-box">
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                      <strong>🜨 Tierra</strong>
                      <span
                        className="mono-telemetry"
                        style={{
                          color:
                            sample.earth.clearance_deg >= 0
                              ? "var(--dte-cyan-bright)"
                              : "var(--text-muted)",
                        }}
                      >
                        {sample.earth.clearance_deg >= 0 ? "DTE ACTIVO" : "SIN ENLACE"}
                      </span>
                    </div>
                    {mode === "eng" ? (
                      <div className="mono-telemetry" style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                        El {sample.earth.elevation_deg.toFixed(2)}° · Az {sample.earth.azimuth_deg.toFixed(1)}°
                        <br />
                        Holgura: {sample.earth.clearance_deg >= 0 ? "+" : ""}
                        {sample.earth.clearance_deg.toFixed(2)}°
                      </div>
                    ) : (
                      <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                        {sample.earth.clearance_deg >= 0
                          ? "Llamada directa a la Tierra disponible"
                          : "Tierra oculta tras el horizonte"}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Barras de metricas acumuladas en la ventana */}
              {metrics && (
                <>
                  <div className="kpi-bars">
                    <div className="kpi-row">
                      <div className="kpi-label-line">
                        <span>☀ Luz Solar (Energía)</span>
                        <strong className="mono-telemetry">{sunPct}%</strong>
                      </div>
                      <div className="kpi-track">
                        <div className="kpi-fill solar" style={{ width: `${sunPct}%` }} />
                      </div>
                    </div>

                    <div className="kpi-row">
                      <div className="kpi-label-line">
                        <span>🜨 Enlace Directo Tierra (DTE)</span>
                        <strong className="mono-telemetry">{dtePct}%</strong>
                      </div>
                      <div className="kpi-track">
                        <div className="kpi-fill dte" style={{ width: `${dtePct}%` }} />
                      </div>
                    </div>

                    <div className="kpi-row">
                      <div className="kpi-label-line">
                        <span>★ Ventana Dorada (Sol + DTE)</span>
                        <strong className="mono-telemetry" style={{ color: "#34D399" }}>
                          {goldenPct}%
                        </strong>
                      </div>
                      <div className="kpi-track">
                        <div className="kpi-fill golden" style={{ width: `${goldenPct}%` }} />
                      </div>
                    </div>
                  </div>

                  <EventCountdown
                    nextSunset={metrics.next_sunset}
                    nextEarthset={metrics.next_earthset}
                    windowDays={windowDays}
                    mode={mode}
                  />

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "11px",
                      color: "var(--text-muted)",
                    }}
                  >
                    <span>
                      {mode === "edu"
                        ? `Noche continua máx.: ${(metrics.longest_darkness_hours / 24).toFixed(1)} días`
                        : `Max Darkness: ${metrics.longest_darkness_hours.toFixed(1)} h · Mean Sun El: ${metrics.mean_sun_elevation_deg.toFixed(2)}°`}
                    </span>
                    <span className="mono-telemetry">
                      {metrics.horizon_source === "spherical_analytical" ? "Esférico" : "LOLA DEM"}
                    </span>
                  </div>

                  {/* Panel Tecnico de Telecomunicaciones DTE Avanzadas (Exclusivo Modo Ingeniero, RF-02, RF-05, RT-01) */}
                  {mode === "eng" && metrics.advanced_dte && (() => {
                    const dte = metrics.advanced_dte;
                    const currentClearance = sample ? sample.earth.clearance_deg : dte.terrain_clearance_deg;
                    const currentAz = sample ? sample.earth.azimuth_deg : 0.0;
                    const currentEl = sample ? sample.earth.elevation_deg : 0.0;
                    const isZeroDte = metrics.dte_fraction === 0.0 || dte.max_clearance_deg < -0.1;

                    return (
                      <div className="advanced-dte-section" onClick={(e) => e.stopPropagation()}>
                        <div className="advanced-dte-header">
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <span style={{ fontSize: "13px" }}>📡</span>
                            <strong style={{ fontSize: "11px", color: "var(--dte-cyan-bright)", letterSpacing: "0.5px" }}>
                              TELECOMUNICACIONES DTE & ENLACE TIERRA (BANDA X / Ka)
                            </strong>
                          </div>
                          <span
                            className={`clearance-badge ${currentClearance >= 0 ? "clear" : "blocked"}`}
                            title={`Margen angular sobre el relieve lunar: ${currentClearance >= 0 ? "+" : ""}${currentClearance.toFixed(2)}°`}
                          >
                            {currentClearance >= 0 ? "✓ DESPEJADO" : "⚠ BLOQUEADO"} ({currentClearance >= 0 ? "+" : ""}{currentClearance.toFixed(2)}°)
                          </span>
                        </div>

                        {isZeroDte ? (
                          <div className="dte-relay-alert">
                            <span style={{ fontSize: "15px" }}>🛰️</span>
                            <div>
                              <strong style={{ color: "#F87171", fontSize: "11px" }}>Sin visión directa a la Tierra (DTE 0.0%)</strong>
                              <p style={{ margin: "2px 0 0 0", fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.3 }}>
                                Sin visión directa: requiere satélite relé orbital lunar (ej. Lunar Gateway, Queqiao, Moonlight ESA).
                              </p>
                            </div>
                          </div>
                        ) : (
                          <>
                            {/* Fila 1: Apuntamiento de Antena y Caja de Libracion Terrestre */}
                            <div className="dte-telemetry-row">
                              <div className="dte-telemetry-cell">
                                <span className="dte-cell-label">Apuntamiento Antena (Az / El)</span>
                                <span className="mono-telemetry dte-cell-val">
                                  Az {currentAz.toFixed(1)}° · El {currentEl >= 0 ? "+" : ""}{currentEl.toFixed(2)}°
                                </span>
                              </div>
                              <div className="dte-telemetry-cell">
                                <span className="dte-cell-label">Caja de Libración Terrestre</span>
                                <span
                                  className="mono-telemetry dte-cell-val"
                                  title="Oscilación angular de la Tierra vista desde la superficie lunar en la ventana de misión"
                                >
                                  ±{(dte.earth_azimuth_span_deg / 2).toFixed(1)}° Az · ±{(dte.earth_elevation_span_deg / 2).toFixed(1)}° El (Span {dte.libration_span_deg.toFixed(1)}°)
                                </span>
                              </div>
                            </div>

                            {/* Fila 2: Distancia, Latencia (OWLT / RTT) y Holgura Topográfica min/max */}
                            <div className="dte-telemetry-grid">
                              <div className="dte-grid-cell">
                                <span className="dte-grid-label">Distancia Tierra</span>
                                <span className="mono-telemetry dte-grid-value">
                                  {dte.earth_distance_km.toLocaleString("en-US", { maximumFractionDigits: 0 })} km
                                </span>
                              </div>
                              <div className="dte-grid-cell">
                                <span className="dte-grid-label">Latencia (OWLT / RTT)</span>
                                <span
                                  className="mono-telemetry dte-grid-value"
                                  title={`Tiempo de luz en un sentido: ${dte.one_way_light_time_s.toFixed(3)} s · Tiempo de ida y vuelta: ${dte.round_trip_time_s.toFixed(3)} s`}
                                >
                                  {dte.one_way_light_time_s.toFixed(2)}s / {dte.round_trip_time_s.toFixed(2)}s
                                </span>
                              </div>
                              <div className="dte-grid-cell">
                                <span className="dte-grid-label">Holgura Mín / Máx</span>
                                <span className="mono-telemetry dte-grid-value">
                                  {dte.min_clearance_deg >= 0 ? "+" : ""}{dte.min_clearance_deg.toFixed(1)}° / +{dte.max_clearance_deg.toFixed(1)}°
                                </span>
                              </div>
                            </div>

                            {/* Fila 3: Perdidas FSPL ITU-R P.525-4 (Bandas S, X y Ka) */}
                            <div className="dte-fspl-row">
                              <span className="dte-fspl-title">Pérdidas Espacio Libre (FSPL):</span>
                              <div className="dte-fspl-chips">
                                <span className="dte-fspl-chip" title="Banda S (2.2 GHz) - Enlace de comandos y telemetría de ingeniería">
                                  Banda S (2.2G): <strong>{dte.fspl_s_band_db.toFixed(1)} dB</strong>
                                </span>
                                <span className="dte-fspl-chip highlight-x" title="Banda X (8.4 GHz) - Enlace científico primario NASA DSN">
                                  Banda X (8.4G): <strong>{dte.fspl_x_band_db.toFixed(1)} dB</strong>
                                </span>
                                <span className="dte-fspl-chip highlight-ka" title="Banda Ka (32.0 GHz) - Banda ancha y video HD lunar">
                                  Banda Ka (32G): <strong>{dte.fspl_ka_band_db.toFixed(1)} dB</strong>
                                </span>
                              </div>
                            </div>

                            {/* Fila 4: Corte maximo continuo (Blackout) y Horas de Ventana Dorada */}
                            <div className="dte-window-stats">
                              <div className="dte-stat-item">
                                <span className="dte-stat-label">Blackout DTE máx. continuo:</span>
                                <strong
                                  className="mono-telemetry"
                                  style={{ color: dte.longest_comms_blackout_hours > 0 ? "#F87171" : "#34D399" }}
                                >
                                  {dte.longest_comms_blackout_hours > 0
                                    ? `${dte.longest_comms_blackout_hours.toFixed(1)} h`
                                    : "0.0 h (100% continuo)"}
                                </strong>
                              </div>
                              <div className="dte-stat-item">
                                <span className="dte-stat-label">Ventana Dorada (Sol + DTE):</span>
                                <strong className="mono-telemetry" style={{ color: "#34D399" }}>
                                  {dte.simultaneous_sun_earth_hours.toFixed(1)} h netas
                                </strong>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })()}
                </>
              )}

              {/* Modulo de Energia Solar y Acimut Optimo (RF-05, MATH_MODELS §5) */}
              {solar && (() => {
                const optimalAz = Math.round(solar.optimal_azimuth.optimal_panel_azimuth_deg);
                const optimalCardinal = azimuthToCardinal(optimalAz);
                const optimalEnergy = solar.optimal_azimuth.optimal_fixed_energy_kwh_m2;
                const currentManualAz = manualAzimuths[key] ?? optimalAz;
                const currentManualCardinal = azimuthToCardinal(currentManualAz);
                const currentManualEnergy = solar.optimal_azimuth.azimuth_energy_curve_kwh_m2[currentManualAz] ?? 0;
                const trackingEnergy = solar.tracking_vertical_panel.total_energy_kwh_m2;
                const horizontalEnergy = solar.horizontal_panel.total_energy_kwh_m2;

                const fixedVsTrackingPct = trackingEnergy > 0 ? ((currentManualEnergy / trackingEnergy) * 100).toFixed(1) : "0.0";
                const multiplierVsHorizontal = horizontalEnergy > 0.01
                  ? (currentManualEnergy / horizontalEnergy).toFixed(1) + "x"
                  : currentManualEnergy > 0 ? "∞ (suelo 0 kWh)" : "1.0x";
                const diffFromOptimal = currentManualEnergy - optimalEnergy;
                const pctLoss = optimalEnergy > 0 ? (((currentManualEnergy - optimalEnergy) / optimalEnergy) * 100).toFixed(1) : "0.0";
                const isTotalShadow =
                  (solar.optimal_azimuth.optimal_fixed_energy_kwh_m2 === 0 &&
                    solar.tracking_vertical_panel.total_energy_kwh_m2 === 0) ||
                  (metrics?.sunlit_fraction === 0.0);

                return (
                  <div className="solar-energy-section" onClick={(e) => e.stopPropagation()}>
                    <div className="solar-energy-header">
                      <strong style={{ fontSize: "11px", color: "var(--solar-amber-bright)" }}>
                        ⚡ Radiación Solar AM0 ({solar.solar_constant_am0_w_m2.toFixed(0)} W/m²)
                      </strong>
                      <div
                        className="solar-optimal-badge"
                        title="Acimut óptimo para panel vertical fijo: maximiza los kWh/m² evitando bloqueos de montañas lunares"
                      >
                        🎯 Acimut Óptimo: {optimalAz}° {optimalCardinal}
                      </div>
                    </div>

                    {/* Alerta de noche polar / sombra permanente */}
                    {isTotalShadow && (
                      <div className="solar-total-shadow-banner">
                        <strong className="mono-telemetry" style={{ color: "#F87171", fontSize: "11px" }}>
                          🌑 En sombra topográfica total (0 kWh/m²)
                        </strong>
                        <p style={{ margin: "2px 0 0", fontSize: "10.5px", color: "var(--text-secondary)" }}>
                          Las montañas circundantes bloquean el Sol durante toda la ventana de misión. Los paneles solares no captan energía; la misión requiere baterías o energía nuclear (RTG).
                        </p>
                      </div>
                    )}

                    {/* Comparativa de las 3 arquitecturas de paneles */}
                    <div className="solar-architectures-list">
                      {/* 1. Panel Vertical Fijo */}
                      <div className={`solar-arch-row ${currentManualAz === optimalAz ? "optimal-highlight" : ""}`}>
                        <div className="solar-arch-top">
                          <span className="solar-arch-title">
                            📐 Vertical Fijo ({currentManualAz}° {currentManualCardinal})
                            {currentManualAz === optimalAz && <span style={{ color: "#FDE047", fontSize: "10px" }}>★ Óptimo</span>}
                          </span>
                          <div className="solar-arch-values">
                            <span className="solar-kwh-value">{currentManualEnergy.toFixed(1)} kWh/m²</span>
                            <span className="solar-efficiency-tag gold">
                              {fixedVsTrackingPct}% de tracking
                            </span>
                          </div>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "var(--text-muted)" }}>
                          <span>Ventaja vs. plano en suelo:</span>
                          <strong style={{ color: "#34D399" }}>
                            {currentManualEnergy > horizontalEnergy ? `+${(currentManualEnergy - horizontalEnergy).toFixed(1)} kWh/m² (${multiplierVsHorizontal})` : "Equivalente"}
                          </strong>
                        </div>
                      </div>

                      {/* 2. Panel Vertical Seguimiento 360° */}
                      <div className="solar-arch-row">
                        <div className="solar-arch-top">
                          <span className="solar-arch-title">🔄 Vertical Seguimiento 360°</span>
                          <div className="solar-arch-values">
                            <span className="solar-kwh-value">{trackingEnergy.toFixed(1)} kWh/m²</span>
                            <span className="solar-efficiency-tag cyan">100% (Techo)</span>
                          </div>
                        </div>
                        <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                          {mode === "edu"
                            ? "Gira continuamente siguiendo al Sol en el horizonte (máxima energía posible)."
                            : `Pico: ${solar.tracking_vertical_panel.peak_flux_w_m2.toFixed(1)} W/m² · Media: ${solar.tracking_vertical_panel.mean_flux_w_m2.toFixed(1)} W/m²`}
                        </div>
                      </div>

                      {/* 3. Panel Horizontal en suelo */}
                      <div className="solar-arch-row">
                        <div className="solar-arch-top">
                          <span className="solar-arch-title">⏹ Horizontal en Suelo</span>
                          <div className="solar-arch-values">
                            <span className="solar-kwh-value">{horizontalEnergy.toFixed(1)} kWh/m²</span>
                            <span className="solar-efficiency-tag slate">
                              {trackingEnergy > 0 ? ((horizontalEnergy / trackingEnergy) * 100).toFixed(1) : "0"}%
                            </span>
                          </div>
                        </div>
                        <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                          {mode === "edu"
                            ? "Tumbado en el suelo lunar (afectado por la baja elevación del Sol en los polos)."
                            : `Pico: ${solar.horizontal_panel.peak_flux_w_m2.toFixed(1)} W/m² · Media: ${solar.horizontal_panel.mean_flux_w_m2.toFixed(1)} W/m²`}
                        </div>
                      </div>
                    </div>

                    {/* Selector interactivo de Acimut Manual */}
                    <div className="solar-slider-container">
                      <div className="solar-slider-header">
                        <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>
                          Orientación manual panel fijo:
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <strong className="mono-telemetry" style={{ color: currentManualAz === optimalAz ? "#FDE047" : "#E2E8F0" }}>
                            {currentManualAz}° {currentManualCardinal}
                          </strong>
                          {currentManualAz !== optimalAz && (
                            <button
                              type="button"
                              className="hud-btn-mini"
                              style={{ padding: "1px 6px", fontSize: "10px", borderColor: "var(--solar-amber)" }}
                              onClick={() => setManualAzimuths((prev) => ({ ...prev, [key]: optimalAz }))}
                              title="Restablecer al acimut óptimo calculado"
                            >
                              Reset 🎯 {optimalAz}°
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Brújula Solar Interactiva SVG */}
                      <SolarAzimuthCompass
                        panelAzimuthDeg={currentManualAz}
                        optimalAzimuthDeg={optimalAz}
                        sunAzimuthDeg={sample?.sun.azimuth_deg ?? null}
                        earthAzimuthDeg={sample?.earth.azimuth_deg ?? null}
                        horizonProfile={horizonByKey?.[key]}
                        samples={seriesByKey?.[key]?.samples}
                        isTotalShadow={isTotalShadow}
                      />

                      <input
                        type="range"
                        min="0"
                        max="359"
                        step="1"
                        value={currentManualAz}
                        onChange={(e) => {
                          const val = Number.parseInt(e.target.value, 10);
                          setManualAzimuths((prev) => ({ ...prev, [key]: val }));
                        }}
                        className="solar-azimuth-slider"
                        aria-label={`Ajustar acimut del panel fijo para ${curated?.name ?? "sitio"}`}
                      />

                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "var(--text-muted)" }}>
                        <span>0° N</span>
                        <span>90° E</span>
                        <span>180° S</span>
                        <span>270° W</span>
                        <span>359°</span>
                      </div>

                      {currentManualAz !== optimalAz && (
                        <div style={{ fontSize: "10px", color: "#F87171", textAlign: "right", fontWeight: 600 }}>
                          ⚠ Desalineación: {pctLoss}% ({diffFromOptimal.toFixed(1)} kWh/m² vs óptimo)
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Deep-links a LROC QuickMap (nuevo dominio) y NASA Moon Trek */}
              <div className="portal-links-row" onClick={(ev) => ev.stopPropagation()}>
                <a
                  href={links.quickmap_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="portal-link"
                  title="Abrir coordenadas en el nuevo dominio oficial de NASA LROC QuickMap (Intuitive Machines)"
                >
                  ↗ LROC QuickMap
                </a>
                <a
                  href={links.moontrek_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="portal-link"
                  title="Abrir en NASA Moon Trek (nuestro navegador desbloquea abiertamente el analisis de horizonte restringido en Moon Trek)"
                >
                  ↗ NASA Moon Trek
                </a>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
