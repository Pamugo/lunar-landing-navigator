import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import type { VisibilityTimeSeries } from "../types/contracts";
import type { AppMode } from "./HeaderHUD";

export interface ElevationTimelineProps {
  series: VisibilityTimeSeries | null;
  focusedSiteName: string;
  sampleIndex: number;
  onSampleIndexChange: (index: number) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  windowDays: number;
  onWindowDaysChange: (days: number) => void;
  startDateIso: string;
  onStartDateChange: (iso: string) => void;
  mode: AppMode;
}

export function ElevationTimeline({
  series,
  focusedSiteName,
  sampleIndex,
  onSampleIndexChange,
  isPlaying,
  onTogglePlay,
  windowDays,
  onWindowDaysChange,
  startDateIso,
  onStartDateChange,
  mode,
}: ElevationTimelineProps) {
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    const el = chartContainerRef.current;
    if (!el || !series || series.samples.length === 0) return;

    let chart = chartInstanceRef.current;
    if (!chart) {
      try {
        chart = echarts.init(el, undefined, { renderer: "canvas" });
        chartInstanceRef.current = chart;
      } catch {
        return;
      }
    }

    const times = series.samples.map((s) => s.time_utc.slice(5, 16).replace("T", " "));
    const sunClearance = series.samples.map((s) => s.sun.clearance_deg);
    const earthClearance = series.samples.map((s) => s.earth.clearance_deg);
    const currentLabel = times[Math.min(sampleIndex, times.length - 1)] ?? times[0] ?? "";

    const option: echarts.EChartsOption = {
      backgroundColor: "transparent",
      animation: false,
      grid: { left: 48, right: 20, top: 28, bottom: 26 },
      tooltip: {
        trigger: "axis",
        backgroundColor: "rgba(11, 15, 25, 0.94)",
        borderColor: "rgba(255,255,255,0.14)",
        textStyle: { color: "#F8FAFC", fontSize: 11, fontFamily: "JetBrains Mono, monospace" },
      },
      legend: {
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
        name: mode === "edu" ? "Altura s/horizonte (°)" : "Clearance e - γ_h (deg)",
        nameTextStyle: { color: "#94A3B8", fontSize: 10 },
        axisLabel: { color: "#94A3B8", fontSize: 10, fontFamily: "JetBrains Mono, monospace" },
        splitLine: { lineStyle: { color: "rgba(148,163,184,0.12)" } },
      },
      series: [
        {
          name: "☀ Holgura Solar (e_☉ - γ_h)",
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
            data: [{ yAxis: 0, name: "Horizonte Local" }, { xAxis: currentLabel }],
          },
        },
        {
          name: "🜨 Holgura Tierra DTE (e_⊕ - γ_h)",
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
      ],
    };

    chart.setOption(option, true);

    const onResize = () => chart?.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, [series, sampleIndex, mode]);

  const maxIdx = Math.max(0, (series?.samples.length ?? 1) - 1);
  const activeSample = series?.samples[Math.min(sampleIndex, maxIdx)];

  return (
    <section className="glass-panel timeline-dock" aria-label="Cronograma interactivo de elevacion y scrubber temporal">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">
            {mode === "edu"
              ? `Línea de Tiempo Solar y DTE · ${focusedSiteName}`
              : `Synchronized Elevation & Horizon Clearance Timeline · ${focusedSiteName}`}
          </h2>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px" }}>
          <label htmlFor="start-date-input" style={{ fontSize: "11px", color: "var(--text-muted)" }}>
            Inicio UTC:
          </label>
          <input
            id="start-date-input"
            type="date"
            className="hud-input mono-telemetry"
            value={startDateIso.slice(0, 10)}
            onChange={(e) => {
              if (e.target.value) {
                onStartDateChange(`${e.target.value}T00:00:00Z`);
              }
            }}
          />

          <label htmlFor="window-days-select" style={{ fontSize: "11px", color: "var(--text-muted)" }}>
            Duración:
          </label>
          <select
            id="window-days-select"
            className="hud-select mono-telemetry"
            value={windowDays}
            onChange={(e) => onWindowDaysChange(Number(e.target.value))}
          >
            <option value={7}>7 días (1/4 mes lunar)</option>
            <option value={14}>14 días (Medio mes sinódico)</option>
            <option value={28}>28 días (Ciclo dracónico completo)</option>
          </select>
        </div>
      </div>

      {/* Scrubber tactil sincronizado */}
      <div className="time-scrubber-bar">
        <button
          type="button"
          className="hud-btn-mini active"
          style={{ minWidth: "82px", padding: "6px 12px" }}
          onClick={onTogglePlay}
        >
          {isPlaying ? "⏸ Pausar" : "▶ Simular"}
        </button>

        <input
          type="range"
          min={0}
          max={maxIdx}
          value={Math.min(sampleIndex, maxIdx)}
          onChange={(e) => onSampleIndexChange(Number(e.target.value))}
          className="scrubber-slider"
          aria-label="Cursor temporal sincronizado"
        />

        <span className="mono-telemetry" style={{ fontSize: "12px", fontWeight: 700, color: "#F8FAFC" }}>
          {activeSample ? activeSample.time_utc.replace(".000Z", "Z") : "2027-01-01T00:00:00Z"}
        </span>
      </div>

      <div ref={chartContainerRef} style={{ width: "100%", height: "185px" }} />
    </section>
  );
}
