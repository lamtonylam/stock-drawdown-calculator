import { describe, expect, it } from "vitest";
import { dayAfterAsOf, parseAsOf } from "./asof";

describe("parseAsOf", () => {
  it("treats empty as live mode, not an error", () => {
    expect(parseAsOf(null)).toEqual({ asOf: null, error: null });
    expect(parseAsOf("")).toEqual({ asOf: null, error: null });
    expect(parseAsOf("   ")).toEqual({ asOf: null, error: null });
  });

  it("accepts a 2008 crash date", () => {
    expect(parseAsOf("2008-12-31")).toEqual({
      asOf: "2008-12-31",
      error: null,
    });
  });

  it("rejects malformed and impossible dates", () => {
    expect(parseAsOf("2008").error).toMatch(/YYYY-MM-DD/);
    expect(parseAsOf("12/31/2008").error).toMatch(/YYYY-MM-DD/);
    expect(parseAsOf("2008-02-30").error).toMatch(/not a real date/);
    expect(parseAsOf("2008-13-01").error).toMatch(/not a real date/);
  });

  it("rejects pre-1970 dates and future dates", () => {
    expect(parseAsOf("1969-12-31").error).toMatch(/1970/);
    expect(parseAsOf("2999-01-01").error).toMatch(/future/);
  });
});

describe("dayAfterAsOf", () => {
  it("rolls over month and year boundaries", () => {
    expect(dayAfterAsOf("2008-12-31")).toBe("2009-01-01");
    expect(dayAfterAsOf("2008-02-28")).toBe("2008-02-29"); // leap year
  });
});
