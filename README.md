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