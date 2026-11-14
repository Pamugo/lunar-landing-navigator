import { useState } from "react";
import type { HardwareProfile, ScientificVerificationSeal } from "../types/contracts";

export type AppMode = "edu" | "eng";

export interface MissionPreset {
  id: string;
  label: string;
  eduLabel: string;
  iso: string;
  description: string;
}

export const MISSION_TIME_PRESETS: MissionPreset[] = [
  {
    id: "now",
    label: "⏱ Ahora (UTC)",
    eduLabel: "⏱ Ahora (UTC)",
    iso: "NOW",
    description: "Fecha y hora actual en tiempo universal coordinado (UTC)",
  },
  {
    id: "solstice-2026",
    label: "☀ Solsticio Sur (21 Dic 2026)",
    eduLabel: "☀ Solsticio Sur (21 Dic 2026)",
    iso: "2026-12-21T00:00:00Z",
    description: "Máxima iluminación solar y menor longitud de sombras en el Polo Sur",
  },
  {
    id: "winter-2027",
    label: "🌑 Invierno Sur (21 Jun 2027)",
    eduLabel: "🌑 Invierno Sur (21 Jun 2027)",
    iso: "2027-06-21T00:00:00Z",
    description: "Mínima elevación solar y sombras topográficas críticas para supervivencia",
  },
  {
    id: "artemis-2027",
    label: "🚀 Ventana Artemis (15 Sep 2027)",
    eduLabel: "🚀 Ventana Artemis (15 Sep 2027)",
    iso: "2027-09-15T00:00:00Z",
    description: "Ventana de lanzamiento candidata para alunizaje polar del programa Artemis",
  },
];

export interface HeaderHUDProps {
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;
  hardwareProfiles: HardwareProfile[];
  selectedHardwareId: string;
  onHardwareChange: (hardwareId: string) => void;
  scientificSeal: ScientificVerificationSeal;
  startDateIso: string;
  onStartDateChange: (iso: string) => void;
  windowDays: number;
  onWindowDaysChange: (days: number) => void;
}

export function HeaderHUD({
  mode,
  onModeChange,
  hardwareProfiles,
  selectedHardwareId,
  onHardwareChange,
  scientificSeal,
  startDateIso,
  onStartDateChange,
  windowDays,
  onWindowDaysChange,
}: HeaderHUDProps) {
  const [showSealModal, setShowSealModal] = useState(false);

  const inputValue = startDateIso.slice(0, 16);

  const handleDatetimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (!val) return;
    const isoCandidate = `${val}:00Z`;
    const parsedMs = Date.parse(isoCandidate);
    if (!isNaN(parsedMs)) {
      const iso = new Date(parsedMs).toISOString().replace(/\.\d{3}Z$/, "Z");
      onStartDateChange(iso);
    }
  };

  const isPresetActive = (preset: MissionPreset) => {
    if (preset.id === "now") {
      const nowMs = Date.now();
      const currentMs = Date.parse(startDateIso);
      return Math.abs(nowMs - currentMs) < 180_000;
    }
    return startDateIso.startsWith(preset.iso.slice(0, 10));
  };

  const handlePresetClick = (preset: MissionPreset) => {
    if (preset.id === "now") {
      const nowIso = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
      onStartDateChange(nowIso);
    } else {
      onStartDateChange(preset.iso);
    }
  };

  return (
    <header className="glass-panel header-hud" aria-label="Barra de control de mision NASA">
      {/* Fila Superior: Marca, Sello Cientifico y Modo */}
      <div className="header-hud-top">
        <div className="brand-cluster">
          <span className="nasa-insignia">NASA SPACE APPS 2026</span>
          <div>
            <h1 className="brand-title">Lunar Landing Site Navigator</h1>
            <p className="brand-subtitle">
              {mode === "edu"
                ? "Explorador Interactivo del Polo Sur Lunar · Luz Solar y Comunicación con la Tierra"
                : "South Polar Mission Planning Console · JPL DE421 (MOON_ME) + LOLA 360° Raycasting"}
            </p>
          </div>
        </div>

        <div className="header-controls">
          {/* Sello de Verificacion Cientifica contra NASA JPL Horizons */}
          <div className="seal-badge-wrapper">
            <button
              type="button"
              className="seal-badge-btn"
              onClick={() => setShowSealModal((prev) => !prev)}
              aria-expanded={showSealModal}
              title="Ver resultados de validacion contra el oraculo oficial NASA JPL Horizons"
            >
              <span className="seal-dot" />
              <span>JPL Horizons Verified</span>
              <span className="mono-telemetry">
                ≤ {scientificSeal.max_el_error_deg.toFixed(6)}°
              </span>
            </button>

            {showSealModal && (
              <div className="seal-popover" role="dialog" aria-label="Sello de Verificacion Cientifica">
                <h4>Precisión Verificada contra NASA JPL Horizons</h4>
                <p style={{ margin: "0 0 8px", fontSize: "11px", color: "var(--text-secondary)" }}>
                  Oráculo: <span className="mono-telemetry">{scientificSeal.reference_oracle}</span>
                </p>
                <div className="seal-grid">
                  <div className="seal-kv">
                    <span>Error Máx. Elevación</span>
                    <strong className="mono-telemetry" style={{ color: "#34D399" }}>
                      {scientificSeal.max_el_error_deg.toFixed(6)}° (~0.03″)
                    </strong>
                  </div>
                  <div className="seal-kv">
                    <span>Error Máx. Acimut</span>
                    <strong className="mono-telemetry" style={{ color: "#34D399" }}>
                      {scientificSeal.max_az_error_deg.toFixed(6)}°
                    </strong>
                  </div>
                  <div className="seal-kv">
                    <span>Error RMS (El / Az)</span>
                    <strong className="mono-telemetry">
                      {scientificSeal.rms_el_error_deg.toFixed(6)}° / {scientificSeal.rms_az_error_deg.toFixed(6)}°
                    </strong>
                  </div>
                  <div className="seal-kv">
                    <span>Kernel / Marco Lunar</span>
                    <strong className="mono-telemetry">
                      {scientificSeal.ephemeris_kernel} · {scientificSeal.lunar_frame}
                    </strong>
                  </div>
                  <div className="seal-kv">
                    <span>Refracción Atmosférica</span>
                    <strong className="mono-telemetry">
                      {scientificSeal.refraction} (0.0°)
                    </strong>
                  </div>
                  <div className="seal-kv">
                    <span>Muestras / Sitios</span>
                    <strong className="mono-telemetry">
                      {scientificSeal.verified_samples_count} muestras ({scientificSeal.verified_sites_count} sitios)
                    </strong>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Conmutador prominente Modo Educativo / Modo Ingeniero */}
          <div className="mode-toggle" role="group" aria-label="Selector de modo de interfaz">
            <button
              type="button"
              className={`mode-btn ${mode === "edu" ? "active" : ""}`}
              onClick={() => onModeChange("edu")}
            >
              Modo Educativo
            </button>
            <button
              type="button"
              className={`mode-btn ${mode === "eng" ? "active" : ""}`}
              onClick={() => onModeChange("eng")}
            >
              Modo Ingeniero
            </button>
          </div>
        </div>
      </div>

      {/* Fila Principal de Parametros de Mision: Selector de Fecha UTC Futura + Atajos Rapidos + Duracion + Mastil */}
      <div className="mission-control-toolbar" role="toolbar" aria-label="Parametros de simulacion temporal de mision">
        {/* Selector Interactivo de Fecha y Hora Futura (UTC) */}
        <div className="time-input-cluster">
          <label htmlFor="mission-start-datetime" className="time-label">
            <span className="time-icon">📅</span>
            <span>{mode === "edu" ? "Inicio de Misión:" : "Época T₀ Misión (UTC):"}</span>
          </label>
          <div className="datetime-input-wrapper">
            <input
              id="mission-start-datetime"
              type="datetime-local"
              className="hud-input mono-telemetry datetime-picker-input"
              value={inputValue}
              min="2000-01-01T00:00"
              max="2053-12-31T23:59"
              onChange={handleDatetimeChange}
              title="Elige libremente cualquier fecha y hora futura UTC (cobertura JPL DE421 hasta 2053)"
            />
            <span className="utc-badge" title="Tiempo Universal Coordinado (UTC Zulu)">UTC</span>
          </div>
        </div>

        {/* 4 Botones de Atajo Rapido de Mision */}
        <div className="presets-cluster" role="group" aria-label="Atajos de ventanas temporales de mision">
          <span className="presets-label">{mode === "edu" ? "Ventanas rápidas:" : "Presets Misión:"}</span>
          <div className="presets-buttons">
            {MISSION_TIME_PRESETS.map((p) => {
              const active = isPresetActive(p);
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`preset-btn ${active ? "active" : ""}`}
                  onClick={() => handlePresetClick(p)}
                  title={`${p.description} (${p.iso === "NOW" ? "Tiempo real" : p.iso.slice(0, 10)})`}
                >
                  {mode === "edu" ? p.eduLabel : p.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Selector de Duracion de Mision */}
        <div className="window-duration-group">
          <label htmlFor="header-window-days" className="time-label">
            <span className="time-icon">⏱</span>
            <span>{mode === "edu" ? "Duración:" : "Ventana (Δt):"}</span>
          </label>
          <select
            id="header-window-days"
            className="hud-select mono-telemetry"
            value={windowDays}
            onChange={(e) => onWindowDaysChange(Number(e.target.value))}
            title="Duración del periodo de simulación continua"
          >
            <option value={7}>7 días (1/4 ciclo lunar)</option>
            <option value={14}>14 días (Medio mes / día polar)</option>
            <option value={28}>28 días (Ciclo dracónico completo)</option>
          </select>
        </div>

        {/* Selector de Perfil de Hardware CSA / NASA CLPS */}
        <div className="hw-selector-group">
          <label htmlFor="hardware-profile-select">
            {mode === "edu" ? "Altura Nave/Rover:" : "Hardware Mast (h₀):"}
          </label>
          <select
            id="hardware-profile-select"
            className="hud-select"
            value={selectedHardwareId}
            onChange={(e) => onHardwareChange(e.target.value)}
          >
            {hardwareProfiles.map((hw) => (
              <option key={hw.id} value={hw.id}>
                {hw.name} [{hw.agency}]
              </option>
            ))}
          </select>
        </div>
      </div>
    </header>
  );
}
