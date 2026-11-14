import { describe, expect, it } from "vitest";
import { coordinateKey } from "../src/components/ComparisonGrid";
import { formatDurationSeconds } from "../src/components/EventCountdown";
import { buildExternalPortalLinks } from "../src/services/apiClient";
import { CONTRACT_VERSION } from "../src/types/contracts";

describe("Lunar Landing Site Navigator — Contratos y Utilidades UI (v0.2.0)", () => {
  it("expone CONTRACT_VERSION 0.2.0", () => {
    expect(CONTRACT_VERSION).toBe("0.2.0");
  });

  it("genera deep-links al nuevo dominio oficial de LROC QuickMap y NASA Moon Trek", () => {
    const polar = buildExternalPortalLinks(-89.68, -166.0);
    expect(polar.quickmap_url.startsWith("https://quickmap.lroc.im-ldi.com/")).toBe(true);
    expect(polar.quickmap_url.includes("proj=17")).toBe(true);
    expect(polar.moontrek_url.startsWith("https://trek.nasa.gov/moon/")).toBe(true);

    const eq = buildExternalPortalLinks(0.67409, 23.47298);
    expect(eq.quickmap_url.includes("proj=16")).toBe(true);
  });

  it("formatea correctamente cuentas atras de Sunset y Earthset", () => {
    expect(formatDurationSeconds(null, true, 14)).toBe("> ventana (14 d)");
    expect(formatDurationSeconds(90060, false, 14)).toBe("1d 01h 01m");
    expect(formatDurationSeconds(7200, false, 14)).toBe("02h 00m");
  });

  it("construye claves unicas para sitios curados y coordenadas personalizadas", () => {
    expect(
      coordinateKey({ lat_deg: -89.68, lon_deg: -166.0, observer_height_m: 1.5, site_id: "shackleton-rim" }),
    ).toBe("shackleton-rim");
    expect(
      coordinateKey({ lat_deg: -85.1234, lon_deg: 12.5, observer_height_m: 2.0, site_id: null }),
    ).toBe("custom_-85.1234_12.5000");
  });
});
