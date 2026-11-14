import { useState } from "react";
import type { HorizonProfile, VisibilitySample } from "../types/contracts";
import type { AppMode } from "./HeaderHUD";

export interface HorizonDomeProps {
  profile: HorizonProfile | null;
  currentSample: VisibilitySample | null;
  mode: AppMode;
}

const EXAGGERATION_OPTIONS = [1, 5, 10, 20] as const;

export function HorizonDome({ profile, currentSample, mode }: HorizonDomeProps) {
  const [verticalExaggeration, setVerticalExaggeration] = useState<number>(10);

  if (!profile) {
    return (
      <div className="viewport-stage" style={{ display: "grid", placeItems: "center" }}>
        <span className="mono-telemetry">Cargando perfil de horizonte 360°...</span>
      </div>
    );
  }

  const width = 760;
  const height = 360;
  const padLeft = 46;
  const padRight = 18;
  const padTop = 36;
  const padBottom = 34;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  // Rango angular base [-12°, +24°] escalado por la exageracion vertical seleccionada
  const minEl = -12.0 / Math.max(1, verticalExaggeration * 0.35);
  const maxEl = 24.0 / Math.max(1, verticalExaggeration * 0.35);

  const azToX = (az_deg: number) => padLeft + ((az_deg % 360) / 360.0) * plotW;
  const elToY = (el_deg: number) => {
    const clamped = Math.max(minEl, Math.min(maxEl, el_deg));
    const norm = (clamped - minEl) / (maxEl - minEl);
    return padTop + plotH * (1.0 - norm);
  };

  const zeroY = elToY(0.0);

  // Construir poligono de silueta topografica LOLA 360°
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
      ? "Fallback Esférico Analítico (R = 1737.4 km)"
      : `LOLA Polar DEM (${profile.dem_product})`;

  return (
    <div className="viewport-stage" aria-label="Cupula panoramica 360 grados del horizonte local">
      <div className="viewport-overlay-top">
        <div className="hud-pill">
          <span>Fuente Topográfica:</span>
          <strong className="mono-telemetry" style={{ color: "#38BDF8" }}>
            {sourceBadge}
          </strong>
        </div>

        <div className="hud-pill" role="group" aria-label="Selector de exageracion vertical">
          <span>Escala vertical ×{verticalExaggeration}:</span>
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

      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: "100%", height: "100%", display: "block" }}
        role="img"
        aria-label="Perfil de horizonte 360 grados con posicion del Sol y la Tierra"
      >
        <defs>
          <linearGradient id="terrainFillGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#334155" stopOpacity="0.92" />
            <stop offset="100%" stopColor="#0F172A" stopOpacity="0.98" />
          </linearGradient>
        </defs>

        {/* Lineas horizontales de elevacion */}
        {[-6, -3, 0, 3, 6, 12].map((deg) => {
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

        {/* Puntos cardinales N / E / S / W */}
        {[
          { az: 0, label: "N (0° · Cara Visible)" },
          { az: 90, label: "E (90°)" },
          { az: 180, label: "S (180° · Polo)" },
          { az: 270, label: "W (270°)" },
          { az: 360, label: "N (360°)" },
        ].map((card) => {
          const x = azToX(card.az === 360 ? 359.99 : card.az);
          return (
            <g key={card.label}>
              <line
                x1={x}
                y1={padTop}
                x2={x}
                y2={padTop + plotH}
                stroke="rgba(148,163,184,0.14)"
              />
              <text
                x={x}
                y={height - 10}
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

        {/* Disco Solar (antes del terreno para que quede oculto si baja del horizonte) */}
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
              ☀ Sol ({currentSample.sun.elevation_deg.toFixed(2)}°)
            </text>
          </g>
        )}

        {/* Disco Terrestre DTE */}
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
              🜨 Tierra ({currentSample.earth.elevation_deg.toFixed(2)}°)
            </text>
          </g>
        )}

        {/* Silueta Topografica LOLA 360° */}
        <polygon points={polygonPoints} fill="url(#terrainFillGrad)" />
        <polyline
          points={polylinePoints}
          fill="none"
          stroke="#93C5FD"
          strokeWidth="1.8"
        />

        {/* Linea de referencia 0 deg encima para referencia de ingeniero */}
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
        <span className="hud-pill mono-telemetry">
          Cota DEM: {profile.site_elevation_m.toFixed(0)} m · Mástil: +{profile.site.observer_height_m.toFixed(1)} m
        </span>
        <span className="hud-pill">
          {mode === "edu"
            ? "Si el Sol o la Tierra bajan de la silueta gris, las montañas los tapan"
            : `Escala vertical ×${verticalExaggeration} · Sin refracción atmosférica (R = 1737.4 km)`}
        </span>
      </div>
    </div>
  );
}
