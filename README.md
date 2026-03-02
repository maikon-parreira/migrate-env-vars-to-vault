# migrate-env-vars-to-vault

CLI tool to compare application environment variables against a baseline configuration and generate Vault migration commands.

This tool **does not execute any command**.  
It only generates a `result.md` report with the required commands.

---

## 🎯 Purpose

This script helps standardize secret management across environments by:

- Comparing a target environment configuration against a **baseline**
- Detecting plain-text secrets that should be stored in Vault
- Generating:
  - `td secrets:insert` commands
  - `td configs:edit` instructions
  - Updated Vault references for environment variables

The goal is to align all environments with the same security model defined in the baseline.

---

## 🧠 What is the Baseline?

The **baseline** represents the reference configuration for the application.

Typically:
- It comes from a stable production region (e.g., `td-uk-1`)
- Secrets are already stored as Vault references
- It defines the security standard that other environments must follow

Example:

```json
{
  "env_vars": {
    "SPLIT_IO_KEY": "vault:meza_secrets/data/prd/td-uk-1/k8s/main-bff#SPLIT_IO_KEY"
  }
}
```

## 📥 Required Inputs

The script requires three CLI arguments:

```bash
--app-name
--env
--region
```

Example:
```bash
node main.mjs --app-name main-bff --env stg --region td-us-1
```

## ⚠️ Environment Rules

If env is stg or qa, the region must be td-us-1

The script validates this and will exit if invalid.

## 📂 Required Files

The following files must exist in the same directory as the script:

1️⃣ baseline.json (mandatory)

Reference configuration.

2️⃣ env_vars.json (mandatory)

Target environment configuration.

Both files must have this structure:

```json
{
  "env_vars": {
    "KEY_NAME": "value"
  }
}
```

The script validates:

- File existence
- Valid JSON
- Presence of top-level env_vars
- env_vars must be an object

## 📤 Output

The script generates a file:
```bash
result.md
```

It contains:

1️⃣ Variables that must be migrated
2️⃣ td secrets:insert commands
3️⃣ td configs:edit command
4️⃣ The Vault references to replace plain-text values

## 📝 Example Output
```bash
STG

SPLIT_IO_KEY

td secrets:insert -a main-bff -r td-us-1 -k SPLIT_IO_KEY -v 8brrine...

TWILIO_KEY_SECRET_EU

td secrets:insert -a main-bff -r td-us-1 -k TWILIO_KEY_SECRET_EU -v 4pPx...

td configs:edit -a main-bff -r td-us-1

Then, change these variables to:

"SPLIT_IO_KEY": "vault:meza_secrets/data/stg/td-us-1/k8s/main-bff#SPLIT_IO_KEY",
"TWILIO_KEY_SECRET_EU": "vault:meza_secrets/data/stg/td-us-1/k8s/main-bff#TWILIO_KEY_SECRET_EU",
```

## 🔎 Migration Logic

A variable will be flagged for migration if:

It is stored as a Vault reference in the baseline

It appears as plain text in the target environment

Additionally:

Variables not present in baseline but that appear to be secrets (e.g., contain SECRET, PASSWORD, KEY, LICENSE) may also be flagged

Vault reference format generated:

```bash
vault:meza_secrets/data/<env>/<region>/k8s/<app-name>#<KEY>
```
## 🚫 Important

This tool:

❌ Does NOT execute any td command

❌ Does NOT modify configs

❌ Does NOT write to Vault

❌ Does NOT change infrastructure

It only generates a report for manual review and execution.

## 🚀 Future Improvements

Contributions are welcome.

Planned improvements:

Generate a diff report section (what changed vs baseline)

Add automatic detection and reporting for infra:secrets

Generate td infra:secrets:create commands when missing

Add optional flag to remove deprecated variables (e.g., New Relic)

Add support for multi-region batch processing

Add TypeScript version with stronger typing