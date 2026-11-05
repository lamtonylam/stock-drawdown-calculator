import { describe, expect, it } from "vitest";
import { friendlyExchange, friendlyName } from "./names";

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

  it("maps OMX Helsinki listings", () => {
    expect(friendlyName("NOKIA.HE")).toBe("Nokia");
    expect(friendlyName("remedy.he")).toBe("Remedy Entertainment");
    expect(friendlyName("KNEBV.HE")).toBe("Kone");
  });

  it("maps EUR-listed UCITS ETFs on indices", () => {
    expect(friendlyName("CSPX.AS")).toBe("S&P 500 ETF (EUR)");
    expect(friendlyName("EQQQ.DE")).toBe("Nasdaq 100 ETF (EUR)");
    expect(friendlyName("EUN2.DE")).toBe("EURO STOXX 50 ETF (EUR)");
  });

  it("falls back to the raw symbol", () => {
    expect(friendlyName("XYZ")).toBe("XYZ");
    expect(friendlyName("^UNKNOWN")).toBe("^UNKNOWN");
  });
});

describe("friendlyExchange", () => {
  it("prefers Yahoo's display name when it adds information", () => {
    expect(friendlyExchange("NYQ", "NYSE")).toBe("NYSE");
    expect(friendlyExchange("GER", "XETRA")).toBe("XETRA");
  });

  it("maps codes Yahoo leaves cryptic", () => {
    expect(friendlyExchange("HEL", "HEL")).toBe("Helsinki");
    expect(friendlyExchange("HEL", "")).toBe("Helsinki");
  });

  it("falls back to the raw code", () => {
    expect(friendlyExchange("XYZ", "")).toBe("XYZ");
  });
});
