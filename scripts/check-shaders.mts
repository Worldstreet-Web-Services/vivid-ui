// Compiles the two shaders in a real WebGL context and fails on any error.
//
// Run with:  pnpm check:shaders
//
// tsc and eslint never see inside a GLSL template string, so a reserved word,
// a missing semicolon or a type mismatch ships silently and the presence
// renders black. This writes the sources to a scratch page, opens it in a
// headless browser with software GL, and reads back the compiler's own log.
// It needs a Chromium-family browser on the machine; it says so if none is.

import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { CORE_VERT, CORE_FRAG } from "../lib/vivid/core-shaders";

const BROWSERS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
];
const browser = process.env.CHROME ?? BROWSERS.find((b) => existsSync(b));
if (!browser) {
  console.log("check-shaders: no Chromium-family browser found; skipping (set CHROME=/path to run)");
  process.exit(0);
}

const dir = resolve(".scratch/shader-check");
mkdirSync(dir, { recursive: true });
writeFileSync(
  resolve(dir, "shaders.js"),
  `export const VERT = ${JSON.stringify(CORE_VERT)};\nexport const FRAG = ${JSON.stringify(CORE_FRAG)};\n`
);
// The same prelude three.js prepends to a ShaderMaterial, so the sources
// compile standalone exactly as they will in the app.
writeFileSync(
  resolve(dir, "index.html"),
  `<!doctype html><body><pre id=o></pre><script type=module>
import { VERT, FRAG } from "./shaders.js";
const o = document.getElementById("o"); const log = s => o.textContent += s + "\\n";
const gl = document.createElement("canvas").getContext("webgl");
if (!gl) { log("NO WEBGL"); }
else {
  const preV = "precision highp float;\\nuniform mat4 modelViewMatrix;\\nuniform mat4 projectionMatrix;\\nuniform vec3 cameraPosition;\\nattribute vec3 position;\\n";
  const preF = "precision highp float;\\n";
  for (const [name, type, src] of [["VERT", gl.VERTEX_SHADER, preV + VERT], ["FRAG", gl.FRAGMENT_SHADER, preF + FRAG]]) {
    const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh);
    const ok = gl.getShaderParameter(sh, gl.COMPILE_STATUS);
    log(name + ": " + (ok ? "OK" : "FAILED"));
    if (!ok) log(gl.getShaderInfoLog(sh));
  }
}
</script></body>`
);

// A throwaway static server on a free port.
const port = 3400 + Math.floor(Math.random() * 500);
const server = spawn("python3", ["-m", "http.server", String(port)], { cwd: dir, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 800));

let dom = "";
try {
  dom = execFileSync(
    browser,
    [
      "--headless=new", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
      "--ignore-gpu-blocklist", "--timeout=6000", "--dump-dom", `http://localhost:${port}/index.html`,
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
  );
} finally {
  server.kill();
}

const report = (dom.match(/<pre id="o">([\s\S]*?)<\/pre>/)?.[1] ?? "")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").trim();
console.log(report.split("\n").map((l) => "  " + l).join("\n"));
if (!report.includes("VERT: OK") || !report.includes("FRAG: OK")) {
  console.error("check-shaders: a shader failed to compile");
  process.exit(1);
}
