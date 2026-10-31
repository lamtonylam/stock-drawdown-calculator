import { describe, expect, it } from "vitest";
import { friendlyName } from "./names";

describe("friendlyName", () => {
  it("maps indices to real names", () => {
    expect(friendlyName("^GSPC")).toBe("S&P 500");
    expect(friendlyName("^NDX")).toBe("Nasdaq 100");
    expect(friendlyName("^DJI")).toBe("Dow Jones");
  });

  it("maps crypto and stocks", () => {
    expect(friendlyName("BTC-USD")).toBe("Bitcoin");
    expect(friendlyName("AAPL")).toBe("Apple");
  });

  it("is case-insensitive", () => {
    expect(friendlyName("aapl")).toBe("Apple");
  });

  it("falls back to the raw symbol", () => {
    expect(friendlyName("XYZ")).toBe("XYZ");
    expect(friendlyName("^UNKNOWN")).toBe("^UNKNOWN");
  });
});
