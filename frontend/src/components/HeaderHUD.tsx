import { useEffect, useState } from "react";
import { useLanguage } from "../i18n/LanguageContext";
import type { HardwareProfile, ScientificVerificationSeal } from "../types/contracts";

export type AppMode = "edu" | "eng";
export type AppTheme = "dark" | "light";
export type MissionPresetId = "now" | "solstice-2026" | "winter-2027" | "artemis-2027";

export const THEME_STORAGE_KEY = "lunar_navigator_theme";

export interface MissionPreset {
  id: MissionPresetId;
  label: string;
  eduLabel: string;
  iso: string;
  description: string;
}

export const MISSION_TIME_PRESETS: MissionPreset[] = [
  {
    id: "now",
    label: "⏱ Now (UTC)",
    eduLabel: "⏱ Now (UTC)",
    iso: "NOW",
    description: "Current date and time in Coordinated Universal Time (UTC)",
  },
  {
    id: "solstice-2026",
    label: "☀ South Solstice (Dec 21, 2026)",
    eduLabel: "☀ South Solstice (Dec 21, 2026)",
    iso: "2026-12-21T00:00:00Z",
    description: "Peak solar illumination and shortest shadow lengths at the South Pole",
  },
  {
    id: "winter-2027",
    label: "🌑 South Winter (Jun 21, 2027)",
    eduLabel: "🌑 South Winter (Jun 21, 2027)",
    iso: "2027-06-21T00:00:00Z",
    description: "Lowest solar elevation and critical topographic shadows for survival",
  },
  {
    id: "artemis-2027",
    label: "🚀 Artemis Window (Sep 15, 2027)",
    eduLabel: "🚀 Artemis Window (Sep 15, 2027)",
    iso: "2027-09-15T00:00:00Z",
    description: "Candidate launch window for Artemis polar lunar landing",
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
  scientificSeal,
  startDateIso,
  onStartDateChange,
  windowDays,
  onWindowDaysChange,
}: HeaderHUDProps) {
  const [showSealModal, setShowSealModal] = useState(false);
  const [theme, setTheme] = useState<AppTheme>(() => {
    try {
      const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
      return saved === "light" ? "light" : "dark";
    } catch {
      return "dark";
    }
  });
  const [draftDatetime, setDraftDatetime] = useState<string>(startDateIso.slice(0, 16));
  const [draftDays, setDraftDays] = useState<string>(String(windowDays));
  const { lang, setLang, t } = useLanguage();

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage errors in restricted environments
    }
  }, [theme]);

  useEffect(() => {
    setDraftDatetime(startDateIso.slice(0, 16));
  }, [startDateIso]);

  useEffect(() => {
    setDraftDays(String(windowDays));
  }, [windowDays]);

  const commitDatetime = (raw: string) => {
    const val = raw.trim();
    if (!val) {
      setDraftDatetime(startDateIso.slice(0, 16));
      return;
    }
    const isoCandidate = val.length === 16 ? `${val}:00Z` : val.endsWith("Z") ? val : `${val}Z`;
    const parsedMs = Date.parse(isoCandidate);
    if (!isNaN(parsedMs)) {
      const year = new Date(parsedMs).getUTCFullYear();
      if (year >= 2000 && year <= 2053) {
        const iso = new Date(parsedMs).toISOString().replace(/\.\d{3}Z$/, "Z");
        setDraftDatetime(iso.slice(0, 16));
        if (iso !== startDateIso) {
          onStartDateChange(iso);
        }
        return;
      }
    }
    setDraftDatetime(startDateIso.slice(0, 16));
  };

  const handleDatetimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setDraftDatetime(val);
    if (!val) return;
    const isoCandidate = `${val}:00Z`;
    const parsedMs = Date.parse(isoCandidate);
    if (!isNaN(parsedMs)) {
      const year = new Date(parsedMs).getUTCFullYear();
      if (year >= 2000 && year <= 2053) {
        const iso = new Date(parsedMs).toISOString().replace(/\.\d{3}Z$/, "Z");
        if (iso !== startDateIso) {
          onStartDateChange(iso);
        }
      }
    }
  };

  const commitDraftDays = (raw: string) => {
    const num = Number(raw);
    const clamped =
      raw.trim() !== "" && Number.isFinite(num)
        ? Math.max(1, Math.min(365, Math.round(num)))
        : windowDays;
    setDraftDays(String(clamped));
    if (clamped !== windowDays) {
      onWindowDaysChange(clamped);
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
    <header className="glass-panel header-hud" aria-label={t.header.consoleAria}>
      {/* Top Row: Brand, Scientific Seal, Language, and Mode */}
      <div className="header-hud-top">
        <div className="brand-cluster">
          <div className="nasa-insignia-badge">
            <img
              src={theme === "light" ? "/space-apps-malaga-logo-light.png" : "/space-apps-malaga-logo.png"}
              alt={t.header.insignia}
              className="nasa-insignia-logo"
            />
          </div>
          <div className="brand-text-block">
            <h1 className="brand-title">{t.header.brandTitle}</h1>
            <p className="brand-subtitle">
              {mode === "edu" ? t.header.subtitleEdu : t.header.subtitleEng}
            </p>
          </div>
        </div>

        <div
          className="header-controls"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: "6px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", justifyContent: "flex-end" }}>
            {/* Language Selector ES | EN */}
            <div className="lang-toggle" role="group" aria-label={t.languageToggle.groupLabel}>
              <button
                type="button"
                className={`lang-btn ${lang === "es" ? "active" : ""}`}
                onClick={() => setLang("es")}
                aria-pressed={lang === "es"}
                title={t.languageToggle.esTitle}
              >
                ES
              </button>
              <button
                type="button"
                className={`lang-btn ${lang === "en" ? "active" : ""}`}
                onClick={() => setLang("en")}
                aria-pressed={lang === "en"}
                title={t.languageToggle.enTitle}
              >
                EN
              </button>
            </div>

            {/* Prominent Educational Mode / Engineer Mode toggle */}
            <div className="mode-toggle" role="group" aria-label={t.header.modeGroupAria}>
              <button
                type="button"
                className={`mode-btn ${mode === "edu" ? "active" : ""}`}
                onClick={() => {
                  setShowSealModal(false);
                  onModeChange("edu");
                }}
              >
                {t.header.modeEdu}
              </button>
              <button
                type="button"
                className={`mode-btn ${mode === "eng" ? "active" : ""}`}
                onClick={() => onModeChange("eng")}
              >
                {t.header.modeEng}
              </button>
            </div>
          </div>

          {/* Theme Toggle (directly below mode selector) & JPL Horizons Seal (Engineer Mode only) */}
          <div className="header-subcontrols">
            <button
              id="theme-toggle-btn"
              type="button"
              className={`theme-toggle-btn ${theme}`}
              onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
              aria-pressed={theme === "light"}
              title={theme === "light" ? t.header.switchToDarkTitle : t.header.switchToLightTitle}
            >
              {theme === "light" ? (
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#D97706"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  data-theme-icon="sun"
                >
                  <circle cx="12" cy="12" r="4.5" fill="#F59E0B" />
                  <line x1="12" y1="2" x2="12" y2="4.5" />
                  <line x1="12" y1="19.5" x2="12" y2="22" />
                  <line x1="4.93" y1="4.93" x2="6.7" y2="6.7" />
                  <line x1="17.3" y1="17.3" x2="19.07" y2="19.07" />
                  <line x1="2" y1="12" x2="4.5" y2="12" />
                  <line x1="19.5" y1="12" x2="22" y2="12" />
                  <line x1="4.93" y1="19.07" x2="6.7" y2="17.3" />
                  <line x1="17.3" y1="6.7" x2="19.07" y2="4.93" />
                </svg>
              ) : (
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="#93C5FD"
                  stroke="#93C5FD"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  data-theme-icon="moon"
                >
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
              <span>{theme === "light" ? t.header.themeLightLabel : t.header.themeDarkLabel}</span>
            </button>

            {mode === "eng" && (
              <div className="seal-badge-wrapper">
              <button
                type="button"
                className="seal-badge-btn"
                onClick={() => setShowSealModal((prev) => !prev)}
                aria-expanded={showSealModal}
                title={t.header.sealButtonTitle}
              >
                <span className="seal-dot" />
                <span>{t.header.sealBadgeText}</span>
                <span className="mono-telemetry">
                  ≤ {scientificSeal.max_el_error_deg.toFixed(6)}°
                </span>
              </button>

              {showSealModal && (
                <div className="seal-popover" role="dialog" aria-label={t.header.sealAriaLabel}>
                  <h4>{t.header.sealModalTitle}</h4>
                  <p style={{ margin: "0 0 8px", fontSize: "11px", color: "var(--text-secondary)" }}>
                    {t.header.sealOracle}: <span className="mono-telemetry">{scientificSeal.reference_oracle}</span>
                  </p>
                  <div className="seal-grid">
                    <div className="seal-kv">
                      <span>{t.header.sealMaxElError}</span>
                      <strong className="mono-telemetry" style={{ color: "var(--accent-emerald-text)" }}>
                        {scientificSeal.max_el_error_deg.toFixed(6)}° (~0.03″)
                      </strong>
                    </div>
                    <div className="seal-kv">
                      <span>{t.header.sealMaxAzError}</span>
                      <strong className="mono-telemetry" style={{ color: "var(--accent-emerald-text)" }}>
                        {scientificSeal.max_az_error_deg.toFixed(6)}°
                      </strong>
                    </div>
                    <div className="seal-kv">
                      <span>{t.header.sealRmsError}</span>
                      <strong className="mono-telemetry">
                        {scientificSeal.rms_el_error_deg.toFixed(6)}° / {scientificSeal.rms_az_error_deg.toFixed(6)}°
                      </strong>
                    </div>
                    <div className="seal-kv">
                      <span>{t.header.sealKernelFrame}</span>
                      <strong className="mono-telemetry">
                        {scientificSeal.ephemeris_kernel} · {scientificSeal.lunar_frame}
                      </strong>
                    </div>
                    <div className="seal-kv">
                      <span>{t.header.sealOpticalBending}</span>
                      <strong className="mono-telemetry">
                        {scientificSeal.refraction} (0.0°)
                      </strong>
                    </div>
                    <div className="seal-kv">
                      <span>{t.header.sealSamplesSites}</span>
                      <strong className="mono-telemetry">
                        {scientificSeal.verified_samples_count} {t.header.samplesWord} ({scientificSeal.verified_sites_count}{" "}
                        {t.header.sitesWord})
                      </strong>
                    </div>
                  </div>
                </div>
              )}
            </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Mission Parameters Row: Future UTC Picker + Quick Presets + Duration + Mast */}
      <div className="mission-control-toolbar" role="toolbar" aria-label={t.header.toolbarAria}>
        {/* Interactive Future Date & Time Picker (UTC) - Engineer Mode only */}
        {mode === "eng" && (
          <div className="time-input-cluster">
            <label htmlFor="mission-start-datetime" className="time-label">
              <span className="time-icon">📅</span>
              <span>{t.header.epochLabel}</span>
            </label>
            <div className="datetime-input-wrapper">
              <input
                id="mission-start-datetime"
                type="datetime-local"
                className="hud-input mono-telemetry datetime-picker-input"
                value={draftDatetime}
                min="2000-01-01T00:00"
                max="2053-12-31T23:59"
                onChange={handleDatetimeChange}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitDatetime(e.currentTarget.value || draftDatetime);
                    e.currentTarget.blur();
                  }
                }}
                onBlur={(e) => commitDatetime(e.currentTarget.value || draftDatetime)}
                title={t.header.epochTitle}
              />
            </div>
          </div>
        )}

        {/* 4 Mission Quick Preset Buttons */}
        <div className="presets-cluster" role="group" aria-label={t.header.presetsAria}>
          <span className="presets-label">
            {mode === "edu" ? t.header.quickWindowsLabel : t.header.missionPresetsLabel}
          </span>
          <div className="presets-buttons">
            {MISSION_TIME_PRESETS.map((p) => {
              const active = isPresetActive(p);
              const localized = t.presets[p.id];
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`preset-btn ${active ? "active" : ""}`}
                  onClick={() => handlePresetClick(p)}
                  title={`${localized.description} (${p.iso === "NOW" ? t.header.realTimeLabel : p.iso.slice(0, 10)})`}
                >
                  {mode === "edu" ? localized.eduLabel : localized.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Mission Duration Input (free choice of days) - Engineer Mode only */}
        {mode === "eng" && (
          <div className="window-duration-group">
            <label htmlFor="header-window-days" className="time-label">
              <span className="time-icon">⏱</span>
              <span>{t.header.windowDurationLabel}</span>
            </label>
            <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <input
                id="header-window-days"
                type="number"
                min={1}
                max={365}
                step={1}
                className="hud-input mono-telemetry"
                style={{ width: "74px", textAlign: "center" }}
                value={draftDays}
                onChange={(e) => {
                  const raw = e.target.value;
                  setDraftDays(raw);
                  const num = Number(raw);
                  if (raw.trim() !== "" && Number.isFinite(num) && num >= 1 && num <= 365) {
                    onWindowDaysChange(Math.round(num));
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitDraftDays(e.currentTarget.value);
                    e.currentTarget.blur();
                  }
                }}
                onBlur={(e) => commitDraftDays(e.currentTarget.value)}
                title={t.header.windowDurationTitle}
              />
              <span className="time-label" style={{ textTransform: "none" }}>
                {t.header.windowDaysUnit}
              </span>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
