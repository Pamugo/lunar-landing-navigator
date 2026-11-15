import { useTranslation } from "../i18n/LanguageContext";
import type { EventPrediction } from "../types/contracts";
import type { AppMode } from "./HeaderHUD";

export interface EventCountdownProps {
  nextSunset: EventPrediction;
  nextEarthset: EventPrediction;
  windowDays: number;
  mode: AppMode;
}

export function formatDurationSeconds(
  seconds: number | null,
  beyondWindow: boolean,
  windowDays: number,
  beyondPrefix = "> window",
): string {
  if (beyondWindow || seconds === null) {
    return `${beyondPrefix} (${windowDays.toFixed(0)} d)`;
  }
  const clamped = Math.max(0, Math.round(seconds));
  const days = Math.floor(clamped / 86400);
  const hours = Math.floor((clamped % 86400) / 3600);
  const mins = Math.floor((clamped % 3600) / 60);
  if (days > 0) {
    return `${days}d ${String(hours).padStart(2, "0")}h ${String(mins).padStart(2, "0")}m`;
  }
  return `${String(hours).padStart(2, "0")}h ${String(mins).padStart(2, "0")}m`;
}

export function EventCountdown({ nextSunset, nextEarthset, windowDays, mode }: EventCountdownProps) {
  const { t } = useTranslation();

  const sunImminent =
    !nextSunset.beyond_window &&
    nextSunset.seconds_from_reference !== null &&
    nextSunset.seconds_from_reference <= 86400;

  const earthImminent =
    !nextEarthset.beyond_window &&
    nextEarthset.seconds_from_reference !== null &&
    nextEarthset.seconds_from_reference <= 86400;

  return (
    <div className="countdown-grid" aria-label={t.countdown.ariaLabel}>
      <div className={`countdown-box ${sunImminent ? "imminent" : ""}`}>
        <span className="countdown-label">
          ☀ {mode === "edu" ? t.countdown.nextSunsetEdu : t.countdown.timeToSunsetEng}
        </span>
        <span className="countdown-value mono-telemetry">
          {formatDurationSeconds(
            nextSunset.seconds_from_reference,
            nextSunset.beyond_window,
            windowDays,
            t.countdown.windowExceed,
          )}
        </span>
        <span className="countdown-utc mono-telemetry">
          {nextSunset.time_utc ? nextSunset.time_utc.replace(".000Z", "Z") : t.countdown.noCrossing}
        </span>
      </div>

      <div className={`countdown-box ${earthImminent ? "imminent" : ""}`}>
        <span className="countdown-label">
          🜨 {mode === "edu" ? t.countdown.nextEarthsetEdu : t.countdown.timeToEarthsetEng}
        </span>
        <span className="countdown-value mono-telemetry">
          {formatDurationSeconds(
            nextEarthset.seconds_from_reference,
            nextEarthset.beyond_window,
            windowDays,
            t.countdown.windowExceed,
          )}
        </span>
        <span className="countdown-utc mono-telemetry">
          {nextEarthset.time_utc ? nextEarthset.time_utc.replace(".000Z", "Z") : t.countdown.noCrossing}
        </span>
      </div>
    </div>
  );
}
