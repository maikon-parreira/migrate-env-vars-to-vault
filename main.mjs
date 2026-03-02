#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

/**
 * Usage:
 *   node main.mjs --app-name main-bff --env stg --region td-us-1
 *
 * Required files in the same folder:
 *   - baseline.json
 *   - env_vars.json
 *
 * Output:
 *   - result.md
 */

function exitWithError(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      exitWithError(`missing value for --${key}`);
    }
    args[key] = value;
    i++;
  }
  return args;
}

function readJsonFileOrFail(filePath) {
  if (!fs.existsSync(filePath)) {
    exitWithError(`missing required file: ${path.basename(filePath)}`);
  }
  const raw = fs.readFileSync(filePath, "utf-8");
  try {
    return JSON.parse(raw);
  } catch {
    exitWithError(`invalid JSON in file: ${path.basename(filePath)}`);
  }
}

function validateEnvVarsShape(obj, fileName) {
  if (!obj || typeof obj !== "object") {
    exitWithError(`${fileName} must be a JSON object`);
  }
  if (!("env_vars" in obj)) {
    exitWithError(`${fileName} must have top-level key "env_vars"`);
  }
  if (!obj.env_vars || typeof obj.env_vars !== "object" || Array.isArray(obj.env_vars)) {
    exitWithError(`${fileName}.env_vars must be an object`);
  }
}

function isVaultRef(value) {
  return typeof value === "string" && value.startsWith("vault:");
}

/**
 * Decide if a key should be migrated when it is plain-text on target.
 *
 * Rules:
 * 1) If baseline has vault ref for same key => migrate
 * 2) If key does NOT exist in baseline => migrate only if it "looks like secret"
 */
function looksLikeSecretKey(key) {
  const k = key.toUpperCase();

  // Strong signals
  if (k.includes("PASSWORD") || k.includes("SECRET") || k.includes("PRIVATE") || k.includes("CERT")) return true;

  // Key-like signals (with exclusions to avoid migrating IDs/SIDs)
  const hasKeyWord = k.includes("KEY");
  const excluded =
    k.includes("_SID") ||
    k.includes("APP_SID") ||
    k.includes("APP_SIDS") ||
    k.endsWith("_SID") ||
    k.endsWith("_SIDS");

  if (hasKeyWord && !excluded) return true;

  // License keys
  if (k.includes("LICENSE")) return true;

  return false;
}

function buildVaultRef(env, region, appName, key) {
  return `vault:meza_secrets/data/${env}/${region}/k8s/${appName}#${key}`;
}

function markdownEscapeInline(str) {
  return String(str).replace(/`/g, "\\`");
}

// -------------------- main --------------------
const args = parseArgs(process.argv);

const appName = args["app-name"];
const env = args["env"];
const region = args["region"];

if (!appName) exitWithError(`--app-name is required`);
if (!env) exitWithError(`--env is required`);
if (!region) exitWithError(`--region is required`);

const envNorm = env.toLowerCase();
const regionNorm = region;

if ((envNorm === "stg" || envNorm === "qa") && regionNorm !== "td-us-1") {
  exitWithError(`for env "${envNorm}", region must be "td-us-1"`);
}

const cwd = process.cwd();
const baselinePath = path.join(cwd, "baseline.json");
const targetPath = path.join(cwd, "env_vars.json");
const resultPath = path.join(cwd, "result.md");

const baselineJson = readJsonFileOrFail(baselinePath);
const targetJson = readJsonFileOrFail(targetPath);

validateEnvVarsShape(baselineJson, "baseline.json");
validateEnvVarsShape(targetJson, "env_vars.json");

const baselineEnvVars = baselineJson.env_vars;
const targetEnvVars = targetJson.env_vars;

// Find candidates
const migrations = [];
for (const [key, targetValue] of Object.entries(targetEnvVars)) {
  if (targetValue === null || targetValue === undefined) continue;

  // only consider plain-text values
  if (isVaultRef(targetValue)) continue;

  const baselineValue = baselineEnvVars[key];
  const baselineHasVault = isVaultRef(baselineValue);

  const keyExistsInBaseline = Object.prototype.hasOwnProperty.call(baselineEnvVars, key);

  const shouldMigrate =
    (keyExistsInBaseline && baselineHasVault) ||
    (!keyExistsInBaseline && looksLikeSecretKey(key));

  if (!shouldMigrate) continue;

  // value must be string-ish to be used with -v
  const valueStr = typeof targetValue === "string" ? targetValue : JSON.stringify(targetValue);

  migrations.push({
    key,
    value: valueStr,
    vaultRef: buildVaultRef(envNorm, regionNorm, appName, key),
    inBaseline: keyExistsInBaseline,
    baselineVault: baselineHasVault,
  });
}

// Build markdown
let md = "";
md += `${envNorm.toUpperCase()} (${markdownEscapeInline(envNorm)})\n\n`;

if (migrations.length === 0) {
  md += `No variables to migrate.\n`;
} else {
  for (const m of migrations) {
    md += `${m.key}\n\n`;
    md += "```bash\n";
    md += `td secrets:insert -a ${appName} -r ${regionNorm} -k ${m.key} -v ${m.value}\n`;
    md += "```\n\n";
  }

  md += "```bash\n";
  md += `td configs:edit -a ${appName} -r ${regionNorm}\n`;
  md += "```\n\n";

  md += "Then, change these variables to:\n\n";
  md += "```json\n";
  for (const m of migrations) {
    md += `"${m.key}": "${m.vaultRef}",\n`;
  }
  md += "```\n";
}

fs.writeFileSync(resultPath, md, "utf-8");
console.log(`created: ${resultPath}`);
