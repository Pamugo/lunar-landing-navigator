import { useMemo, useRef, useState } from "react";
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
import { useLanguage } from "../i18n/LanguageContext";
import { TRANSLATIONS, getLocalizedSiteCopy, getShortSiteName, toSentenceCase, type Language } from "../i18n/translations";

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
  activeVisualSubview?: "globe3d" | "dome360" | "terrain3d";
  onShowInTerrain3D?: (index: number) => void;
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

export function normalizeAzimuthDeg(deg: number): number {
  return ((Math.round(deg) % 360) + 360) % 360;
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

  // 1. Azimuths where the Sun was hidden behind terrain or had clearance <= 0 in orbital data
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

  // 2. If a LOLA horizon profile exists, mark azimuths where the horizon exceeds peak solar elevation
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

  // Group into contiguous angular sectors
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
  onSelectAzimuth?: ((azDeg: number) => void) | undefined;
}

export function SolarAzimuthCompass({
  panelAzimuthDeg,
  optimalAzimuthDeg,
  sunAzimuthDeg,
  earthAzimuthDeg,
  horizonProfile,
  samples,
  isTotalShadow,
  onSelectAzimuth,
}: SolarAzimuthCompassProps) {
  const { t } = useLanguage();
  const optimalTargetAz = normalizeAzimuthDeg(optimalAzimuthDeg);
  const sunTargetAz = sunAzimuthDeg !== null ? normalizeAzimuthDeg(sunAzimuthDeg) : null;
  const earthTargetAz = earthAzimuthDeg !== null ? normalizeAzimuthDeg(earthAzimuthDeg) : null;
  const handleMarkerKeyDown = (e: React.KeyboardEvent, targetAz: number) => {
    if (!onSelectAzimuth) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelectAzimuth(targetAz);
    }
  };
  const cx = 110;
  const cy = 110;
  const rCompass = 80;

  // Topographic shadow sectors (mountains blocking the Sun)
  const shadowSectors = computeShadowSectors(samples, horizonProfile);

  // Normal vector arrow (panel facing direction)
  const arrowTip = polarToSvg(panelAzimuthDeg, 52, cx, cy);
  const arrowBase = polarToSvg(panelAzimuthDeg, 44, cx, cy);
  const arrowWing1 = polarToSvg(panelAzimuthDeg - 14, 42, cx, cy);
  const arrowWing2 = polarToSvg(panelAzimuthDeg + 14, 42, cx, cy);

  // Solar panel bar (perpendicular to normal)
  const barLeft = polarToSvg(panelAzimuthDeg - 90, 24, cx, cy);
  const barRight = polarToSvg(panelAzimuthDeg + 90, 24, cx, cy);

  // Forward collection cone (±90° relative to normal)
  const coneRadius = 40;
  const coneLeft = polarToSvg(panelAzimuthDeg - 90, coneRadius, cx, cy);
  const coneRight = polarToSvg(panelAzimuthDeg + 90, coneRadius, cx, cy);
  const conePath = `M ${cx} ${cy} L ${coneLeft.x} ${coneLeft.y} A ${coneRadius} ${coneRadius} 0 0 1 ${coneRight.x} ${coneRight.y} Z`;

  // Visual arc from 0° North to panel azimuth (clockwise)
  const rArc = 58;
  const arcEnd = polarToSvg(panelAzimuthDeg, rArc, cx, cy);
  const largeArcFlag = panelAzimuthDeg > 180 ? 1 : 0;
  const hasArc = panelAzimuthDeg >= 1 && panelAzimuthDeg <= 359;
  const arcPath = `M ${cx} ${cy - rArc} A ${rArc} ${rArc} 0 ${largeArcFlag} 1 ${arcEnd.x} ${arcEnd.y}`;

  // Celestial body positions
  const sunPos = sunAzimuthDeg !== null ? polarToSvg(sunAzimuthDeg, rCompass, cx, cy) : null;
  const earthPos = earthAzimuthDeg !== null ? polarToSvg(earthAzimuthDeg, rCompass, cx, cy) : null;
  const optimalPos = polarToSvg(optimalAzimuthDeg, rCompass, cx, cy);

  const isSunInCone = sunAzimuthDeg !== null ? angularDifference(panelAzimuthDeg, sunAzimuthDeg) <= 90 : false;

  // 12 graduation ticks every 30°
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
        aria-label={`${t.comparison.compassAriaPrefix} ${panelAzimuthDeg}°, ${t.comparison.compassOptimalAt} ${optimalAzimuthDeg}°`}
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

        {/* Compass base circle */}
        <circle cx={cx} cy={cy} r={rCompass} fill="url(#compassBg)" stroke="rgba(255, 255, 255, 0.14)" strokeWidth="1.5" />
        <circle cx={cx} cy={cy} r={rCompass - 18} fill="none" stroke="rgba(255, 255, 255, 0.05)" strokeDasharray="2,2" />

        {/* Topographic shadow sectors (mountains blocking the Sun) */}
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
                <title>{t.comparison.compassTotalShadowTitle}</title>
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
              <title>{`${t.comparison.compassSectorShadowStart} ${sec.startDeg}° ${t.comparison.compassSectorShadowAnd} ${sec.endDeg}°`}</title>
            </path>
          );
        })}

        {/* North-South and East-West axes */}
        <line x1={cx} y1={cy - rCompass} x2={cx} y2={cy + rCompass} stroke="rgba(255, 255, 255, 0.08)" strokeDasharray="2,2" />
        <line x1={cx - rCompass} y1={cy} x2={cx + rCompass} y2={cy} stroke="rgba(255, 255, 255, 0.08)" strokeDasharray="2,2" />

        {/* 30° dial ticks */}
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

        {/* Cardinal reference labels */}
        <text x={cx} y={15} textAnchor="middle" fontSize="10" fontWeight="bold" fill="var(--compass-north-text, #F87171)">
          0° N
        </text>
        <text x={207} y={113} textAnchor="start" fontSize="9" fontWeight="600" fill="var(--compass-cardinal-text, #94A3B8)">
          90° E
        </text>
        <text x={cx} y={214} textAnchor="middle" fontSize="9" fontWeight="600" fill="var(--compass-cardinal-text, #94A3B8)">
          180° S
        </text>
        <text x={13} y={113} textAnchor="end" fontSize="9" fontWeight="600" fill="var(--compass-cardinal-text, #94A3B8)">
          {t.comparison.compassWLabel}
        </text>

        {/* Visual arc from 0° North to panel azimuth */}
        {hasArc && (
          <path
            d={arcPath}
            fill="none"
            stroke="rgba(245, 158, 11, 0.75)"
            strokeWidth="2.5"
            strokeDasharray="3,2"
          />
        )}

        {/* Panel forward collection semicircle/cone (±90°) */}
        <path d={conePath} fill="url(#coneGlow)" stroke="rgba(245, 158, 11, 0.6)" strokeWidth="1" />

        {/* Ray toward Sun (if time sample available) */}
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

        {/* Solar panel bar */}
        <line
          x1={barLeft.x}
          y1={barLeft.y}
          x2={barRight.x}
          y2={barRight.y}
          stroke="#38BDF8"
          strokeWidth="4"
          strokeLinecap="round"
        />

        {/* Normal vector arrow (points toward panel azimuth) */}
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

        {/* Center pivot */}
        <circle cx={cx} cy={cy} r="3" fill="#E2E8F0" />

        {/* Optimal Azimuth Marker 🎯 */}
        <g
          transform={`translate(${optimalPos.x}, ${optimalPos.y})`}
          className={onSelectAzimuth ? "solar-compass-marker-btn" : undefined}
          role={onSelectAzimuth ? "button" : undefined}
          tabIndex={onSelectAzimuth ? 0 : undefined}
          aria-label={onSelectAzimuth ? `${t.comparison.compassClickToPointPrefix} ${optimalTargetAz}°` : undefined}
          onClick={onSelectAzimuth ? () => onSelectAzimuth(optimalTargetAz) : undefined}
          onKeyDown={onSelectAzimuth ? (e) => handleMarkerKeyDown(e, optimalTargetAz) : undefined}
        >
          <title>{`${t.comparison.compassPillOptimal} ${optimalTargetAz}° · ${t.comparison.compassClickToPointPrefix} ${optimalTargetAz}°`}</title>
          <circle r="7.5" fill="#059669" stroke="#34D399" strokeWidth="1.5" />
          <text textAnchor="middle" dy="3" fontSize="8" fill="#FFF" pointerEvents="none">
            🎯
          </text>
        </g>

        {/* Earth Marker 🜨 */}
        {earthPos && earthTargetAz !== null && (
          <g
            transform={`translate(${earthPos.x}, ${earthPos.y})`}
            className={onSelectAzimuth ? "solar-compass-marker-btn" : undefined}
            role={onSelectAzimuth ? "button" : undefined}
            tabIndex={onSelectAzimuth ? 0 : undefined}
            aria-label={onSelectAzimuth ? `${t.comparison.compassClickToPointPrefix} ${earthTargetAz}°` : undefined}
            onClick={onSelectAzimuth ? () => onSelectAzimuth(earthTargetAz) : undefined}
            onKeyDown={onSelectAzimuth ? (e) => handleMarkerKeyDown(e, earthTargetAz) : undefined}
          >
            <title>{`${t.comparison.compassPillEarth} ${earthAzimuthDeg?.toFixed(1)}° · ${t.comparison.compassClickToPointPrefix} ${earthTargetAz}°`}</title>
            <circle r="7.5" fill="#0284C7" stroke="#38BDF8" strokeWidth="1.5" />
            <text textAnchor="middle" dy="3" fontSize="8" fill="#FFF" pointerEvents="none">
              🜨
            </text>
          </g>
        )}

        {/* Sun Marker ☀️ */}
        {sunPos && sunTargetAz !== null && (
          <g
            transform={`translate(${sunPos.x}, ${sunPos.y})`}
            className={onSelectAzimuth ? "solar-compass-marker-btn" : undefined}
            role={onSelectAzimuth ? "button" : undefined}
            tabIndex={onSelectAzimuth ? 0 : undefined}
            aria-label={onSelectAzimuth ? `${t.comparison.compassClickToPointPrefix} ${sunTargetAz}°` : undefined}
            onClick={onSelectAzimuth ? () => onSelectAzimuth(sunTargetAz) : undefined}
            onKeyDown={onSelectAzimuth ? (e) => handleMarkerKeyDown(e, sunTargetAz) : undefined}
          >
            <title>{`${t.comparison.compassPillSun} ${sunAzimuthDeg?.toFixed(1)}° · ${t.comparison.compassClickToPointPrefix} ${sunTargetAz}°`}</title>
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

        {/* Total shadow warning on compass if applicable */}
        {isTotalShadow && (
          <g transform={`translate(${cx}, ${cy})`}>
            <rect x="-82" y="-13" width="164" height="26" rx="5" fill="rgba(15, 23, 42, 0.95)" stroke="rgba(239, 68, 68, 0.75)" strokeWidth="1.5" />
            <text textAnchor="middle" dy="4" fontSize="9" fontWeight="bold" fill="#F87171">
              {t.comparison.compassTotalShadowWarning}
            </text>
          </g>
        )}
      </svg>

      {/* Pills with exact azimuths */}
      <div className="solar-compass-pills">
        <span className="solar-compass-pill" style={{ borderColor: "rgba(245, 158, 11, 0.4)" }}>
          {t.comparison.compassPillPanel} <strong>{panelAzimuthDeg}°</strong>
        </span>
        {onSelectAzimuth ? (
          <button
            type="button"
            className={`solar-compass-pill clickable${panelAzimuthDeg === optimalTargetAz ? " active" : ""}`}
            style={{ borderColor: "rgba(16, 185, 129, 0.45)" }}
            onClick={() => onSelectAzimuth(optimalTargetAz)}
            title={`${t.comparison.compassClickToPointPrefix} ${optimalTargetAz}°`}
            aria-label={`${t.comparison.compassPillOptimal} ${optimalTargetAz}° · ${t.comparison.compassClickToPointPrefix} ${optimalTargetAz}°`}
          >
            {t.comparison.compassPillOptimal} <strong>{optimalTargetAz}°</strong>
          </button>
        ) : (
          <span className="solar-compass-pill" style={{ borderColor: "rgba(16, 185, 129, 0.4)" }}>
            {t.comparison.compassPillOptimal} <strong>{optimalTargetAz}°</strong>
          </span>
        )}
        {sunAzimuthDeg !== null && sunTargetAz !== null && (
          onSelectAzimuth ? (
            <button
              type="button"
              className={`solar-compass-pill clickable${panelAzimuthDeg === sunTargetAz ? " active" : ""}`}
              style={{
                borderColor: isSunInCone ? "rgba(245, 158, 11, 0.5)" : "rgba(148, 163, 184, 0.35)",
                color: isSunInCone ? "var(--accent-amber-bright-text)" : "var(--text-muted)",
              }}
              onClick={() => onSelectAzimuth(sunTargetAz)}
              title={`${t.comparison.compassClickToPointPrefix} ${sunTargetAz}°`}
              aria-label={`${t.comparison.compassPillSun} ${sunTargetAz}° · ${t.comparison.compassClickToPointPrefix} ${sunTargetAz}°`}
            >
              {t.comparison.compassPillSun} <strong>{sunAzimuthDeg.toFixed(1)}°</strong>
              {isSunInCone ? t.comparison.compassCaptures : t.comparison.compassRear}
            </button>
          ) : (
            <span
              className="solar-compass-pill"
              style={{
                borderColor: isSunInCone ? "rgba(245, 158, 11, 0.5)" : "rgba(148, 163, 184, 0.35)",
                color: isSunInCone ? "var(--accent-amber-bright-text)" : "var(--text-muted)",
              }}
            >
              {t.comparison.compassPillSun} <strong>{sunAzimuthDeg.toFixed(1)}°</strong>
              {isSunInCone ? t.comparison.compassCaptures : t.comparison.compassRear}
            </span>
          )
        )}
        {earthAzimuthDeg !== null && earthTargetAz !== null && (
          onSelectAzimuth ? (
            <button
              type="button"
              className={`solar-compass-pill clickable${panelAzimuthDeg === earthTargetAz ? " active" : ""}`}
              style={{ borderColor: "rgba(6, 182, 212, 0.45)" }}
              onClick={() => onSelectAzimuth(earthTargetAz)}
              title={`${t.comparison.compassClickToPointPrefix} ${earthTargetAz}°`}
              aria-label={`${t.comparison.compassPillEarth} ${earthTargetAz}° · ${t.comparison.compassClickToPointPrefix} ${earthTargetAz}°`}
            >
              {t.comparison.compassPillEarth} <strong>{earthAzimuthDeg.toFixed(1)}°</strong>
            </button>
          ) : (
            <span className="solar-compass-pill" style={{ borderColor: "rgba(6, 182, 212, 0.4)" }}>
              {t.comparison.compassPillEarth} <strong>{earthAzimuthDeg.toFixed(1)}°</strong>
            </span>
          )
        )}
        {shadowSectors.length > 0 && (
          <span className="solar-compass-pill danger">
            {t.comparison.compassShadowPrefix}
            {shadowSectors.reduce((acc, s) => acc + (((s.endDeg - s.startDeg + 360) % 360) + 1), 0)}
            {t.comparison.compassShadowBlocked}
          </span>
        )}
      </div>

      {/* Explanatory legend */}
      <p className="solar-compass-legend">{t.comparison.compassLegend}</p>
    </div>
  );
}

/* ---------------- Mission Profiles & Viability Ranking (RF-02, RF-05) ---------------- */
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
    name: "Balanced (Artemis)",
    shortDesc: "40% Solar Energy · 35% DTE · 25% Thermal Survival",
    weights: { solar: 0.40, dte: 0.35, thermal: 0.25 },
  },
  energy: {
    id: "energy",
    name: "Energy / ISRU Priority",
    shortDesc: "60% Solar Energy · 20% DTE · 20% Thermal Survival",
    weights: { solar: 0.60, dte: 0.20, thermal: 0.20 },
  },
  comms: {
    id: "comms",
    name: "Comms / DTE Priority",
    shortDesc: "20% Solar Energy · 60% DTE · 20% Thermal Survival",
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
  lang: Language = "en",
): Record<string, ViabilityAssessment> {
  const profile = MISSION_PROFILES[profileId];
  const { solar: wSolar, dte: wDte, thermal: wThermal } = profile.weights;
  const tComp = TRANSLATIONS[lang].comparison;

  // Fixed panel energy normalization across active sites
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

    // 3. Thermal Survival Component (0..100) - Equatorial continuous night ~354 hours
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
        verdictSummary = `${tComp.verdictEnergyWinnerPrefix}${item.solarScore.toFixed(0)}${tComp.verdictEnergyWinnerSuffix}`;
      } else if (profileId === "comms") {
        verdictSummary = `${tComp.verdictCommsWinnerPrefix}${item.dteScore.toFixed(0)}${tComp.verdictCommsWinnerSuffix}`;
      } else {
        verdictSummary = tComp.verdictBalancedWinner;
      }
    } else {
      if (item.score < 25) {
        verdictSummary = item.dteScore < 10 ? tComp.verdictLowDte : tComp.verdictLowSolar;
      } else {
        verdictSummary = `${tComp.verdictSecondaryPrefix}${rank} (${item.score.toFixed(1)} ${tComp.ptsUnit}).`;
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

export interface SolarArrayConfig {
  area_m2: number;
  efficiency_pct: number;
}

export interface SolarArrayOutput {
  energy_kwh: number;
  mean_power_w: number;
}

export function computeNetElectricalOutput(
  irradianceKwhM2: number,
  areaM2: number,
  efficiencyPct: number,
  windowDays: number,
): SolarArrayOutput {
  const safeIrradiance = Math.max(0, irradianceKwhM2);
  const safeArea = Math.max(0.1, Math.min(500, areaM2));
  const safeEff = Math.max(5, Math.min(45, efficiencyPct));
  const safeHours = Math.max(1, windowDays * 24);
  const energy_kwh = safeIrradiance * safeArea * (safeEff / 100);
  const mean_power_w = (energy_kwh * 1000) / safeHours;
  return { energy_kwh, mean_power_w };
}

export function formatMeanPower(watts: number): string {
  if (watts >= 1000) {
    return `${(watts / 1000).toFixed(2)} kW`;
  }
  return `${Math.round(watts)} W`;
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
  lang: Language = "en",
  solarArray: SolarArrayConfig = { area_m2: 10.0, efficiency_pct: 30 },
) {
  const tComp = TRANSLATIONS[lang].comparison;
  const epoch = startDateIso ?? "2027-01-01T00:00:00Z";
  const headers = tComp.exportCsvHeaders;

  const rows: string[][] = [headers];

  for (const coord of selectedSites) {
    const key = coordinateKey(coord);
    const curated = curatedSites.find((s) => s.id === coord.site_id);
    const m = metricsByKey[key];
    const sol = solarEnergyByKey?.[key];
    const dte = m?.advanced_dte;
    const ass = assessments[key];

    const name = curated
      ? getLocalizedSiteCopy(curated, lang).name
      : `Coord (${coord.lat_deg.toFixed(4)}, ${coord.lon_deg.toFixed(4)})`;
    const type = curated
      ? (tComp.categories[curated.category] ?? curated.category)
      : (tComp.categories["custom"] ?? "custom");
    const optAz = sol ? Math.round(sol.optimal_azimuth.optimal_panel_azimuth_deg) : "";
    const optCard = sol ? azimuthToCardinal(Number(optAz)) : "";
    const netFixed = sol
      ? computeNetElectricalOutput(
          sol.optimal_azimuth.optimal_fixed_energy_kwh_m2,
          solarArray.area_m2,
          solarArray.efficiency_pct,
          windowDays,
        )
      : null;
    const netTracking = sol
      ? computeNetElectricalOutput(
          sol.tracking_vertical_panel.total_energy_kwh_m2,
          solarArray.area_m2,
          solarArray.efficiency_pct,
          windowDays,
        )
      : null;
    const netHoriz = sol
      ? computeNetElectricalOutput(
          sol.horizontal_panel.total_energy_kwh_m2,
          solarArray.area_m2,
          solarArray.efficiency_pct,
          windowDays,
        )
      : null;

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
      solarArray.area_m2.toFixed(1),
      solarArray.efficiency_pct.toFixed(1),
      netFixed ? netFixed.energy_kwh.toFixed(2) : "",
      netFixed ? netFixed.mean_power_w.toFixed(1) : "",
      netTracking ? netTracking.energy_kwh.toFixed(2) : "",
      netHoriz ? netHoriz.energy_kwh.toFixed(2) : "",
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
  lang: Language = "en",
  solarArray: SolarArrayConfig = { area_m2: 10.0, efficiency_pct: 30 },
) {
  const tComp = TRANSLATIONS[lang].comparison;
  const pr = tComp.printReport;
  const localizedProfile = tComp.profiles[profile.id];
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert(tComp.popupBlockedAlert);
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
    ? getLocalizedSiteCopy(winnerCurated, lang).name
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
      const name = curated
        ? getLocalizedSiteCopy(curated, lang).name
        : `Coord (${coord.lat_deg.toFixed(2)}°, ${coord.lon_deg.toFixed(2)}°)`;
      const optAz = sol
        ? `${Math.round(sol.optimal_azimuth.optimal_panel_azimuth_deg)}° ${azimuthToCardinal(sol.optimal_azimuth.optimal_panel_azimuth_deg)}`
        : "—";
      const netFixed = sol
        ? computeNetElectricalOutput(
            sol.optimal_azimuth.optimal_fixed_energy_kwh_m2,
            solarArray.area_m2,
            solarArray.efficiency_pct,
            windowDays,
          )
        : null;
      const netTracking = sol
        ? computeNetElectricalOutput(
            sol.tracking_vertical_panel.total_energy_kwh_m2,
            solarArray.area_m2,
            solarArray.efficiency_pct,
            windowDays,
          )
        : null;
      const netHoriz = sol
        ? computeNetElectricalOutput(
            sol.horizontal_panel.total_energy_kwh_m2,
            solarArray.area_m2,
            solarArray.efficiency_pct,
            windowDays,
          )
        : null;

      return `
        <tr class="${isWin ? "winner-row" : ""}">
          <td><strong>${isWin ? "🏆 " : `#${ass?.rank ?? "-"} `}${name}</strong></td>
          <td>${coord.lat_deg.toFixed(3)}°, ${coord.lon_deg.toFixed(3)}°</td>
          <td>h₀=${coord.observer_height_m.toFixed(1)}m</td>
          <td><span class="score-pill">${ass ? ass.score.toFixed(1) : "—"} ${tComp.ptsUnit}</span></td>
          <td>${optAz}</td>
          <td>${sol ? sol.optimal_azimuth.optimal_fixed_energy_kwh_m2.toFixed(1) : "—"} kWh/m²</td>
          <td>${sol ? sol.tracking_vertical_panel.total_energy_kwh_m2.toFixed(1) : "—"} kWh/m²</td>
          <td>${netFixed && netTracking && netHoriz ? `<strong>${netFixed.energy_kwh.toFixed(1)} kWh</strong> (${formatMeanPower(netFixed.mean_power_w)}) / ${netTracking.energy_kwh.toFixed(1)} kWh / ${netHoriz.energy_kwh.toFixed(1)} kWh` : "—"}</td>
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
<html lang="${lang}">
<head>
  <meta charset="utf-8" />
  <title>${pr.title}</title>
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
    .meta-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 6px; padding: 8px 12px; margin-bottom: 12px; }
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
    <button class="print-btn" onclick="window.print()">${pr.printBtn}</button>
  </div>
  <div class="header">
    <div class="title-block">
      <h1>LUNAR LANDING SITE NAVIGATOR</h1>
      <p>${pr.subtitle}</p>
    </div>
    <div style="text-align: right; font-size: 10px; color: #64748B;">
      <div><strong>${pr.sealLabel}</strong> VAL-20261114-02</div>
      <div>${pr.ephemNote}</div>
    </div>
  </div>

  <div class="meta-grid">
    <div class="meta-item">
      <span class="meta-lbl">${pr.issueDate}</span>
      <span class="meta-val">${nowUtc}</span>
    </div>
    <div class="meta-item">
      <span class="meta-lbl">${pr.missionStart}</span>
      <span class="meta-val">${startDateIso ?? "2027-01-01T00:00:00Z"}</span>
    </div>
    <div class="meta-item">
      <span class="meta-lbl">${pr.simWindow}</span>
      <span class="meta-val">${windowDays} ${pr.daysUnit}</span>
    </div>
    <div class="meta-item">
      <span class="meta-lbl">${pr.missionProfile}</span>
      <span class="meta-val">${localizedProfile.name}</span>
    </div>
    <div class="meta-item">
      <span class="meta-lbl">${pr.solarArraySpec}</span>
      <span class="meta-val">${solarArray.area_m2.toFixed(1)} m² · ${solarArray.efficiency_pct.toFixed(1)}%</span>
    </div>
    <div class="meta-item">
      <span class="meta-lbl">${pr.criteriaWeights}</span>
      <span class="meta-val">${localizedProfile.shortDesc}</span>
    </div>
  </div>

  ${
    winnerCoord && winnerAss
      ? `
  <div class="winner-box">
    <div class="winner-info">
      <h3>${pr.winnerHeading} ${winnerName}</h3>
      <p>${winnerAss.verdictSummary}</p>
    </div>
    <div class="winner-score">${winnerAss.score.toFixed(1)} / 100 ${tComp.ptsUnit}</div>
  </div>`
      : ""
  }

  <table>
    <thead>
      <tr>
        <th>${pr.colSite}</th>
        <th>${pr.colCoord}</th>
        <th>${pr.colMast}</th>
        <th>${pr.colViability}</th>
        <th>${pr.colOptAz}</th>
        <th>${pr.colFixedEnergy}</th>
        <th>${pr.colTracking}</th>
        <th>${pr.colNetElectrical}</th>
        <th>${pr.colSunPct}</th>
        <th>${pr.colDtePct}</th>
        <th>${pr.colGolden}</th>
        <th>${pr.colClearance}</th>
        <th>${pr.colRtt}</th>
        <th>${pr.colFspl}</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <div class="footer">
    <span>${pr.footerLeft}</span>
    <span>${pr.footerRight}</span>
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
  activeVisualSubview = "globe3d",
  onShowInTerrain3D,
}: ComparisonGridProps) {
  const { lang, t } = useLanguage();
  const [customLat, setCustomLat] = useState<string>("-88.50");
  const [customLon, setCustomLon] = useState<string>("15.00");
  const missionProfile: MissionProfileId = "balanced";
  const [sortBy, setSortBy] = useState<"default" | "viability" | "solar" | "dte" | "golden">("viability");
  const [manualAzimuths, setManualAzimuths] = useState<Record<string, number>>({});
  const [customHeights, setCustomHeights] = useState<Record<string, string>>({});
  const [pvSimEnabled, setPvSimEnabled] = useState<boolean>(true);
  const [pvAreaM2, setPvAreaM2] = useState<number>(10.0);
  const [pvAreaInput, setPvAreaInput] = useState<string>("10.0");
  const [pvEfficiencyPct, setPvEfficiencyPct] = useState<number>(30);
  const [pvEffInput, setPvEffInput] = useState<string>("30");
  const focusedCardRef = useRef<HTMLElement | null>(null);

  const commitPvArea = (raw: string) => {
    const parsed = Number.parseFloat(raw);
    if (!Number.isNaN(parsed)) {
      const clamped = Math.max(0.1, Math.min(500, Math.round(parsed * 10) / 10));
      setPvAreaM2(clamped);
      setPvAreaInput(clamped.toFixed(1));
    } else {
      setPvAreaInput(pvAreaM2.toFixed(1));
    }
  };

  const commitPvEff = (raw: string) => {
    const parsed = Number.parseFloat(raw);
    if (!Number.isNaN(parsed)) {
      const clamped = Math.max(5, Math.min(45, Math.round(parsed * 10) / 10));
      setPvEfficiencyPct(clamped);
      setPvEffInput(Number.isInteger(clamped) ? clamped.toString() : clamped.toFixed(1));
    } else {
      setPvEffInput(Number.isInteger(pvEfficiencyPct) ? pvEfficiencyPct.toString() : pvEfficiencyPct.toFixed(1));
    }
  };

  const assessments = useMemo(() => {
    return computeViabilityAssessments(
      selectedSites.map((coord) => ({ coord, key: coordinateKey(coord) })),
      metricsByKey,
      solarEnergyByKey,
      missionProfile,
      lang,
    );
  }, [selectedSites, metricsByKey, solarEnergyByKey, missionProfile, lang]);

  const handleCommitHeight = (idx: number, coordKey: string, rawVal: string, fallbackH: number) => {
    const val = Number.parseFloat(rawVal);
    if (!Number.isNaN(val) && val >= 0.0) {
      const clamped = Math.min(100.0, Math.max(0.0, Math.round(val * 10) / 10));
      onChangeSiteHeight?.(idx, clamped);
      setCustomHeights((prev) => ({ ...prev, [keyOrFallback(coordKey)]: clamped.toString() }));
    } else {
      const safeFallback = Math.min(100.0, Math.max(0.0, fallbackH));
      setCustomHeights((prev) => ({ ...prev, [coordKey]: safeFallback.toFixed(1) }));
    }
  };

  function keyOrFallback(k: string): string {
    return k;
  }

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

  const windowDurationTag =
    windowDays === 1
      ? `1 ${t.comparison.daySingularUnit}`
      : `${windowDays} ${t.comparison.daysUnit}`;

  return (
    <section className="glass-panel comparison-panel" aria-label={t.comparison.panelAria}>
      <div className="panel-header">
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <h2 className="panel-title">
            {mode === "edu" ? t.comparison.titleEdu : t.comparison.titleEng}
          </h2>
          {mode === "edu" && (
            <span className="comparator-window-pill" title={t.comparison.eduWindowTitle}>
              ⏱ {windowDurationTag}
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          {selectedSites.length > 0 && (
            <button
              type="button"
              className="hud-btn-mini close-all-btn"
              style={{
                padding: "4px 9px",
                color: "var(--text-secondary)",
                borderColor: "rgba(224, 60, 49, 0.45)",
              }}
              onClick={onClearAllSites}
              title={t.comparison.closeAllTitle}
            >
              <span aria-hidden="true">✕</span>
              <span>{t.comparison.closeAllBtn} ({selectedSites.length})</span>
            </button>
          )}

          <label htmlFor="sort-metrics-select" style={{ fontSize: "11px", color: "var(--text-muted)" }}>
            {t.comparison.sortLabel}
          </label>
          <select
            id="sort-metrics-select"
            className="hud-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "default" | "viability" | "solar" | "dte" | "golden")}
          >
            <option value="viability">{t.comparison.sortViability}</option>
            <option value="solar">{t.comparison.sortSolar}</option>
            <option value="dte">{t.comparison.sortDte}</option>
            <option value="golden">{t.comparison.sortGolden}</option>
            <option value="default">{t.comparison.sortDefault}</option>
          </select>

          {/* Engineer Mode: PV Array Simulator Toggle & Export Buttons */}
          {mode === "eng" && (
            <button
              type="button"
              id="pv-array-toggle-btn"
              className={`hud-btn-mini pv-toggle-btn ${pvSimEnabled ? "active" : ""}`}
              aria-expanded={pvSimEnabled}
              onClick={() => setPvSimEnabled((prev) => !prev)}
              title={t.comparison.pvToggleTitle}
            >
              {t.comparison.pvToggleBtn}
            </button>
          )}

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
                    lang,
                    { area_m2: pvAreaM2, efficiency_pct: pvEfficiencyPct },
                  )
                }
                title={t.comparison.exportCsvTitle}
              >
                {t.comparison.exportCsvBtn}
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
                    lang,
                    { area_m2: pvAreaM2, efficiency_pct: pvEfficiencyPct },
                  )
                }
                title={t.comparison.exportPdfTitle}
              >
                {t.comparison.exportPdfBtn}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Engineer Mode Only: Interactive Photovoltaic Array Parameter Bar */}
      {mode === "eng" && pvSimEnabled && (
        <div className="pv-array-bar" role="region" aria-label={t.comparison.pvToggleBtn}>
          <div className="pv-control-group">
            <label htmlFor="pv-area-input" className="pv-control-label">
              {t.comparison.pvAreaLabel}
            </label>
            <input
              id="pv-area-input"
              type="number"
              step="0.1"
              min="0.1"
              max="500"
              className="hud-input mono-telemetry pv-number-input"
              value={pvAreaInput}
              onChange={(e) => {
                const raw = e.target.value;
                setPvAreaInput(raw);
                const parsed = Number.parseFloat(raw);
                if (!Number.isNaN(parsed) && parsed >= 0.1 && parsed <= 500) {
                  setPvAreaM2(parsed);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitPvArea(pvAreaInput);
                  e.currentTarget.blur();
                }
              }}
              onBlur={() => commitPvArea(pvAreaInput)}
              aria-label={t.comparison.pvAreaAria}
            />
            <span className="pv-unit-label">{t.comparison.pvAreaUnit}</span>

            <div className="pv-preset-chips">
              {[
                { area: 2.0, label: t.comparison.pvPresetRover },
                { area: 10.0, label: t.comparison.pvPresetLander },
                { area: 40.0, label: t.comparison.pvPresetBase },
              ].map((preset) => (
                <button
                  key={preset.area}
                  type="button"
                  className={`mast-chip-btn ${Math.abs(pvAreaM2 - preset.area) < 0.05 ? "active" : ""}`}
                  onClick={() => {
                    setPvAreaM2(preset.area);
                    setPvAreaInput(preset.area.toFixed(1));
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="pv-control-group">
            <label htmlFor="pv-efficiency-input" className="pv-control-label">
              {t.comparison.pvEffLabel}
            </label>
            <input
              id="pv-efficiency-input"
              type="number"
              step="0.5"
              min="5"
              max="45"
              className="hud-input mono-telemetry pv-number-input"
              style={{ width: "68px" }}
              value={pvEffInput}
              onChange={(e) => {
                const raw = e.target.value;
                setPvEffInput(raw);
                const parsed = Number.parseFloat(raw);
                if (!Number.isNaN(parsed) && parsed >= 5 && parsed <= 45) {
                  setPvEfficiencyPct(parsed);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitPvEff(pvEffInput);
                  e.currentTarget.blur();
                }
              }}
              onBlur={() => commitPvEff(pvEffInput)}
              aria-label={t.comparison.pvEffAria}
            />
            <span className="pv-unit-label">% ({t.comparison.pvEffNote})</span>
          </div>
        </div>
      )}

      {/* Curated sites selection bar + custom coordinate entry */}
      <div className="site-selector-bar">
        <div className="site-chips" role="group" aria-label={t.comparison.catalogAria}>
          {curatedSites.map((site) => {
            const isSelected = selectedSites.some((s) => s.site_id === site.id);
            const isFocused = selectedSites[focusedIndex]?.site_id === site.id;
            const localizedSite = getLocalizedSiteCopy(site, lang);
            const shortName = getShortSiteName(site, lang);
            return (
              <button
                key={site.id}
                type="button"
                className={`site-chip ${isSelected ? "selected" : ""} ${isFocused ? "focused" : ""}`}
                onClick={() => onToggleCuratedSite(site)}
                title={
                  isSelected
                    ? `${t.comparison.removeSiteChipTitlePrefix} ${localizedSite.name} ${t.comparison.removeSiteChipTitleSuffix}`
                    : `${t.comparison.addSiteChipTitlePrefix} ${localizedSite.name} (${site.lat_deg}°, ${site.lon_deg}°)`
                }
              >
                {!isSelected ? (
                  <>
                    <span className="site-chip-icon" aria-hidden="true">+</span>
                    <span>{shortName}</span>
                  </>
                ) : (
                  <>
                    <span>{shortName}</span>
                    <span className="site-chip-icon" aria-hidden="true">✕</span>
                  </>
                )}
              </button>
            );
          })}
        </div>

        {mode === "eng" && (
          <form onSubmit={handleCustomSubmit} style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                fontSize: "11px",
                fontWeight: 600,
                color: "var(--text-secondary)",
                whiteSpace: "nowrap",
              }}
            >
              <span>{t.comparison.latPlaceholder}</span>
              <input
                type="number"
                step="0.01"
                min="-90"
                max="90"
                className="hud-input mono-telemetry"
                style={{ width: "78px" }}
                value={customLat}
                onChange={(e) => setCustomLat(e.target.value)}
                aria-label={t.comparison.latAria}
                placeholder={t.comparison.latPlaceholder}
              />
            </label>
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                fontSize: "11px",
                fontWeight: 600,
                color: "var(--text-secondary)",
                whiteSpace: "nowrap",
              }}
            >
              <span>{t.comparison.lonPlaceholder}</span>
              <input
                type="number"
                step="0.01"
                min="-180"
                max="180"
                className="hud-input mono-telemetry"
                style={{ width: "82px" }}
                value={customLon}
                onChange={(e) => setCustomLon(e.target.value)}
                aria-label={t.comparison.lonAria}
                placeholder={t.comparison.lonPlaceholder}
              />
            </label>
            <button type="submit" className="hud-btn-mini" style={{ padding: "6px 10px" }}>
              {t.comparison.evaluateCoordBtn}
            </button>
          </form>
        )}
      </div>

      {/* Side-by-side (desktop) / swipeable (mobile) comparison cards */}
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
            <strong>{t.comparison.emptyTitle}</strong>
            <p style={{ margin: "6px 0 0", color: "var(--text-muted)", fontSize: "12px" }}>
              {mode === "edu" ? t.comparison.emptyEdu : t.comparison.emptyEng}
            </p>
          </div>
        )}
        {indexedSites.map(({ coord, index, key, metrics, assessment }) => {
          const curated = curatedSites.find((c) => c.id === coord.site_id);
          const localizedCurated = curated ? getLocalizedSiteCopy(curated, lang) : null;
          const displaySiteName = localizedCurated
            ? localizedCurated.name
            : `${t.comparison.customSiteTitle} (${coord.lat_deg.toFixed(2)}°, ${coord.lon_deg.toFixed(2)}°)`;
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
              ref={isFocused ? focusedCardRef : null}
              className={`site-card ${isFocused ? "focused" : ""}`}
              onClick={() => onFocusIndex(index)}
              aria-label={`${t.comparison.cardAriaPrefix} ${localizedCurated?.name ?? t.comparison.customSiteTitle}`}
            >
              {/* Mission Viability Verdict & Ranking (RF-02, RF-05) */}
              {assessment && (
                <div className={`viability-banner ${assessment.isWinner ? "winner" : "rank"}`}>
                  <div className="viability-badge-row">
                    <div className="viability-badge">
                      {assessment.isWinner ? (
                        <span>{t.comparison.optimalSiteBadge}</span>
                      ) : (
                        <span>#{assessment.rank} {t.comparison.viabilityRankLabel}</span>
                      )}
                    </div>
                    <span className="viability-score-num">
                      {assessment.score.toFixed(1)} {t.comparison.ptsUnit}
                    </span>
                  </div>
                  <p className="viability-reason">{assessment.verdictSummary}</p>
                </div>
              )}

              <div className="site-card-header">
                <div>
                  <h3 className="site-card-title">{displaySiteName}</h3>
                  <div className="mono-telemetry" style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                    Lat {coord.lat_deg.toFixed(4)}° · Lon {coord.lon_deg.toFixed(4)}°
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span className="category-tag">
                    {toSentenceCase(
                      curated
                        ? (t.comparison.categories[curated.category] ?? curated.category.replace("_", " "))
                        : (t.comparison.categories["custom"] ?? "custom"),
                    )}
                  </span>
                  <button
                    type="button"
                    className="hud-btn-mini card-remove-btn"
                    style={{
                      padding: "2px 7px",
                      fontSize: "11px",
                      lineHeight: 1.2,
                    }}
                    title={t.comparison.removeCardTitle}
                    aria-label={`${t.comparison.removeCardAriaPrefix} ${localizedCurated?.name ?? t.comparison.customSiteTitle} ${t.comparison.removeSiteChipTitleSuffix}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveSite(index);
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Direct view selector bar for 3D Viewer / LOLA 3D Map */}
              <div
                className={`card-view-bar ${isFocused ? (activeVisualSubview === "terrain3d" ? "terrain-active" : "focused") : ""}`}
              >
                {isFocused && activeVisualSubview === "terrain3d" ? (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      fontSize: "11.5px",
                      fontWeight: 700,
                      color: "var(--accent-emerald-text)",
                    }}
                  >
                    {t.comparison.showingInTerrain}
                  </span>
                ) : isFocused ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", gap: "6px", flexWrap: "wrap" }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "5px",
                        fontSize: "11.5px",
                        fontWeight: 700,
                        color: "var(--accent-blue-text)",
                      }}
                    >
                      {t.comparison.activeInViewer}
                    </span>
                    <button
                      type="button"
                      className="hud-btn-mini"
                      style={{
                        background: "linear-gradient(135deg, #0B3D91 0%, #1E62D0 100%)",
                        color: "#FFFFFF",
                        borderColor: "rgba(96, 165, 250, 0.65)",
                        fontWeight: 700,
                        padding: "4px 10px",
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onShowInTerrain3D?.(index);
                      }}
                      title={t.comparison.showInTerrainTitle}
                    >
                      {t.comparison.showInTerrainBtn}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="hud-btn-mini terrain-focus-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onShowInTerrain3D) {
                        onShowInTerrain3D(index);
                      } else {
                        onFocusIndex(index);
                      }
                    }}
                    title={t.comparison.focusAndShowInTerrainTitle}
                  >
                    {t.comparison.showInTerrainBtn}
                  </button>
                )}
              </div>

              {/* Interactive Solar Mast Height Selector (presets 0.5–3.5 m, free entry up to 100 m in Engineer Mode) */}
              <div className="mast-height-selector-row" onClick={(e) => e.stopPropagation()}>
                <div className="mast-height-label">
                  <span>{t.comparison.mastHeightLabel}</span>
                  <strong className="mono-telemetry" style={{ color: "var(--accent-blue-text)" }}>
                    h₀ = {coord.observer_height_m.toFixed(1)} m
                  </strong>
                </div>

                {mode === "edu" ? (
                  /* Educational Mode: Dropdown synchronized with HARDWARE_PROFILES (0.5 m to 3.5 m) */
                  (() => {
                    const presets = [
                      { h: 0.5, name: "0.5 m", label: "CSA LEAP" },
                      { h: 1.5, name: "1.5 m", label: "CSA Rover" },
                      { h: 2.0, name: "2.0 m", label: "Artemis EVA" },
                      { h: 2.2, name: "2.2 m", label: "Artemis LTV" },
                      { h: 3.5, name: "3.5 m", label: "CLPS Lander" },
                    ];
                    const clampedH = Number(coord.observer_height_m.toFixed(1));
                    const matchedPreset = presets.find((p) => Math.abs(p.h - clampedH) < 0.08);
                    const selectValue = matchedPreset ? matchedPreset.h : clampedH;
                    return (
                      <select
                        className="hud-select"
                        style={{ width: "100%", padding: "6px 10px", fontSize: "12px" }}
                        aria-label={`${t.comparison.mastHeightAriaPrefix} ${displaySiteName}`}
                        value={selectValue}
                        onChange={(e) => {
                          const nextH = Number.parseFloat(e.target.value);
                          if (!Number.isNaN(nextH)) {
                            onChangeSiteHeight?.(index, nextH);
                          }
                        }}
                      >
                        {!matchedPreset && (
                          <option value={clampedH}>
                            {clampedH.toFixed(1)} m
                          </option>
                        )}
                        {presets.map((opt) => (
                          <option key={opt.h} value={opt.h}>
                            {opt.name} ({opt.label})
                          </option>
                        ))}
                      </select>
                    );
                  })()
                ) : (
                  /* Engineer Mode: Free numeric input [0 .. 100 m] and quick HARDWARE_PROFILES presets */
                  <div className="mast-height-eng-box">
                    <div className="mast-height-input-row">
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="100"
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
                            e.currentTarget.blur();
                          }
                        }}
                        onBlur={() => {
                          handleCommitHeight(index, key, customHeights[key] ?? coord.observer_height_m.toString(), coord.observer_height_m);
                        }}
                        aria-label={`${t.comparison.customHeightAriaPrefix} ${displaySiteName}`}
                        placeholder="e.g. 12.0"
                      />
                      <button
                        type="button"
                        className="hud-btn-mini"
                        style={{ padding: "4px 8px", borderColor: "var(--nasa-blue-accent)" }}
                        onClick={() => handleCommitHeight(index, key, customHeights[key] ?? coord.observer_height_m.toString(), coord.observer_height_m)}
                        title={t.comparison.applyTitle}
                      >
                        {t.comparison.applyBtn}
                      </button>
                      <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                        {t.comparison.heightRangeHint}
                      </span>
                    </div>

                    <div className="mast-preset-chips" role="group" aria-label={t.comparison.heightPresetsAria}>
                      {[
                        { h: 0.5, label: "0.5m CSA LEAP" },
                        { h: 1.5, label: "1.5m CSA Rover" },
                        { h: 2.0, label: "2.0m Artemis EVA" },
                        { h: 2.2, label: "2.2m Artemis LTV" },
                        { h: 3.5, label: "3.5m CLPS Lander" },
                      ].map((preset) => {
                        const isActive = Math.abs(coord.observer_height_m - preset.h) < 0.05;
                        return (
                          <button
                            key={preset.h}
                            type="button"
                            className={`mast-chip-btn ${isActive ? "active" : ""}`}
                            onClick={() => {
                              onChangeSiteHeight?.(index, preset.h);
                              setCustomHeights((prev) => ({ ...prev, [key]: preset.h.toString() }));
                            }}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Instantaneous state at current time cursor */}
              {sample && (
                <div className="telemetry-Now-grid">
                  <div className="body-status-box sun-box">
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                      <strong>{t.comparison.sunTitle}</strong>
                      <span
                        className="mono-telemetry"
                        style={{
                          color:
                            sample.sun.state === "visible"
                              ? "var(--accent-amber-bright-text)"
                              : sample.sun.state === "partial"
                                ? "var(--accent-amber-text)"
                                : "var(--text-muted)",
                        }}
                      >
                        {sample.sun.state === "visible"
                          ? t.comparison.stateVisible
                          : sample.sun.state === "partial"
                            ? `${t.comparison.statePartial} ${(sample.sun.visible_fraction * 100).toFixed(0)}%`
                            : t.comparison.stateOcculted}
                      </span>
                    </div>
                    {mode === "eng" ? (
                      <div className="mono-telemetry" style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                        El {sample.sun.elevation_deg.toFixed(2)}° · Az {sample.sun.azimuth_deg.toFixed(1)}°
                        <br />
                        {t.comparison.clearanceLabel} {sample.sun.clearance_deg >= 0 ? "+" : ""}
                        {sample.sun.clearance_deg.toFixed(2)}°
                      </div>
                    ) : (
                      <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                        {sample.sun.visible_fraction > 0
                          ? t.comparison.sunPowerEdu
                          : t.comparison.sunShadowEdu}
                      </div>
                    )}
                  </div>

                  <div className="body-status-box earth-box">
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                      <strong>{t.comparison.earthTitle}</strong>
                      <span
                        className="mono-telemetry"
                        style={{
                          color:
                            sample.earth.clearance_deg >= 0
                              ? "var(--accent-cyan-text)"
                              : "var(--text-muted)",
                        }}
                      >
                        {sample.earth.clearance_deg >= 0 ? t.comparison.dteActiveBadge : t.comparison.dteNoLinkBadge}
                      </span>
                    </div>
                    {mode === "eng" ? (
                      <div className="mono-telemetry" style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                        El {sample.earth.elevation_deg.toFixed(2)}° · Az {sample.earth.azimuth_deg.toFixed(1)}°
                        <br />
                        {t.comparison.clearanceLabel} {sample.earth.clearance_deg >= 0 ? "+" : ""}
                        {sample.earth.clearance_deg.toFixed(2)}°
                      </div>
                    ) : (
                      <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                        {sample.earth.clearance_deg >= 0
                          ? t.comparison.dteAvailableEdu
                          : t.comparison.dteBlockedEdu}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Accumulated metrics bars over the window */}
              {metrics && (
                <>
                  <div className="kpi-bars">
                    <div className="kpi-row">
                      <div className="kpi-label-line">
                        <span>{t.comparison.kpiSun}</span>
                        <strong className="mono-telemetry">{sunPct}%</strong>
                      </div>
                      <div className="kpi-track">
                        <div className="kpi-fill solar" style={{ width: `${sunPct}%` }} />
                      </div>
                    </div>

                    <div className="kpi-row">
                      <div className="kpi-label-line">
                        <span>{t.comparison.kpiDte}</span>
                        <strong className="mono-telemetry">{dtePct}%</strong>
                      </div>
                      <div className="kpi-track">
                        <div className="kpi-fill dte" style={{ width: `${dtePct}%` }} />
                      </div>
                    </div>

                    <div className="kpi-row">
                      <div className="kpi-label-line">
                        <span>{t.comparison.kpiGolden}</span>
                        <strong className="mono-telemetry" style={{ color: "var(--accent-emerald-text)" }}>
                          {goldenPct}%
                        </strong>
                      </div>
                      <div className="kpi-track">
                        <div className="kpi-fill golden" style={{ width: `${goldenPct}%` }} />
                      </div>
                    </div>
                  </div>

                  {mode === "eng" && (
                    <>
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
                          {`${t.comparison.maxDarknessEng} ${metrics.longest_darkness_hours.toFixed(1)} h · ${t.comparison.meanSunElEng} ${metrics.mean_sun_elevation_deg.toFixed(2)}°`}
                        </span>
                        <span className="mono-telemetry">
                          {metrics.horizon_source === "spherical_analytical"
                            ? t.comparison.horizonSpherical
                            : t.comparison.horizonLolaDem}
                        </span>
                      </div>
                    </>
                  )}

                  {/* Advanced DTE Telecommunications Technical Panel (Engineer Mode only, RF-02, RF-05, RT-01) */}
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
                              {t.comparison.dteHeaderTitle}
                            </strong>
                          </div>
                          <span
                            className={`clearance-badge ${currentClearance >= 0 ? "clear" : "blocked"}`}
                            title={`${t.comparison.clearanceTitlePrefix} ${currentClearance >= 0 ? "+" : ""}${currentClearance.toFixed(2)}°`}
                          >
                            {currentClearance >= 0 ? t.comparison.badgeClear : t.comparison.badgeBlocked} ({currentClearance >= 0 ? "+" : ""}{currentClearance.toFixed(2)}°)
                          </span>
                        </div>

                        {isZeroDte ? (
                          <div className="dte-relay-alert">
                            <span style={{ fontSize: "15px" }}>🛰️</span>
                            <div>
                              <strong style={{ color: "var(--accent-danger-text)", fontSize: "11px" }}>{t.comparison.zeroDteTitle}</strong>
                              <p style={{ margin: "2px 0 0 0", fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.3 }}>
                                {t.comparison.zeroDteDesc}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <>
                            {/* Row 1: Antenna Pointing and Earth Libration Box */}
                            <div className="dte-telemetry-row">
                              <div className="dte-telemetry-cell">
                                <span className="dte-cell-label">{t.comparison.antennaPointingLabel}</span>
                                <span className="mono-telemetry dte-cell-val">
                                  Az {currentAz.toFixed(1)}° · El {currentEl >= 0 ? "+" : ""}{currentEl.toFixed(2)}°
                                </span>
                              </div>
                              <div className="dte-telemetry-cell">
                                <span className="dte-cell-label">{t.comparison.librationBoxLabel}</span>
                                <span
                                  className="mono-telemetry dte-cell-val"
                                  title={t.comparison.librationBoxTitle}
                                >
                                  ±{(dte.earth_azimuth_span_deg / 2).toFixed(1)}° Az · ±{(dte.earth_elevation_span_deg / 2).toFixed(1)}° El ({t.comparison.spanWord} {dte.libration_span_deg.toFixed(1)}°)
                                </span>
                              </div>
                            </div>

                            {/* Row 2: Distance, Latency (OWLT / RTT), and Min/Max Topographic Clearance */}
                            <div className="dte-telemetry-grid">
                              <div className="dte-grid-cell">
                                <span className="dte-grid-label">{t.comparison.earthDistanceLabel}</span>
                                <span className="mono-telemetry dte-grid-value">
                                  {dte.earth_distance_km.toLocaleString(lang === "es" ? "es-ES" : "en-US", { maximumFractionDigits: 0 })} km
                                </span>
                              </div>
                              <div className="dte-grid-cell">
                                <span className="dte-grid-label">{t.comparison.latencyLabel}</span>
                                <span
                                  className="mono-telemetry dte-grid-value"
                                  title={`${t.comparison.owltRttTitlePrefix} ${dte.one_way_light_time_s.toFixed(3)} s · ${t.comparison.owltRttMid} ${dte.round_trip_time_s.toFixed(3)} s`}
                                >
                                  {dte.one_way_light_time_s.toFixed(2)}s / {dte.round_trip_time_s.toFixed(2)}s
                                </span>
                              </div>
                              <div className="dte-grid-cell">
                                <span className="dte-grid-label">{t.comparison.minMaxClearanceLabel}</span>
                                <span className="mono-telemetry dte-grid-value">
                                  {dte.min_clearance_deg >= 0 ? "+" : ""}{dte.min_clearance_deg.toFixed(1)}° / +{dte.max_clearance_deg.toFixed(1)}°
                                </span>
                              </div>
                            </div>

                            {/* Row 3: FSPL Losses ITU-R P.525-4 (S, X, and Ka Bands) */}
                            <div className="dte-fspl-row">
                              <span className="dte-fspl-title">{t.comparison.fsplTitle}</span>
                              <div className="dte-fspl-chips">
                                <span className="dte-fspl-chip" title={t.comparison.sBandTitle}>
                                  {t.comparison.sBandChip} <strong>{dte.fspl_s_band_db.toFixed(1)} dB</strong>
                                </span>
                                <span className="dte-fspl-chip highlight-x" title={t.comparison.xBandTitle}>
                                  {t.comparison.xBandChip} <strong>{dte.fspl_x_band_db.toFixed(1)} dB</strong>
                                </span>
                                <span className="dte-fspl-chip highlight-ka" title={t.comparison.kaBandTitle}>
                                  {t.comparison.kaBandChip} <strong>{dte.fspl_ka_band_db.toFixed(1)} dB</strong>
                                </span>
                              </div>
                            </div>

                            {/* Row 4: Max Continuous DTE Blackout and Golden Window Hours */}
                            <div className="dte-window-stats">
                              <div className="dte-stat-item">
                                <span className="dte-stat-label">{t.comparison.maxBlackoutLabel}</span>
                                <strong
                                  className="mono-telemetry"
                                  style={{ color: dte.longest_comms_blackout_hours > 0 ? "var(--accent-danger-text)" : "var(--accent-emerald-text)" }}
                                >
                                  {dte.longest_comms_blackout_hours > 0
                                    ? `${dte.longest_comms_blackout_hours.toFixed(1)} h`
                                    : t.comparison.continuous100}
                                </strong>
                              </div>
                              <div className="dte-stat-item">
                                <span className="dte-stat-label">{t.comparison.goldenWindowLabel}</span>
                                <strong className="mono-telemetry" style={{ color: "var(--accent-emerald-text)" }}>
                                  {dte.simultaneous_sun_earth_hours.toFixed(1)} {t.comparison.netHoursUnit}
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

              {/* Solar Energy & Optimal Azimuth Module (RF-05, MATH_MODELS §5) - Engineer Mode Only */}
              {mode === "eng" && solar && (() => {
                const optimalAz = normalizeAzimuthDeg(solar.optimal_azimuth.optimal_panel_azimuth_deg);
                const optimalCardinal = azimuthToCardinal(optimalAz);
                const optimalEnergy = solar.optimal_azimuth.optimal_fixed_energy_kwh_m2;
                const currentManualAz = normalizeAzimuthDeg(manualAzimuths[key] ?? optimalAz);
                const currentManualCardinal = azimuthToCardinal(currentManualAz);
                const currentManualEnergy = solar.optimal_azimuth.azimuth_energy_curve_kwh_m2[currentManualAz] ?? 0;
                const trackingEnergy = solar.tracking_vertical_panel.total_energy_kwh_m2;
                const horizontalEnergy = solar.horizontal_panel.total_energy_kwh_m2;

                const fixedVsTrackingPct = trackingEnergy > 0 ? ((currentManualEnergy / trackingEnergy) * 100).toFixed(1) : "0.0";
                const multiplierVsHorizontal = horizontalEnergy > 0.01
                  ? (currentManualEnergy / horizontalEnergy).toFixed(1) + "x"
                  : currentManualEnergy > 0 ? t.comparison.infGroundZero : "1.0x";
                const diffFromOptimal = currentManualEnergy - optimalEnergy;
                const pctLossNum = optimalEnergy > 0 ? ((currentManualEnergy - optimalEnergy) / optimalEnergy) * 100 : 0;
                const pctLossRounded = Number(pctLossNum.toFixed(1));
                const diffRounded = Number(diffFromOptimal.toFixed(1));
                const pctLoss = pctLossNum.toFixed(1);
                const isAlignedWithOptimal =
                  currentManualAz === optimalAz ||
                  (optimalEnergy > 0 && (currentManualEnergy >= optimalEnergy - 1e-4 || (pctLossRounded === 0 && diffRounded === 0)));
                const showMisalignmentWarning =
                  !isAlignedWithOptimal &&
                  optimalEnergy > 0 &&
                  (Math.abs(pctLossRounded) > 0 || Math.abs(diffRounded) > 0);
                const isTotalShadow =
                  (solar.optimal_azimuth.optimal_fixed_energy_kwh_m2 === 0 &&
                    solar.tracking_vertical_panel.total_energy_kwh_m2 === 0) ||
                  (metrics?.sunlit_fraction === 0.0);

                const netFixed = computeNetElectricalOutput(currentManualEnergy, pvAreaM2, pvEfficiencyPct, windowDays);
                const netTracking = computeNetElectricalOutput(trackingEnergy, pvAreaM2, pvEfficiencyPct, windowDays);
                const netHorizontal = computeNetElectricalOutput(horizontalEnergy, pvAreaM2, pvEfficiencyPct, windowDays);

                return (
                  <div className="solar-energy-section" onClick={(e) => e.stopPropagation()}>
                    <div className="solar-energy-header">
                      <strong style={{ fontSize: "11px", color: "var(--accent-amber-bright-text)" }}>
                        {t.comparison.solarHeaderPrefix} ({solar.solar_constant_am0_w_m2.toFixed(0)} W/m²)
                      </strong>
                      <button
                        type="button"
                        className="solar-optimal-badge clickable"
                        onClick={() => setManualAzimuths((prev) => ({ ...prev, [key]: optimalAz }))}
                        title={`${t.comparison.optimalAzimuthTitle} · ${t.comparison.compassClickToPointPrefix} ${optimalAz}°`}
                      >
                        {t.comparison.optimalAzimuthBadgePrefix} {optimalAz}° {optimalCardinal}
                      </button>
                    </div>

                    {/* Polar night / permanent shadow alert */}
                    {isTotalShadow && (
                      <div className="solar-total-shadow-banner">
                        <strong className="mono-telemetry" style={{ color: "var(--accent-danger-text)", fontSize: "11px" }}>
                          {t.comparison.totalShadowTitle}
                        </strong>
                        <p style={{ margin: "2px 0 0", fontSize: "10.5px", color: "var(--text-secondary)" }}>
                          {t.comparison.totalShadowDesc}
                        </p>
                      </div>
                    )}

                    {/* Comparison of the 3 panel architectures */}
                    <div className="solar-architectures-list">
                      {/* 1. Fixed Vertical Panel */}
                      <div className={`solar-arch-row ${isAlignedWithOptimal ? "optimal-highlight" : ""}`}>
                        <div className="solar-arch-top">
                          <span className="solar-arch-title">
                            {t.comparison.fixedVerticalLabel} ({currentManualAz}° {currentManualCardinal})
                            {isAlignedWithOptimal && <span style={{ color: "var(--accent-amber-bright-text)", fontSize: "10px", fontWeight: 700 }}> {t.comparison.starOptimal}</span>}
                          </span>
                          <div className="solar-arch-values">
                            <span className="solar-kwh-value">{currentManualEnergy.toFixed(1)} kWh/m²</span>
                            <span className="solar-efficiency-tag gold">
                              {fixedVsTrackingPct}{t.comparison.ofTracking}
                            </span>
                          </div>
                        </div>
                        {pvSimEnabled && (
                          <div className="pv-net-output-row highlight">
                            <span>{t.comparison.pvNetBadgePrefix} ({pvAreaM2.toFixed(1)} m² · {pvEfficiencyPct}%)</span>
                            <strong className="mono-telemetry">
                              {netFixed.energy_kwh.toFixed(1)} {t.comparison.pvNetElectricalUnit} ({formatMeanPower(netFixed.mean_power_w)} {t.comparison.pvMeanPowerSuffix})
                            </strong>
                          </div>
                        )}
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "var(--text-muted)" }}>
                          <span>{t.comparison.advantageVsFlatLabel}</span>
                          <strong style={{ color: "var(--accent-emerald-text)" }}>
                            {currentManualEnergy > horizontalEnergy ? `+${(currentManualEnergy - horizontalEnergy).toFixed(1)} kWh/m² (${multiplierVsHorizontal})` : t.comparison.equivalentLabel}
                          </strong>
                        </div>
                      </div>

                      {/* 2. 360° Tracking Vertical Panel */}
                      <div className="solar-arch-row">
                        <div className="solar-arch-top">
                          <span className="solar-arch-title">{t.comparison.verticalTrackingLabel}</span>
                          <div className="solar-arch-values">
                            <span className="solar-kwh-value">{trackingEnergy.toFixed(1)} kWh/m²</span>
                            <span className="solar-efficiency-tag cyan">{t.comparison.ceiling100}</span>
                          </div>
                        </div>
                        {pvSimEnabled && (
                          <div className="pv-net-output-row">
                            <span>{t.comparison.pvNetBadgePrefix}</span>
                            <strong className="mono-telemetry">
                              {netTracking.energy_kwh.toFixed(1)} {t.comparison.pvNetElectricalUnit} ({formatMeanPower(netTracking.mean_power_w)} {t.comparison.pvMeanPowerSuffix})
                            </strong>
                          </div>
                        )}
                        <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                          {`${t.comparison.peakLabel} ${solar.tracking_vertical_panel.peak_flux_w_m2.toFixed(1)} W/m² · ${t.comparison.meanLabel} ${solar.tracking_vertical_panel.mean_flux_w_m2.toFixed(1)} W/m²`}
                        </div>
                      </div>

                      {/* 3. Horizontal Panel on ground */}
                      <div className="solar-arch-row">
                        <div className="solar-arch-top">
                          <span className="solar-arch-title">{t.comparison.horizontalGroundLabel}</span>
                          <div className="solar-arch-values">
                            <span className="solar-kwh-value">{horizontalEnergy.toFixed(1)} kWh/m²</span>
                            <span className="solar-efficiency-tag slate">
                              {trackingEnergy > 0 ? ((horizontalEnergy / trackingEnergy) * 100).toFixed(1) : "0"}%
                            </span>
                          </div>
                        </div>
                        {pvSimEnabled && (
                          <div className="pv-net-output-row">
                            <span>{t.comparison.pvNetBadgePrefix}</span>
                            <strong className="mono-telemetry">
                              {netHorizontal.energy_kwh.toFixed(1)} {t.comparison.pvNetElectricalUnit} ({formatMeanPower(netHorizontal.mean_power_w)} {t.comparison.pvMeanPowerSuffix})
                            </strong>
                          </div>
                        )}
                        <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                          {`${t.comparison.peakLabel} ${solar.horizontal_panel.peak_flux_w_m2.toFixed(1)} W/m² · ${t.comparison.meanLabel} ${solar.horizontal_panel.mean_flux_w_m2.toFixed(1)} W/m²`}
                        </div>
                      </div>
                    </div>

                    {/* Interactive Manual Azimuth Selector */}
                    <div className="solar-slider-container">
                      <div className="solar-slider-header">
                        <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>
                          {t.comparison.manualOrientationLabel}
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <strong
                            className="mono-telemetry"
                            style={{
                              color: isAlignedWithOptimal ? "var(--accent-amber-bright-text)" : "var(--text-primary)",
                              fontWeight: 700,
                            }}
                          >
                            {currentManualAz}° {currentManualCardinal}
                          </strong>
                          {!isAlignedWithOptimal && (
                            <button
                              type="button"
                              className="hud-btn-mini"
                              style={{ padding: "1px 6px", fontSize: "10px", borderColor: "var(--solar-amber)" }}
                              onClick={() => setManualAzimuths((prev) => ({ ...prev, [key]: optimalAz }))}
                              title={t.comparison.resetOptimalTitle}
                            >
                              {t.comparison.resetOptimalBtnPrefix} {optimalAz}°
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Interactive SVG Solar Compass */}
                      <SolarAzimuthCompass
                        panelAzimuthDeg={currentManualAz}
                        optimalAzimuthDeg={optimalAz}
                        sunAzimuthDeg={sample?.sun.azimuth_deg ?? null}
                        earthAzimuthDeg={sample?.earth.azimuth_deg ?? null}
                        horizonProfile={horizonByKey?.[key]}
                        samples={seriesByKey?.[key]?.samples}
                        isTotalShadow={isTotalShadow}
                        onSelectAzimuth={(azDeg) =>
                          setManualAzimuths((prev) => ({ ...prev, [key]: normalizeAzimuthDeg(azDeg) }))
                        }
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
                        aria-label={`${t.comparison.adjustAzimuthAriaPrefix} ${displaySiteName}`}
                      />

                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "var(--text-muted)" }}>
                        <span>0° N</span>
                        <span>90° E</span>
                        <span>180° S</span>
                        <span>{t.comparison.compassWLabel}</span>
                        <span>359°</span>
                      </div>

                      {showMisalignmentWarning && (
                        <div style={{ fontSize: "10px", color: "var(--accent-danger-text)", textAlign: "right", fontWeight: 600 }}>
                          {t.comparison.misalignmentPrefix} {pctLoss}% ({diffFromOptimal.toFixed(1)} kWh/m² {t.comparison.misalignmentVsOpt})
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Deep links to LROC QuickMap (new domain) and NASA Moon Trek */}
              <div className="portal-links-row" onClick={(ev) => ev.stopPropagation()}>
                <a
                  href={links.quickmap_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="portal-link"
                  title={t.comparison.quickmapTitle}
                >
                  {t.comparison.quickmapBtn}
                </a>
                <a
                  href={links.moontrek_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="portal-link"
                  title={t.comparison.moontrekTitle}
                >
                  {t.comparison.moontrekBtn}
                </a>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
