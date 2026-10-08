#!/usr/bin/env bash
set -Eeuo pipefail

DB_PATH="${DB_PATH:-/var/lib/sentinel/sentinel.db}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/sentinel}"

if [[ ! -f "$DB_PATH" ]]; then
    printf 'SQLite database not found: %s\n' "$DB_PATH" >&2
    exit 1
fi
if ! command -v sqlite3 >/dev/null 2>&1; then
    printf 'sqlite3 CLI is required for database backups.\n' >&2
    exit 1
fi

umask 077
mkdir -p "$BACKUP_DIR"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_path="$BACKUP_DIR/sentinel-$timestamp.db"

sqlite3 "$DB_PATH" ".backup '$backup_path'"
test -s "$backup_path"
find "$BACKUP_DIR" -type f -name 'sentinel-*.db' -mtime +13 -delete

printf 'Database backup created: %s\n' "$backup_path"
