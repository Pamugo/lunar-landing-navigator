import { useLanguage } from "../i18n/LanguageContext";
import { getShortSiteName } from "../i18n/translations";
import type { CuratedSite, LunarCoordinate } from "../types/contracts";
import type { AppMode } from "./HeaderHUD";

export interface PolarMap2DProps {
  sites: CuratedSite[];
  selectedSiteIds: string[];
  focusedSite: LunarCoordinate;
  mode?: AppMode;
  onSelectCuratedSite: (siteId: string) => void;
  onSelectCustomCoordinate: (lat_deg: number, lon_deg: number) => void;
}

const R_MOON_M = 1_737_400.0;
const MAX_RHO_M = 2.0 * R_MOON_M * Math.tan(Math.PI / 4.0 + (-80.0 * Math.PI) / 360.0); // ~304 km (80°S)

function latLonToSvgXY(lat_deg: number, lon_deg: number, cx: number, cy: number, radiusPx: number) {
  const clampedLat = Math.min(-80.0, Math.max(-90.0, lat_deg));
  const latRad = (clampedLat * Math.PI) / 180.0;
  const lonRad = (lon_deg * Math.PI) / 180.0;
  const rho = 2.0 * R_MOON_M * Math.tan(Math.PI / 4.0 + latRad / 2.0);
  const norm = rho / MAX_RHO_M;
  const x = cx + norm * radiusPx * Math.sin(lonRad);
  const y = cy - norm * radiusPx * Math.cos(lonRad);
  return { x, y };
}

export function PolarMap2D({
  sites,
  selectedSiteIds,
  focusedSite,
  mode = "eng",
  onSelectCuratedSite,
  onSelectCustomCoordinate,
}: PolarMap2DProps) {
  const { lang, t } = useLanguage();
  const size = 360;
  const cx = size / 2;
  const cy = size / 2;
  const radiusPx = 142;

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = ((e.clientX - rect.left) / rect.width) * size;
    const sy = ((e.clientY - rect.top) / rect.height) * size;
    const dx = sx - cx;
    const dy = cy - sy;
    const rNorm = Math.hypot(dx, dy) / radiusPx;
    if (rNorm > 1.05) return;
    const rho = Math.min(1.0, rNorm) * MAX_RHO_M;
    const latRad = -(Math.PI / 2.0 - 2.0 * Math.atan(rho / (2.0 * R_MOON_M)));
    const lonRad = Math.atan2(dx, dy);
    onSelectCustomCoordinate(
      Number(((latRad * 180.0) / Math.PI).toFixed(4)),
      Number(((lonRad * 180.0) / Math.PI).toFixed(4)),
    );
  };

  const polarSites = sites.filter((s) => s.lat_deg <= -80.0);

  return (
    <div className="viewport-stage" aria-label={t.polarMap.stageAria}>
      <div className="viewport-overlay-top">
        <span className="hud-pill mono-telemetry">
          {t.polarMap.projectionLabel}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${size} ${size}`}
        style={{ width: "100%", height: "100%", cursor: "crosshair" }}
        onClick={handleSvgClick}
      >
        {/* Latitude rings 82°S, 85°S, 88°S, 90°S */}
        {[-80, -82, -85, -88].map((lat) => {
          const { y } = latLonToSvgXY(lat, 0, cx, cy, radiusPx);
          const r = Math.abs(cy - y);
          return (
            <g key={lat}>
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke="rgba(148,163,184,0.22)"
                strokeDasharray={lat === -85 ? "3 3" : undefined}
              />
              <text
                x={cx + 4}
                y={cy - r + 11}
                fill="#94A3B8"
                fontSize="9"
                fontFamily="var(--font-mono)"
              >
                {Math.abs(lat)}°S
              </text>
            </g>
          );
        })}

        {/* Meridian axes (0° Near Side upward, 90°E, 180° Far Side, 90°W) */}
        <line x1={cx} y1={cy - radiusPx} x2={cx} y2={cy + radiusPx} stroke="rgba(148,163,184,0.2)" />
        <line x1={cx - radiusPx} y1={cy} x2={cx + radiusPx} y2={cy} stroke="rgba(148,163,184,0.2)" />
        <text x={cx} y={cy - radiusPx - 6} textAnchor="middle" fill="#38BDF8" fontSize="10" fontFamily="var(--font-mono)">
          {t.polarMap.towardEarth}
        </text>
        <text x={cx} y={cy + radiusPx + 14} textAnchor="middle" fill="#94A3B8" fontSize="10" fontFamily="var(--font-mono)">
          {t.polarMap.farSide}
        </text>

        {/* Polar sites */}
        {polarSites.map((s) => {
          const { x, y } = latLonToSvgXY(s.lat_deg, s.lon_deg, cx, cy, radiusPx);
          const isFocused = focusedSite.site_id === s.id;
          const isSelected = selectedSiteIds.includes(s.id);
          return (
            <g
              key={s.id}
              onClick={(ev) => {
                ev.stopPropagation();
                onSelectCuratedSite(s.id);
              }}
              style={{ cursor: "pointer" }}
            >
              <circle
                cx={x}
                cy={y}
                r={isFocused ? 7 : isSelected ? 5.5 : 4.5}
                fill={isFocused ? "#FBBF24" : isSelected ? "#38BDF8" : "#94A3B8"}
                stroke="#0B0F19"
                strokeWidth="1.5"
              />
              <text
                x={x + 9}
                y={y + 3}
                fill="#F8FAFC"
                fontSize="10"
                fontWeight={isFocused ? "bold" : "normal"}
              >
                {getShortSiteName(s, lang)}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="viewport-overlay-bottom">
        <span className="hud-pill">
          {mode === "edu" ? t.polarMap.eduHint : t.polarMap.engHint}
        </span>
      </div>
    </div>
  );
}
