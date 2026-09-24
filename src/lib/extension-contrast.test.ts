import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const source = readFileSync("chrome-extension/content.js", "utf8");
const functions = source.slice(source.indexOf("  function parseColor("), source.indexOf("  async function deterministicChecks("));
const sample = runInNewContext(`${functions}; textContrastSample`, {
  getComputedStyle: (element: { style: object }) => element.style,
  cleanText: (value: string) => value.trim(),
}) as (element: object) => { ratio: number; threshold: number } | null;
const style = { color: "rgb(130, 130, 130)", backgroundColor: "rgba(0, 0, 0, 0)", backgroundImage: "none", opacity: "1", mixBlendMode: "normal", fontSize: "16px", fontWeight: "400" };
const parent = { style: { ...style, backgroundColor: "rgb(255, 255, 255)" }, parentElement: null };

describe("extension contrast sampling", () => {
  it("resolves transparent text backgrounds through ancestors", () => {
    const result = sample({ style, parentElement: parent, textContent: "Text" })!;
    expect(result.ratio).toBeGreaterThan(3);
    expect(result.ratio).toBeLessThan(4.5);
    expect(result.threshold).toBe(4.5);
  });
  it("does not fail large headings using the normal-text threshold", () => {
    const result = sample({ style: { ...style, fontSize: "32px" }, parentElement: parent, textContent: "Heading" })!;
    expect(result.threshold).toBe(3);
    expect(result.ratio).toBeGreaterThan(result.threshold);
  });
  it("declines ambiguous image backgrounds and translucent foregrounds", () => {
    expect(sample({ style: { ...style, backgroundImage: "url(image.png)" }, parentElement: parent, textContent: "Text" })).toBeNull();
    expect(sample({ style: { ...style, color: "rgba(0, 0, 0, 0.5)" }, parentElement: parent, textContent: "Text" })).toBeNull();
  });
});
