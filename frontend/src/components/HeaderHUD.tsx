import { useState } from "react";
import type { HardwareProfile, ScientificVerificationSeal } from "../types/contracts";

export type AppMode = "edu" | "eng";

export interface HeaderHUDProps {
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;
  hardwareProfiles: HardwareProfile[];
  selectedHardwareId: string;
  onHardwareChange: (hardwareId: string) => void;
  scientificSeal: ScientificVerificationSeal;
}

export function HeaderHUD({
  mode,
  onModeChange,
  hardwareProfiles,
  selectedHardwareId,
  onHardwareChange,
  scientificSeal,
}: HeaderHUDProps) {
  const [showSealModal, setShowSealModal] = useState(false);

  return (
    <header className="glass-panel header-hud" aria-label="Barra de control de mision NASA">
      <div className="brand-cluster">
        <span className="nasa-insignia">NASA SPACE APPS 2026</span>
        <div>
          <h1 className="brand-title">Lunar Landing Site Navigator</h1>
          <p className="brand-subtitle">
            {mode === "edu"
              ? "Explorador Interactivo del Polo Sur Lunar · Luz Solar y Comunicacion con la Tierra"
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

        {/* Selector de Perfil de Hardware CSA / NASA CLPS */}
        <div className="hw-selector-group">
          <label htmlFor="hardware-profile-select">
            {mode === "edu" ? "Altura de Nave/Rover:" : "Hardware Mast (h₀):"}
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
    </header>
  );
}
