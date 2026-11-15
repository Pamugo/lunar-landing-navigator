import { useState } from "react";
import { useLanguage } from "../i18n/LanguageContext";
import { getShortSiteName } from "../i18n/translations";
import type { CuratedSite, HorizonProfile, LunarCoordinate, VisibilitySample } from "../types/contracts";
import type { AppMode } from "./HeaderHUD";

export interface HorizonDomeProps {
  profile: HorizonProfile | null;
  currentSample: VisibilitySample | null;
  mode: AppMode;
  hasSelection?: boolean;
  curatedSites?: CuratedSite[];
  selectedSites?: LunarCoordinate[];
  focusedIndex?: number;
  onSelectSiteIndex?: (index: number) => void;
}

const EXAGGERATION_OPTIONS = [1, 5, 10, 20] as const;

export function HorizonDome({
  profile,
  currentSample,
  mode,
  hasSelection = true,
  curatedSites = [],
  selectedSites = [],
  focusedIndex = 0,
  onSelectSiteIndex,
}: HorizonDomeProps) {
  const [verticalExaggeration, setVerticalExaggeration] = useState<number>(1);
  const { lang, t } = useLanguage();

  if (!profile) {
    return (
      <div className="viewport-stage" style={{ display: "grid", placeItems: "center", padding: "16px", textAlign: "center" }}>
        <span className="mono-telemetry" style={{ color: "var(--text-secondary)" }}>
          {hasSelection ? t.dome.loading : t.dome.noSiteSelected}
        </span>
      </div>
    );
  }

  const hasSiteSelector = selectedSites.length > 0 && Boolean(onSelectSiteIndex);
  const width = 760;
  const height = 360;
  const padLeft = 46;
  const padRight = 18;
  const padTop = hasSiteSelector ? 82 : 46;
  const padBottom = 46;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  // Angular range up to +90° at ×1, with progressive zoom-in for ×5, ×10, ×20
  const scaleConfig =
    verticalExaggeration === 1
      ? { minEl: -15.0, maxEl: 90.0, ticks: [-15, 0, 15, 30, 45, 60, 75, 90] }
      : verticalExaggeration === 5
        ? { minEl: -6.0, maxEl: 24.0, ticks: [-6, 0, 6, 12, 18, 24] }
        : verticalExaggeration === 10
          ? { minEl: -4.0, maxEl: 12.0, ticks: [-3, 0, 3, 6, 9, 12] }
          : { minEl: -3.0, maxEl: 6.0, ticks: [-3, -1, 0, 1, 2, 3, 4, 5, 6] };
  const { minEl, maxEl, ticks: referenceTicks } = scaleConfig;

  const azToX = (az_deg: number) => padLeft + ((az_deg % 360) / 360.0) * plotW;
  const elToY = (el_deg: number) => {
    const clamped = Math.max(minEl, Math.min(maxEl, el_deg));
    const norm = (clamped - minEl) / (maxEl - minEl);
    return padTop + plotH * (1.0 - norm);
  };

  const zeroY = elToY(0.0);

  // Build 360° LOLA topographic silhouette polygon
  const pts = profile.azimuths_deg.map((az, idx) => {
    const el = profile.horizon_elevation_deg[idx] ?? 0.0;
    return `${azToX(az).toFixed(1)},${elToY(el).toFixed(1)}`;
  });
  const polygonPoints = [
    `${padLeft},${padTop + plotH}`,
    ...pts,
    `${padLeft + plotW},${padTop + plotH}`,
  ].join(" ");

  const polylinePoints = pts.join(" ");

  const sourceBadge =
    profile.horizon_source === "spherical_analytical"
      ? t.dome.sphericalFallback
      : `${t.dome.lolaPolarDem} (${profile.dem_product})`;

  return (
    <div className="viewport-stage" aria-label={t.dome.stageAria}>
      <div className="viewport-overlay-top" style={{ flexDirection: "column", alignItems: "stretch", gap: "6px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px", flexWrap: "wrap" }}>
          {mode === "eng" ? (
            <div className="hud-pill">
              <span>{t.dome.topographicSourceLabel}</span>
              <strong className="mono-telemetry" style={{ color: "#38BDF8" }}>
                {sourceBadge}
              </strong>
            </div>
          ) : (
            <div />
          )}

          <div className="hud-pill" role="group" aria-label={t.dome.exaggerationAria}>
            <span>{t.dome.verticalScaleLabel} ×{verticalExaggeration}:</span>
            {EXAGGERATION_OPTIONS.map((factor) => (
              <button
                key={factor}
                type="button"
                className={`hud-btn-mini ${verticalExaggeration === factor ? "active" : ""}`}
                onClick={() => setVerticalExaggeration(factor)}
              >
                ×{factor}
              </button>
            ))}
          </div>
        </div>

        {selectedSites.length > 0 && onSelectSiteIndex && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              flexWrap: "wrap",
              background: "rgba(11, 15, 25, 0.88)",
              backdropFilter: "blur(8px)",
              padding: "5px 9px",
              borderRadius: "6px",
              border: "1px solid rgba(56, 189, 248, 0.28)",
            }}
          >
            <span style={{ fontSize: "11px", fontWeight: 700, color: "#93C5FD" }}>
              {t.dome.siteSelectorLabel}
            </span>
            {selectedSites.map((coord, idx) => {
              const cur = curatedSites.find((s) => s.id === coord.site_id);
              const label = cur
                ? getShortSiteName(cur, lang)
                : `${t.terrain.customSiteShort} (${coord.lat_deg.toFixed(2)}°, ${coord.lon_deg.toFixed(2)}°)`;
              const isActive = idx === focusedIndex;
              return (
                <button
                  key={`${coord.site_id ?? "custom"}_${coord.lat_deg}_${coord.lon_deg}_${idx}`}
                  type="button"
                  className={`hud-btn-mini ${isActive ? "active" : ""}`}
                  style={
                    isActive
                      ? {
                          background: "linear-gradient(135deg, #059669 0%, #10B981 100%)",
                          color: "#FFFFFF",
                          borderColor: "#34D399",
                          fontWeight: 700,
                        }
                      : undefined
                  }
                  onClick={() => onSelectSiteIndex(idx)}
                >
                  {isActive ? "👁️ " : ""}
                  {label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: "100%", height: "100%", display: "block" }}
        role="img"
        aria-label={t.dome.svgAria}
      >
        <defs>
          <linearGradient id="terrainFillGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#334155" stopOpacity="0.92" />
            <stop offset="100%" stopColor="#0F172A" stopOpacity="0.98" />
          </linearGradient>
        </defs>

        {/* Horizontal elevation reference lines */}
        {referenceTicks.map((deg) => {
          if (deg < minEl || deg > maxEl) return null;
          const y = elToY(deg);
          return (
            <g key={deg}>
              <line
                x1={padLeft}
                y1={y}
                x2={padLeft + plotW}
                y2={y}
                stroke={deg === 0 ? "rgba(255,255,255,0.28)" : "rgba(148,163,184,0.12)"}
                strokeDasharray={deg === 0 ? "4 3" : undefined}
              />
              <text
                x={padLeft - 6}
                y={y + 4}
                textAnchor="end"
                fill="#94A3B8"
                fontSize="10"
                fontFamily="var(--font-mono)"
              >
                {deg > 0 ? `+${deg}°` : `${deg}°`}
              </text>
            </g>
          );
        })}

        {/* Cardinal points N / E / S / W */}
        {[
          { az: 0, label: t.dome.cardinalN0 },
          { az: 90, label: t.dome.cardinalE90 },
          { az: 180, label: t.dome.cardinalS180 },
          { az: 270, label: t.dome.cardinalW270 },
          { az: 360, label: t.dome.cardinalN360 },
        ].map((card) => {
          const x = azToX(card.az === 360 ? 359.99 : card.az);
          return (
            <g key={card.az}>
              <line
                x1={x}
                y1={padTop}
                x2={x}
                y2={padTop + plotH}
                stroke="rgba(148,163,184,0.14)"
              />
              <text
                x={x}
                y={padTop + plotH + 14}
                textAnchor="middle"
                fill="#CBD5E1"
                fontSize="10"
                fontFamily="var(--font-mono)"
              >
                {card.label}
              </text>
            </g>
          );
        })}

        {/* Solar Disk (drawn before terrain so it is occluded when below the horizon) */}
        {currentSample && (
          <g>
            <circle
              cx={azToX(currentSample.sun.azimuth_deg)}
              cy={elToY(currentSample.sun.elevation_deg)}
              r={Math.max(7, currentSample.sun.angular_radius_deg * 18)}
              fill="#FBBF24"
              stroke="#FEF08A"
              strokeWidth="2"
            />
            <text
              x={azToX(currentSample.sun.azimuth_deg)}
              y={elToY(currentSample.sun.elevation_deg) - 12}
              textAnchor="middle"
              fill="#FBBF24"
              fontSize="11"
              fontWeight="bold"
              fontFamily="var(--font-mono)"
            >
              ☀ {t.dome.sunWord} ({currentSample.sun.elevation_deg.toFixed(2)}°)
            </text>
          </g>
        )}

        {/* Earth disk (DTE) */}
        {currentSample && (
          <g>
            <circle
              cx={azToX(currentSample.earth.azimuth_deg)}
              cy={elToY(currentSample.earth.elevation_deg)}
              r={Math.max(10, currentSample.earth.angular_radius_deg * 11)}
              fill="#38BDF8"
              stroke="#E0F2FE"
              strokeWidth="2"
            />
            <text
              x={azToX(currentSample.earth.azimuth_deg)}
              y={elToY(currentSample.earth.elevation_deg) - 15}
              textAnchor="middle"
              fill="#38BDF8"
              fontSize="11"
              fontWeight="bold"
              fontFamily="var(--font-mono)"
            >
              🜨 {t.dome.earthWord} ({currentSample.earth.elevation_deg.toFixed(2)}°)
            </text>
          </g>
        )}

        {/* LOLA 360° Topographic Silhouette */}
        <polygon points={polygonPoints} fill="url(#terrainFillGrad)" />
        <polyline
          points={polylinePoints}
          fill="none"
          stroke="#93C5FD"
          strokeWidth="1.8"
        />

        {/* 0 deg reference line above for engineer reference */}
        <line
          x1={padLeft}
          y1={zeroY}
          x2={padLeft + plotW}
          y2={zeroY}
          stroke="rgba(255,255,255,0.22)"
          strokeDasharray="3 3"
        />
      </svg>

      <div className="viewport-overlay-bottom">
        <span className="hud-pill" style={{ gap: "10px", flexWrap: "wrap" }}>
          <span style={{ color: "#FBBF24", fontWeight: 700 }}>● ☀ {t.dome.sunWord}</span>
          <span style={{ color: "#38BDF8", fontWeight: 700 }}>● 🜨 {t.dome.earthWord}</span>
          <span style={{ color: "#93C5FD", fontWeight: 700 }}>━ {t.dome.horizonLineLegend}</span>
        </span>
        <span className="hud-pill">
          {t.dome.windowStartLegend}
        </span>
      </div>
    </div>
  );
}
