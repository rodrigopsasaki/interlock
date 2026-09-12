import { existsSync, readFileSync } from "node:fs";
import { resolve, sep } from "node:path";

const root = process.cwd();
const text = readFileSync(resolve(root, "README.md"), "utf8");
const assets = [
  "docs/brand/interlock-wordmark.png",
  "docs/brand/interlock-concept.svg",
  "docs/brand/interlock-concept-mobile.svg",
  "docs/brand/interlock-critical-path.svg",
];

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

for (const file of assets.filter((asset) => asset.endsWith(".svg"))) {
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

console.log("README assets and markup checked");
