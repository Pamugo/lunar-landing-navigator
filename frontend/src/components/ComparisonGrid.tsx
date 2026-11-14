import { useState } from "react";
import { buildExternalPortalLinks } from "../services/apiClient";
import type {
  CuratedSite,
  LunarCoordinate,
  SiteSummaryMetrics,
  VisibilitySample,
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
  onAddCustomCoordinate: (lat_deg: number, lon_deg: number) => void;
  metricsByKey: Record<string, SiteSummaryMetrics>;
  currentSampleByKey: Record<string, VisibilitySample | undefined>;
  windowDays: number;
  mode: AppMode;
}

export function coordinateKey(coord: LunarCoordinate): string {
  return coord.site_id ?? `custom_${coord.lat_deg.toFixed(4)}_${coord.lon_deg.toFixed(4)}`;
}

export function ComparisonGrid({
  curatedSites,
  selectedSites,
  focusedIndex,
  onFocusIndex,
  onToggleCuratedSite,
  onRemoveSite,
  onAddCustomCoordinate,
  metricsByKey,
  currentSampleByKey,
  windowDays,
  mode,
}: ComparisonGridProps) {
  const [customLat, setCustomLat] = useState<string>("-88.50");
  const [customLon, setCustomLon] = useState<string>("15.00");
  const [sortBy, setSortBy] = useState<"default" | "solar" | "dte" | "golden">("default");

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
  }));

  if (sortBy !== "default") {
    indexedSites.sort((a, b) => {
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
          <label htmlFor="sort-metrics-select" style={{ fontSize: "11px", color: "var(--text-muted)" }}>
            Ordenar por:
          </label>
          <select
            id="sort-metrics-select"
            className="hud-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "default" | "solar" | "dte" | "golden")}
          >
            <option value="default">Orden de selección</option>
            <option value="golden">Mayor Ventana Dorada (Sol + DTE)</option>
            <option value="solar">Mayor Iluminación Solar (%)</option>
            <option value="dte">Mayor Visibilidad Tierra DTE (%)</option>
          </select>
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
                    ? selectedSites.length > 1
                      ? `Clic para quitar ${site.name} del comparador`
                      : `${site.name} (debe quedar al menos 1 sitio activo)`
                    : `Añadir ${site.name} (${site.lat_deg}°, ${site.lon_deg}°)`
                }
              >
                {isSelected ? "✓ " : "+ "}
                {site.name.split("-")[0]?.split("(")[0]?.trim()}
                {isSelected && selectedSites.length > 1 ? " ✕" : ""}
              </button>
            );
          })}
        </div>

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
      </div>

      {/* Tarjetas comparativas lado a lado (escritorio) / deslizables (movil) */}
      <div className="comparison-cards-grid">
        {indexedSites.map(({ coord, index, key, metrics }) => {
          const curated = curatedSites.find((c) => c.id === coord.site_id);
          const sample = currentSampleByKey[key];
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
                  {selectedSites.length > 1 && (
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
                  )}
                </div>
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
                </>
              )}

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
