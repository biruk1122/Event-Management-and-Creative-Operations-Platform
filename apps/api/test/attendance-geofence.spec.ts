import { describe, expect, it } from "vitest";

import { haversineDistanceMeters } from "../src/attendance/geofence.js";

describe("haversineDistanceMeters", () => {
  it("returns zero for identical coordinates", () => {
    const point = { latitude: 9.03, longitude: 38.74 };
    expect(haversineDistanceMeters(point, point)).toBe(0);
  });

  it("matches a known reference distance within a small tolerance", () => {
    // Addis Ababa Bole to Addis Ababa Mexico Square - roughly 7.5km apart.
    const bole = { latitude: 8.9806, longitude: 38.7992 };
    const mexico = { latitude: 9.0192, longitude: 38.7469 };
    const distance = haversineDistanceMeters(bole, mexico);
    expect(distance).toBeGreaterThan(6_000);
    expect(distance).toBeLessThan(9_000);
  });

  it("is symmetric regardless of argument order", () => {
    const a = { latitude: 9.03, longitude: 38.74 };
    const b = { latitude: 9.05, longitude: 38.76 };
    expect(haversineDistanceMeters(a, b)).toBeCloseTo(
      haversineDistanceMeters(b, a),
      6,
    );
  });

  it("computes a small, precise distance for nearby points (geofence-edge scale)", () => {
    // ~0.00135 degrees of latitude is almost exactly 150 meters.
    const center = { latitude: 9.03, longitude: 38.74 };
    const nearby = { latitude: 9.03 + 0.00135, longitude: 38.74 };
    const distance = haversineDistanceMeters(center, nearby);
    expect(distance).toBeGreaterThan(140);
    expect(distance).toBeLessThan(160);
  });

  it("never returns NaN for antipodal-style large separations", () => {
    const a = { latitude: 89, longitude: 0 };
    const b = { latitude: -89, longitude: 180 };
    expect(Number.isFinite(haversineDistanceMeters(a, b))).toBe(true);
  });
});
