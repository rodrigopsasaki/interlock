import { existsSync, readFileSync } from "node:fs";
import { resolve, sep } from "node:path";

const root = process.cwd();
const text = readFileSync(resolve(root, "README.md"), "utf8");
const assets = [
  "docs/brand/interlock-wordmark.png",
  "docs/brand/interlock-wordmark-dark.png",
  "docs/brand/interlock-concept.svg",
  "docs/brand/interlock-concept-dark.svg",
  "docs/brand/interlock-critical-path.svg",
  "docs/brand/interlock-critical-path-dark.svg",
];
const retainedAssets = [
  "docs/brand/interlock-concept-mobile.svg",
  "docs/brand/interlock-concept-mobile-dark.svg",
  "docs/brand/interlock-critical-path-mobile.svg",
  "docs/brand/interlock-critical-path-mobile-dark.svg",
];
const svgAssets = [...assets, ...retainedAssets].filter((asset) => asset.endsWith(".svg"));

for (const file of assets) {
  if (existsSync(resolve(root, file)) === false || text.includes(file) === false) {
    throw new Error(`A README asset is missing or unused: ${file}`);
  }
}

if (/<style|<script|style=|class=|file:\/\/|127\.0\.0\.1|\/Users\//i.test(text)) {
  throw new Error("README contains local-only styling or paths");
}

const links = [
  ...Array.from(text.matchAll(/(?:href|src|srcset)="([^"]+)"/g), (match) => match[1]),
  ...Array.from(text.matchAll(/\]\(([^)]+)\)/g), (match) => match[1]),
];
const headings = new Set(
  Array.from(text.matchAll(/^#{1,6}\s+(.+)$/gm), (match) => {
    const heading = match[1];
    if (heading === undefined) throw new Error("Missing heading text");
    return heading
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s_-]/gu, "")
      .replace(/\s/g, "-");
  }),
);

for (const link of links) {
  if (link === undefined) throw new Error("Empty README link");
  if (/^https:\/\//.test(link)) continue;
  if (link.startsWith("#")) {
    if (headings.has(link.slice(1)) === false) throw new Error(`Broken section link: ${link}`);
    continue;
  }
  const [relative] = link.split("#");
  if (relative === undefined) throw new Error(`Invalid README link: ${link}`);
  const target = resolve(root, relative);
  if (target.startsWith(root + sep) === false || existsSync(target) === false) {
    throw new Error(`Broken or out-of-repository README link: ${link}`);
  }
}

for (const file of svgAssets) {
  const svg = readFileSync(resolve(root, file), "utf8");
  if (/<script|<foreignObject|onload=|onclick=/i.test(svg)) {
    throw new Error(`Non-static SVG: ${file}`);
  }
  if (/<title\b/.test(svg) === false || /<desc\b/.test(svg) === false) {
    throw new Error(`SVG needs a title and description: ${file}`);
  }
  const ids = new Set(Array.from(svg.matchAll(/\bid="([^"]+)"/g), (match) => match[1]));
  for (const match of svg.matchAll(/href="#([^"]+)"/g)) {
    if (ids.has(match[1]) === false) throw new Error(`Broken SVG reference in ${file}`);
  }
}

const pictures = Array.from(text.matchAll(/<picture>([\s\S]*?)<\/picture>/g), (match) => match[1]);
const pictureStems = ["interlock-wordmark", "interlock-concept", "interlock-critical-path"];
if (pictures.length !== pictureStems.length)
  throw new Error("Every README illustration needs a picture element");

for (const [index, picture] of pictures.entries()) {
  const stem = pictureStems[index];
  if (picture === undefined || stem === undefined) throw new Error("Missing picture content");
  const fallback = /<img\b[^>]*\bsrc="([^"]+)"/.exec(picture)?.[1];
  if (fallback === undefined || /\balt="[^"]+"/.test(picture) === false) {
    throw new Error(`Missing fallback image or alternative text: ${stem}`);
  }
  const sources = Array.from(picture.matchAll(/<source\b[^>]*>/g), (match) => {
    const media = /\bmedia="([^"]+)"/.exec(match[0])?.[1];
    const srcset = /\bsrcset="([^"]+)"/.exec(match[0])?.[1];
    if (media === undefined || srcset === undefined)
      throw new Error(`Incomplete picture source: ${stem}`);
    return { media, srcset };
  });
  if (
    sources.length !== 2 ||
    sources.some(({ media }) => /^\(prefers-color-scheme: (light|dark)\)$/.test(media) === false)
  ) {
    throw new Error(
      `README picture sources must be light/dark only, without width conditions: ${stem}`,
    );
  }
  const extension = stem === "interlock-wordmark" ? "png" : "svg";
  if (fallback !== `docs/brand/${stem}.${extension}`) {
    throw new Error(`Wrong light-mode fallback: ${stem}`);
  }
  for (const scheme of ["light", "dark"]) {
    const matched = sources.find(({ media }) => media === `(prefers-color-scheme: ${scheme})`);
    const dark = scheme === "dark" ? "-dark" : "";
    if (matched?.srcset !== `docs/brand/${stem}${dark}.${extension}`) {
      throw new Error(`Wrong ${scheme} image: ${stem}`);
    }
  }
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => {
    const value = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const [red, green, blue] = channels;
  if (red === undefined || green === undefined || blue === undefined)
    throw new Error(`Invalid color: ${hex}`);
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

for (const file of svgAssets) {
  const svg = readFileSync(resolve(root, file), "utf8");
  const background = file.includes("-dark") ? "#171d24" : "#faf8f2";
  for (const match of svg.matchAll(/<(?:g|text)\b[^>]*>/g)) {
    if (/font-(?:family|size)=/.test(match[0]) === false) continue;
    const color = /\bfill="(#[\da-f]{6})"/i.exec(match[0])?.[1];
    if (color === undefined) continue;
    const foregroundLuminance = luminance(color);
    const backgroundLuminance = luminance(background);
    const contrast =
      (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
      (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
    if (contrast < 4.5)
      throw new Error(`Low text contrast (${contrast.toFixed(2)}:1): ${file}, ${color}`);
  }
  if (file.endsWith("-dark.svg")) {
    const light = readFileSync(resolve(root, file.replace("-dark.svg", ".svg")), "utf8");
    const withoutColors = (value: string) => value.replace(/#[\da-f]{6}/gi, "#color");
    if (withoutColors(light) !== withoutColors(svg)) {
      throw new Error(`Light and dark geometry or labels have drifted: ${file}`);
    }
  }
}

console.log("README assets and markup checked");
console.log("README theme selection, matching geometry, and text contrast checked");
