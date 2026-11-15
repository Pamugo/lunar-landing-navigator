import { useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts";
import type { CuratedSite, LunarCoordinate, VisibilitySample, VisibilityTimeSeries } from "../types/contracts";
import type { AppMode } from "./HeaderHUD";
import { useLanguage } from "../i18n/LanguageContext";
import { getShortSiteName } from "../i18n/translations";

export type OperationalState = "golden" | "solar_only" | "eclipse";

export interface OperationalBand {
  state: OperationalState;
  startIdx: number;
  endIdx: number;
}

export function classifyOperationalState(sunClearanceDeg: number, earthClearanceDeg: number): OperationalState {
  if (sunClearanceDeg >= 0 && earthClearanceDeg >= 0) return "golden";
  if (sunClearanceDeg >= 0) return "solar_only";
  return "eclipse";
}

export function computeOperationalBands(samples: VisibilitySample[]): OperationalBand[] {
  if (samples.length === 0) return [];
  const bands: OperationalBand[] = [];
  const first = samples[0]!;
  let currentState = classifyOperationalState(first.sun.clearance_deg, first.earth.clearance_deg);
  let startIdx = 0;

  for (let i = 1; i < samples.length; i++) {
    const s = samples[i]!;
    const nextState = classifyOperationalState(s.sun.clearance_deg, s.earth.clearance_deg);
    if (nextState !== currentState) {
      bands.push({ state: currentState, startIdx, endIdx: i - 1 });
      currentState = nextState;
      startIdx = i;
    }
  }
  bands.push({ state: currentState, startIdx, endIdx: samples.length - 1 });
  return bands;
}

function formatSignedDeg(deg: number): string {
  const sign = deg >= 0 ? "+" : "";
  return `${sign}${deg.toFixed(2)}°`;
}

export interface ElevationTimelineProps {
  series: VisibilityTimeSeries | null;
  focusedSiteName: string | null;
  selectedSites?: LunarCoordinate[] | undefined;
  curatedSites?: CuratedSite[] | undefined;
  focusedIndex?: number | undefined;
  onSelectSiteIndex?: ((index: number) => void) | undefined;
  sampleIndex: number;
  onSampleIndexChange: (index: number) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  startDateIso?: string | undefined;
  mode: AppMode;
}

export function ElevationTimeline({
  series,
  focusedSiteName,
  selectedSites = [],
  curatedSites = [],
  focusedIndex = 0,
  onSelectSiteIndex,
  sampleIndex,
  onSampleIndexChange,
  isPlaying,
  onTogglePlay,
  startDateIso = "",
  mode,
}: ElevationTimelineProps) {
  const { lang, t } = useLanguage();
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);
  const samplesLengthRef = useRef<number>(0);

  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [visibleTraces, setVisibleTraces] = useState({
    sun: true,
    earth: true,
    horizon: true,
  });

  samplesLengthRef.current = series?.samples.length ?? 0;

  const operationalBands = useMemo(
    () => (mode === "eng" && series ? computeOperationalBands(series.samples) : []),
    [mode, series],
  );

  // Clean up ECharts instance on unmount
  useEffect(() => {
    return () => {
      try {
        chartInstanceRef.current?.dispose();
      } catch {
        // Ignore cleanup errors when headless canvas context is unavailable (e.g. jsdom)
      }
      chartInstanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    const el = chartContainerRef.current;
    if (!el || !series || series.samples.length === 0) {
      try {
        chartInstanceRef.current?.clear();
      } catch {
        // Ignore clear errors in headless environments
      }
      setHoveredIndex(null);
      return;
    }

    let chart = chartInstanceRef.current;
    if (!chart) {
      try {
        chart = echarts.init(el, undefined, { renderer: "canvas" });
        chartInstanceRef.current = chart;
        chart.on("updateAxisPointer", (event: unknown) => {
          const ev = event as { axesInfo?: Array<{ value?: unknown }> };
          const val = ev.axesInfo?.[0]?.value;
          if (typeof val === "number" && Number.isFinite(val)) {
            const clamped = Math.max(0, Math.min(Math.round(val), Math.max(0, samplesLengthRef.current - 1)));
            setHoveredIndex(clamped);
          }
        });
        chart.on("globalout", () => {
          setHoveredIndex(null);
        });
      } catch {
        return;
      }
    }

    const times = series.samples.map((s) => s.time_utc.slice(5, 16).replace("T", " "));
    const sunClearance = series.samples.map((s) => s.sun.clearance_deg);
    const earthClearance = series.samples.map((s) => s.earth.clearance_deg);
    const currentLabel = times[Math.min(sampleIndex, times.length - 1)] ?? times[0] ?? "";

    const bandColors: Record<OperationalState, string> = {
      golden: "rgba(16, 185, 129, 0.14)",
      solar_only: "rgba(245, 158, 11, 0.13)",
      eclipse: "rgba(239, 68, 68, 0.14)",
    };

    const markAreaData =
      mode === "eng" && series.samples.length > 1
        ? operationalBands
            .map((band) => {
              const endIdx = Math.min(band.endIdx + 1, series.samples.length - 1);
              if (endIdx <= band.startIdx) return null;
              return [
                {
                  xAxis: band.startIdx,
                  itemStyle: { color: bandColors[band.state] },
                },
                { xAxis: endIdx },
              ];
            })
            .filter((item): item is [{ xAxis: number; itemStyle: { color: string } }, { xAxis: number }] => item !== null)
        : [];

    const stateMeta = {
      golden: { label: t.timeline.stateGoldenBadge, color: "#34D399", bg: "rgba(16,185,129,0.18)", border: "rgba(16,185,129,0.45)" },
      solar_only: { label: t.timeline.stateSolarOnlyBadge, color: "#FBBF24", bg: "rgba(245,158,11,0.18)", border: "rgba(245,158,11,0.45)" },
      eclipse: { label: t.timeline.stateEclipseBadge, color: "#F87171", bg: "rgba(239,68,68,0.18)", border: "rgba(239,68,68,0.45)" },
    };

    const engSeriesList: echarts.SeriesOption[] = [
      // Persistent silent base series for operational background shading & time cursor
      {
        name: "__ops_bands__",
        type: "line",
        data: times.map(() => null),
        silent: true,
        tooltip: { show: false },
        showSymbol: false,
        lineStyle: { opacity: 0 },
        markLine: {
          symbol: "none",
          silent: true,
          label: {
            show: true,
            position: "end",
            distance: 4,
            fontSize: 10,
            color: "#F8FAFC",
            fontFamily: "Inter, system-ui, sans-serif",
            backgroundColor: "rgba(11, 15, 25, 0.82)",
            padding: [2, 5],
            borderRadius: 3,
          },
          lineStyle: { color: "#FFFFFF", type: "dashed", width: 1.2 },
          data: [{ xAxis: currentLabel }],
        },
        ...(markAreaData.length > 0
          ? {
              markArea: {
                silent: true,
                data: markAreaData,
              },
            }
          : {}),
      },
    ];

    if (visibleTraces.horizon) {
      engSeriesList.push({
        name: t.timeline.horizonLegendTitle,
        type: "line",
        data: times.map(() => 0),
        showSymbol: false,
        silent: true,
        tooltip: { show: false },
        lineStyle: { color: "#E2E8F0", type: "dashed", width: 1.5, opacity: 0.78 },
        itemStyle: { color: "#E2E8F0" },
      });
    }

    if (visibleTraces.sun) {
      engSeriesList.push({
        name: t.timeline.sunSeriesName,
        type: "line",
        data: sunClearance,
        showSymbol: false,
        lineStyle: { color: "#F59E0B", width: 2.2 },
        itemStyle: { color: "#F59E0B" },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: "rgba(245, 158, 11, 0.24)" },
            { offset: 1, color: "rgba(245, 158, 11, 0.0)" },
          ]),
        },
      });
    }

    if (visibleTraces.earth) {
      engSeriesList.push({
        name: t.timeline.earthSeriesName,
        type: "line",
        data: earthClearance,
        showSymbol: false,
        lineStyle: { color: "#06B6D4", width: 2.2 },
        itemStyle: { color: "#06B6D4" },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: "rgba(6, 182, 212, 0.2)" },
            { offset: 1, color: "rgba(6, 182, 212, 0.0)" },
          ]),
        },
      });
    }

    const eduSeriesList: echarts.SeriesOption[] = [
      {
        name: t.timeline.sunSeriesName,
        type: "line",
        data: sunClearance,
        showSymbol: false,
        lineStyle: { color: "#F59E0B", width: 2 },
        itemStyle: { color: "#F59E0B" },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: "rgba(245, 158, 11, 0.28)" },
            { offset: 1, color: "rgba(245, 158, 11, 0.0)" },
          ]),
        },
        markLine: {
          symbol: "none",
          silent: true,
          lineStyle: { color: "#FFFFFF", type: "dashed", width: 1.2 },
          data: [{ yAxis: 0, name: t.timeline.localHorizonLabel }, { xAxis: currentLabel }],
        },
      },
      {
        name: t.timeline.earthSeriesName,
        type: "line",
        data: earthClearance,
        showSymbol: false,
        lineStyle: { color: "#06B6D4", width: 2 },
        itemStyle: { color: "#06B6D4" },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: "rgba(6, 182, 212, 0.22)" },
            { offset: 1, color: "rgba(6, 182, 212, 0.0)" },
          ]),
        },
      },
    ];

    const option: echarts.EChartsOption = {
      backgroundColor: "transparent",
      animation: false,
      grid: { left: 52, right: 28, top: 56, bottom: 26 },
      tooltip: {
        trigger: "axis",
        confine: true,
        backgroundColor: "rgba(11, 15, 25, 0.96)",
        borderColor: "rgba(255,255,255,0.16)",
        textStyle: { color: "#F8FAFC", fontSize: 11, fontFamily: "JetBrains Mono, monospace" },
        formatter: (params) => {
          const items = Array.isArray(params) ? params : [params];
          const first = items[0];
          const idx = typeof first?.dataIndex === "number" ? first.dataIndex : 0;
          const sample = series.samples[idx];
          if (!sample) return "";
          const timeStr = sample.time_utc.replace(".000Z", "Z");
          const sunClear = sample.sun.clearance_deg;
          const earthClear = sample.earth.clearance_deg;

          if (mode === "eng") {
            const st = classifyOperationalState(sunClear, earthClear);
            const meta = stateMeta[st];
            return [
              `<div style="font-weight:700;margin-bottom:4px;color:#93C5FD;">${timeStr}</div>`,
              `<div><span style="color:#F59E0B;">●</span> ${t.timeline.sunWord}: El ${sample.sun.elevation_deg.toFixed(2)}° / ⛰ ${sample.sun.horizon_elevation_deg.toFixed(2)}° → <strong>${t.timeline.telemetrySunMarginLabel} ${formatSignedDeg(sunClear)}</strong></div>`,
              `<div><span style="color:#06B6D4;">●</span> ${t.timeline.earthDteWord}: El ${sample.earth.elevation_deg.toFixed(2)}° / ⛰ ${sample.earth.horizon_elevation_deg.toFixed(2)}° → <strong>${t.timeline.telemetryEarthMarginLabel} ${formatSignedDeg(earthClear)}</strong></div>`,
              `<div style="margin-top:5px;padding:2px 6px;border-radius:4px;background:${meta.bg};border:1px solid ${meta.border};color:${meta.color};font-weight:700;">${meta.label}</div>`,
            ].join("");
          }

          const isGolden = sunClear >= 0 && earthClear >= 0;
          const goldenHtml = isGolden
            ? `<div style="margin-top:4px;padding:2px 6px;border-radius:4px;background:rgba(16,185,129,0.18);border:1px solid rgba(16,185,129,0.45);color:#34D399;font-weight:700;">★ ${t.timeline.goldenWindowBadge}</div>`
            : "";
          return [
            `<div style="font-weight:700;margin-bottom:4px;color:#93C5FD;">${timeStr}</div>`,
            `<div><span style="color:#F59E0B;">●</span> ${t.timeline.sunWord}: <strong>${formatSignedDeg(sunClear)}</strong></div>`,
            `<div><span style="color:#06B6D4;">●</span> ${t.timeline.earthDteWord}: <strong>${formatSignedDeg(earthClear)}</strong></div>`,
            goldenHtml,
          ].join("");
        },
      },
      legend:
        mode === "eng"
          ? { show: false }
          : {
              top: 2,
              right: 12,
              textStyle: { color: "#CBD5E1", fontSize: 11 },
            },
      xAxis: {
        type: "category",
        data: times,
        axisLabel: { color: "#94A3B8", fontSize: 10, fontFamily: "JetBrains Mono, monospace" },
        axisLine: { lineStyle: { color: "rgba(148,163,184,0.25)" } },
      },
      yAxis: {
        type: "value",
        name: mode === "edu" ? t.timeline.yAxisEdu : t.timeline.yAxisEng,
        nameLocation: "end",
        nameGap: 32,
        nameTextStyle: {
          color: "#CBD5E1",
          fontSize: 11,
          fontWeight: 600,
          align: "left",
          padding: [0, 0, 0, 2],
        },
        axisLabel: { color: "#94A3B8", fontSize: 10, fontFamily: "JetBrains Mono, monospace" },
        splitLine: { lineStyle: { color: "rgba(148,163,184,0.12)" } },
      },
      series: mode === "eng" ? engSeriesList : eduSeriesList,
    };

    try {
      chart.setOption(option, true);
    } catch {
      // Headless environments (jsdom) lack Canvas 2D context
    }

    const onResize = () => {
      try {
        chart?.resize();
      } catch {
        // Ignore resize errors when 2D context is unavailable
      }
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, [series, sampleIndex, mode, t, visibleTraces, operationalBands]);

  const maxIdx = Math.max(0, (series?.samples.length ?? 1) - 1);
  const activeSample = series?.samples[Math.min(sampleIndex, maxIdx)];
  const inspectedIdx = hoveredIndex !== null ? Math.min(hoveredIndex, maxIdx) : Math.min(sampleIndex, maxIdx);
  const inspectedSample = series?.samples[inspectedIdx];
  const inspectedState = inspectedSample
    ? classifyOperationalState(inspectedSample.sun.clearance_deg, inspectedSample.earth.clearance_deg)
    : null;

  return (
    <section className="glass-panel timeline-dock" aria-label={t.timeline.sectionAria}>
      <div className="panel-header">
        <div>
          <h2 className="panel-title">
            {focusedSiteName
              ? `${mode === "edu" ? t.timeline.titleEdu : t.timeline.titleEng} · ${focusedSiteName}`
              : mode === "edu"
                ? t.timeline.titleEdu
                : t.timeline.titleEng}
          </h2>
          {mode === "eng" && (
            <p className="timeline-eng-subtitle">{t.timeline.engPlannerSubtitle}</p>
          )}
        </div>
      </div>

      {/* Active Site Selector inside Timeline */}
      {selectedSites.length > 0 && onSelectSiteIndex && (
        <div className="timeline-site-selector" role="group" aria-label={t.timeline.siteSelectorLabel}>
          <span className="timeline-site-selector-label">{t.timeline.siteSelectorLabel}</span>
          {selectedSites.map((coord, idx) => {
            const cur = curatedSites.find((s) => s.id === coord.site_id);
            const label = cur
              ? getShortSiteName(cur, lang)
              : `${t.app.customTimelineLabel} (${coord.lat_deg.toFixed(2)}°, ${coord.lon_deg.toFixed(2)}°)`;
            const isActive = idx === focusedIndex;
            return (
              <button
                key={`${coord.site_id ?? "custom"}_${coord.lat_deg}_${coord.lon_deg}_${idx}`}
                type="button"
                className={`hud-btn-mini timeline-site-pill ${isActive ? "active" : ""}`}
                aria-pressed={isActive}
                onClick={() => onSelectSiteIndex(idx)}
              >
                {isActive ? "👁️ " : ""}
                {label}
              </button>
            );
          })}
        </div>
      )}

      {/* Engineer Mode Only: Interactive operational legend + background state shading key */}
      {mode === "eng" && (
        <div className="timeline-eng-legend-bar">
          <div className="timeline-eng-traces">
            <button
              id="legend-toggle-sun"
              type="button"
              className={`timeline-legend-chip ${visibleTraces.sun ? "active sun" : "muted"}`}
              aria-pressed={visibleTraces.sun}
              onClick={() => setVisibleTraces((prev) => ({ ...prev, sun: !prev.sun }))}
            >
              <span className="legend-swatch line sun" />
              <span className="legend-text">
                <strong>{t.timeline.sunLegendTitle}</strong>: {t.timeline.sunLegendDesc}
              </span>
            </button>

            <button
              id="legend-toggle-earth"
              type="button"
              className={`timeline-legend-chip ${visibleTraces.earth ? "active earth" : "muted"}`}
              aria-pressed={visibleTraces.earth}
              onClick={() => setVisibleTraces((prev) => ({ ...prev, earth: !prev.earth }))}
            >
              <span className="legend-swatch line earth" />
              <span className="legend-text">
                <strong>{t.timeline.earthLegendTitle}</strong>: {t.timeline.earthLegendDesc}
              </span>
            </button>

            <button
              id="legend-toggle-horizon"
              type="button"
              className={`timeline-legend-chip ${visibleTraces.horizon ? "active horizon" : "muted"}`}
              aria-pressed={visibleTraces.horizon}
              onClick={() => setVisibleTraces((prev) => ({ ...prev, horizon: !prev.horizon }))}
            >
              <span className="legend-swatch dashed horizon" />
              <span className="legend-text">
                <strong>{t.timeline.horizonLegendTitle}</strong>: {t.timeline.horizonLegendDesc}
              </span>
            </button>
          </div>

          <div className="timeline-band-key" aria-label="Operational state background bands">
            <span className="timeline-band-pill golden">
              <span className="band-box golden" />
              {t.timeline.bandGoldenLabel}
            </span>
            <span className="timeline-band-pill solar-only">
              <span className="band-box solar-only" />
              {t.timeline.bandSolarOnlyLabel}
            </span>
            <span className="timeline-band-pill eclipse">
              <span className="band-box eclipse" />
              {t.timeline.bandEclipseLabel}
            </span>
          </div>
        </div>
      )}

      {/* Synchronized touch scrubber */}
      <div className="time-scrubber-bar">
        <button
          type="button"
          className="hud-btn-mini active"
          style={{ minWidth: "82px", padding: "6px 12px" }}
          onClick={onTogglePlay}
          disabled={!series || series.samples.length === 0}
        >
          {isPlaying ? t.timeline.pauseBtn : t.timeline.playBtn}
        </button>

        <input
          type="range"
          min={0}
          max={maxIdx}
          value={Math.min(sampleIndex, maxIdx)}
          onChange={(e) => onSampleIndexChange(Number(e.target.value))}
          className="scrubber-slider"
          aria-label={t.timeline.scrubberAria}
          disabled={!series || series.samples.length === 0}
        />

        <span className="timeline-scrubber-time">
          {activeSample ? activeSample.time_utc.replace(".000Z", "Z") : startDateIso.replace(".000Z", "Z")}
        </span>
      </div>

      {/* Engineer Mode Only: Fixed instant telemetry readout tracking cursor hover or active scrubber */}
      {mode === "eng" && inspectedSample && inspectedState && (
        <div id="timeline-telemetry-bar" className="timeline-telemetry-bar">
          <div className="telemetry-item">
            <span className="telemetry-source-tag">
              {hoveredIndex !== null ? t.timeline.telemetryLiveCursorHint : t.timeline.telemetryScrubberHint}
            </span>
            <strong className="telemetry-utc">
              {inspectedSample.time_utc.replace(".000Z", "Z")}
            </strong>
          </div>

          <div className="telemetry-item">
            <span style={{ color: "var(--solar-amber)", fontWeight: 600 }}>☀</span>
            <span className="mono-telemetry">
              {inspectedSample.sun.elevation_deg.toFixed(2)}° vs {t.timeline.telemetryHorizonShort} {inspectedSample.sun.horizon_elevation_deg.toFixed(2)}°
            </span>
            <strong
              className="mono-telemetry"
              style={{ color: inspectedSample.sun.clearance_deg >= 0 ? "var(--accent-amber-bright-text)" : "var(--accent-danger-text)" }}
            >
              ({t.timeline.telemetrySunMarginLabel} {formatSignedDeg(inspectedSample.sun.clearance_deg)})
            </strong>
          </div>

          <div className="telemetry-item">
            <span style={{ color: "var(--accent-cyan-text)", fontWeight: 600 }}>🜨</span>
            <span className="mono-telemetry">
              {inspectedSample.earth.elevation_deg.toFixed(2)}° vs {t.timeline.telemetryHorizonShort} {inspectedSample.earth.horizon_elevation_deg.toFixed(2)}°
            </span>
            <strong
              className="mono-telemetry"
              style={{ color: inspectedSample.earth.clearance_deg >= 0 ? "var(--accent-cyan-text)" : "var(--accent-danger-text)" }}
            >
              ({t.timeline.telemetryEarthMarginLabel} {formatSignedDeg(inspectedSample.earth.clearance_deg)})
            </strong>
          </div>

          <span className={`timeline-state-badge ${inspectedState}`}>
            {inspectedState === "golden"
              ? t.timeline.stateGoldenBadge
              : inspectedState === "solar_only"
                ? t.timeline.stateSolarOnlyBadge
                : t.timeline.stateEclipseBadge}
          </span>
        </div>
      )}

      <div
        className="timeline-chart-surface"
        style={{ position: "relative", width: "100%", height: "210px" }}
        onClick={() => {
          if (mode === "eng" && hoveredIndex !== null && series && hoveredIndex < series.samples.length) {
            onSampleIndexChange(hoveredIndex);
          }
        }}
      >
        <div ref={chartContainerRef} style={{ width: "100%", height: "210px" }} />
        {(!series || series.samples.length === 0) && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "grid",
              placeItems: "center",
              pointerEvents: "none",
              color: "var(--text-muted)",
              fontSize: "12px",
              textAlign: "center",
              padding: "12px",
            }}
          >
            {t.timeline.noSiteSelectedHint}
          </div>
        )}
      </div>
    </section>
  );
}
