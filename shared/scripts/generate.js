import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendOpenapi = path.resolve(
  __dirname,
  "../../../apps/backend/openapi.json"
);
const sharedOpenapi = path.resolve(__dirname, "../openapi.json");
const schemasPath = path.resolve(__dirname, "../src/schemas.ts");

if (fs.existsSync(backendOpenapi)) {
  // Verify sync before overwriting — CI can diff
  const needsCopy =
    !fs.existsSync(sharedOpenapi) ||
    fs.readFileSync(backendOpenapi, "utf8") !==
      fs.readFileSync(sharedOpenapi, "utf8");
  if (needsCopy) {
    fs.copyFileSync(backendOpenapi, sharedOpenapi);
    console.log(
      "generate: copied apps/backend/openapi.json -> packages/shared/openapi.json"
    );
  } else {
    console.log("generate: openapi.json already in sync");
  }
  try {
    const raw = JSON.parse(fs.readFileSync(sharedOpenapi, "utf8"));
    const paths = Object.keys(raw.paths ?? {}).length;
    console.log(
      `generate: openapi has ${paths} paths, version ${raw.info?.version ?? "?"}`
    );
  } catch {}
} else {
  console.warn("generate: backend openapi not found, skip copy");
}

// Validate schemas.ts exists and re-export is wired
if (fs.existsSync(schemasPath)) {
  console.log("generate: schemas.ts present (zod dual snake/camel helpers)");
} else {
  console.warn("generate: schemas.ts missing");
}

// Touch index.ts to ensure re-export
const indexPath = path.resolve(__dirname, "../src/index.ts");
let idx = fs.readFileSync(indexPath, "utf8");
if (!idx.includes('from "./schemas')) {
  idx = idx.replace(
    "export default openapi;",
    'export default openapi;\nexport * from "./schemas.js";'
  );
  fs.writeFileSync(indexPath, idx);
  console.log("generate: wired schemas export in index.ts");
}

// Try to generate typed client via openapi-typescript (if installed)
try {
  const outDir = path.resolve(__dirname, "../src/generated");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  execSync("npx --yes openapi-typescript ./openapi.json -o ./src/generated/openapi.ts", {
    cwd: path.resolve(__dirname, ".."),
    stdio: "inherit",
  });
  console.log("generate: emitted src/generated/openapi.ts via openapi-typescript");
} catch (e) {
  console.warn(
    "generate: openapi-typescript not available or failed, skip type gen — " +
      (e && e.message ? e.message : String(e))
  );
}

console.log(
  "generate: done — FE can now import { excludedTitleSchema } from '@manhwa-scanner/shared' and types from './generated/openapi.js'"
);
