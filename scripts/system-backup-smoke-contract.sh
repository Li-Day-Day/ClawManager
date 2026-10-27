#!/usr/bin/env bash
# Read the controller's admission constants without Node, eval, or a second
# handwritten catalog. Call before any remote operation.
validate_system_backup_smoke_image() {
  [[ "$2" =~ ^[0-9a-f]{64}$ && "$1" =~ ^[A-Za-z0-9][A-Za-z0-9._:/-]*@sha256:[0-9a-f]{64}$ && "$1" == *@sha256:"$2" ]] || {
    echo 'test image must be an immutable repository reference matching the pinned digest' >&2
    return 1
  }
}

load_system_backup_smoke_contract() {
  local source_file="$1"
  [[ -s "$source_file" ]] || { echo 'controller contract source missing' >&2; return 1; }
  EXPECTED_MIGRATIONS="$(sed -nE 's/^[[:space:]]*ContractMigrationCatalogFileCount[[:space:]]*=[[:space:]]*([0-9]+)[[:space:]]*\r?$/\1/p' "$source_file")"
  EXPECTED_CATALOG_HASH="$(sed -nE 's/^[[:space:]]*ContractMigrationCatalogHash[[:space:]]*=[[:space:]]*"([0-9a-f]{64})"[[:space:]]*\r?$/\1/p' "$source_file")"
  [[ "$EXPECTED_MIGRATIONS" =~ ^[1-9][0-9]*$ && "$EXPECTED_CATALOG_HASH" =~ ^[0-9a-f]{64}$ ]] || {
    echo 'controller catalog constants missing, duplicate or malformed' >&2
    return 1
  }
  EXPECTED_CATALOG_PREFIX="${EXPECTED_CATALOG_HASH:0:12}"
}
