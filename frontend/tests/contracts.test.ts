import { describe, expect, it } from "vitest";
import {
  angularDifference,
  azimuthToCardinal,
  computeShadowSectors,
  coordinateKey,
  polarToSvg,
} from "../src/components/ComparisonGrid";
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

  it("calcula proyecciones trigonometricas de la Brujula Solar (polarToSvg y angularDifference)", () => {
    // 0° Norte: arriba (x = cx, y = cy - r)
    const north = polarToSvg(0, 80, 110, 110);
    expect(north.x).toBe(110);
    expect(north.y).toBe(30);

    // 90° Este: derecha (x = cx + r, y = cy)
    const east = polarToSvg(90, 80, 110, 110);
    expect(east.x).toBe(190);
    expect(east.y).toBe(110);

    // 180° Sur: abajo (x = cx, y = cy + r)
    const south = polarToSvg(180, 80, 110, 110);
    expect(south.x).toBe(110);
    expect(south.y).toBe(190);

    // 270° Oeste: izquierda (x = cx - r, y = cy)
    const west = polarToSvg(270, 80, 110, 110);
    expect(west.x).toBe(30);
    expect(west.y).toBe(110);

    // Cardinales
    expect(azimuthToCardinal(0)).toBe("N");
    expect(azimuthToCardinal(57)).toBe("ENE");
    expect(azimuthToCardinal(91)).toBe("E");
    expect(azimuthToCardinal(180)).toBe("S");
    expect(azimuthToCardinal(270)).toBe("W");

    // Diferencia angular
    expect(angularDifference(10, 350)).toBe(20);
    expect(angularDifference(90, 90)).toBe(0);
    expect(angularDifference(0, 180)).toBe(180);
  });

  it("calcula sectores angulares de sombra topografica (computeShadowSectors)", () => {
    // Si no hay muestras, devuelve sectores vacíos
    expect(computeShadowSectors([], null)).toEqual([]);

    // Muestra simulada con Sol oculto a 180°
    const mockSample: any = {
      sun: {
        azimuth_deg: 180.0,
        elevation_deg: 0.5,
        horizon_elevation_deg: 2.0,
        clearance_deg: -1.5,
        state: "occulted",
        visible_fraction: 0.0,
      },
    };

    const sectors = computeShadowSectors([mockSample], null);
    expect(sectors.length).toBeGreaterThan(0);
    // El sector debe incluir 180°
    const sector180 = sectors.find((s) => s.startDeg <= 180 && s.endDeg >= 180);
    expect(sector180).toBeDefined();
  });
});
