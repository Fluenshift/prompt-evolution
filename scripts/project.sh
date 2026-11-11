#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="${PROMPT_EVOLUTION_DATA_DIR:-$ROOT_DIR/.data}"
COMMAND="${1:-help}"

cd "$ROOT_DIR"

compose() {
  PROMPT_EVOLUTION_UID="$(id -u)" \
    PROMPT_EVOLUTION_GID="$(id -g)" \
    docker compose "$@"
}

usage() {
  printf '%s\n' \
    "Usage: scripts/project.sh <command>" \
    "" \
    "Commands:" \
    "  start    Start the project in the background" \
    "  rebuild  Rebuild the image and start the project" \
    "  stop     Stop containers without removing them or project data" \
    "  restart  Restart the existing containers" \
    "  status   Show container status" \
    "  logs     Follow application logs" \
    "  down     Remove containers (the bind-mounted database is preserved)"
}

case "$COMMAND" in
  start)
    mkdir -p "$DATA_DIR"
    compose up -d
    ;;
  rebuild)
    mkdir -p "$DATA_DIR"
    compose up -d --build
    ;;
  stop)
    compose stop
    ;;
  restart)
    compose restart
    ;;
  status)
    compose ps
    ;;
  logs)
    compose logs -f --tail="${PROJECT_LOG_TAIL:-100}"
    ;;
  down)
    compose down
    ;;
  help|-h|--help)
    usage
    ;;
  *)
    printf 'Unknown command: %s\n\n' "$COMMAND" >&2
    usage >&2
    exit 2
    ;;
esac
