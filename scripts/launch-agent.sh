#!/usr/bin/env bash

set -euo pipefail

LABEL="${OAIPROXY_LAUNCHD_LABEL:-dev.oaiproxy.server}"
DOMAIN="gui/$(id -u)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
PLIST_PATH="${HOME}/Library/LaunchAgents/${LABEL}.plist"
LOG_DIR="${OAIPROXY_LOG_DIR:-${HOME}/Library/Logs/oaiproxy}"
STDOUT_LOG="${LOG_DIR}/stdout.log"
STDERR_LOG="${LOG_DIR}/stderr.log"
HOST_VALUE="${HOST:-127.0.0.1}"
PORT_VALUE="${PORT:-1455}"
LOG_LEVEL_VALUE="${LOG_LEVEL:-info}"
UPSTREAM_TIMEOUT_MS_VALUE="${UPSTREAM_TIMEOUT_MS:-30000}"
CODEX_HOME_VALUE="${CODEX_HOME:-}"

usage() {
  cat <<EOF
Usage: $(basename "$0") <install|uninstall|status|logs>

Commands:
  install    Write the LaunchAgent plist and start the background service.
  uninstall  Stop the LaunchAgent and remove its plist.
  status     Show plist/log locations and launchctl status.
  logs       Tail the launchd stdout/stderr logs.
EOF
}

find_node_binary() {
  if [[ -n "${NODE_BINARY:-}" ]]; then
    printf '%s\n' "${NODE_BINARY}"
    return
  fi

  if command -v node >/dev/null 2>&1; then
    command -v node
    return
  fi

  echo "node not found in PATH. Set NODE_BINARY explicitly." >&2
  exit 1
}

detect_auth_file() {
  local candidate

  for candidate in \
    "${HOME}/.chatgpt-codex/auth.json" \
    "${CODEX_HOME:-}/auth.json" \
    "${HOME}/.codex/auth.json"
  do
    if [[ -n "${candidate}" && -f "${candidate}" ]]; then
      printf '%s\n' "${candidate}"
      return
    fi
  done

  return 1
}

write_plist() {
  local node_bin node_dir auth_file codex_home_entry

  node_bin="$(find_node_binary)"
  node_dir="$(dirname "${node_bin}")"
  auth_file="$(detect_auth_file || true)"
  codex_home_entry=""

  if [[ -n "${CODEX_HOME_VALUE}" ]]; then
    codex_home_entry=$(cat <<EOF
    <key>CODEX_HOME</key>
    <string>${CODEX_HOME_VALUE}</string>
EOF
)
  fi

  if [[ -z "${auth_file}" ]]; then
    cat >&2 <<EOF
No auth file found.

Complete browser auth first with:
  npm run start

Then re-run:
  npm run launchd:install
EOF
    exit 1
  fi

  mkdir -p "$(dirname "${PLIST_PATH}")" "${LOG_DIR}"

  cat > "${PLIST_PATH}" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${node_bin}</string>
    <string>--import</string>
    <string>tsx</string>
    <string>src/server.ts</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${PROJECT_ROOT}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>
    <string>${HOME}</string>
    <key>PATH</key>
    <string>${node_dir}:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>HOST</key>
    <string>${HOST_VALUE}</string>
    <key>PORT</key>
    <string>${PORT_VALUE}</string>
    <key>LOG_LEVEL</key>
    <string>${LOG_LEVEL_VALUE}</string>
    <key>UPSTREAM_TIMEOUT_MS</key>
    <string>${UPSTREAM_TIMEOUT_MS_VALUE}</string>
${codex_home_entry}
  </dict>
  <key>StandardOutPath</key>
  <string>${STDOUT_LOG}</string>
  <key>StandardErrorPath</key>
  <string>${STDERR_LOG}</string>
</dict>
</plist>
EOF

  plutil -lint "${PLIST_PATH}" >/dev/null
}

bootout_if_loaded() {
  launchctl bootout "${DOMAIN}/${LABEL}" >/dev/null 2>&1 || \
    launchctl bootout "${DOMAIN}" "${PLIST_PATH}" >/dev/null 2>&1 || true
}

install_agent() {
  write_plist
  bootout_if_loaded
  launchctl bootstrap "${DOMAIN}" "${PLIST_PATH}"
  # RunAtLoad starts the service; kickstart only needed if already bootstrapped
  launchctl kickstart -k "${DOMAIN}/${LABEL}" >/dev/null 2>&1 || true

  cat <<EOF
Installed ${LABEL}
  plist: ${PLIST_PATH}
  logs:  ${LOG_DIR}

Use:
  npm run launchd:status
  npm run launchd:logs
EOF
}

uninstall_agent() {
  bootout_if_loaded
  rm -f "${PLIST_PATH}"

  cat <<EOF
Removed ${LABEL}
  plist: ${PLIST_PATH}
EOF
}

status_agent() {
  if [[ ! -f "${PLIST_PATH}" ]]; then
    cat <<EOF
${LABEL} is not installed.
Expected plist path:
  ${PLIST_PATH}
EOF
    return 1
  fi

  cat <<EOF
label: ${LABEL}
plist: ${PLIST_PATH}
logs:
  ${STDOUT_LOG}
  ${STDERR_LOG}
EOF
  echo
  launchctl print "${DOMAIN}/${LABEL}"
}

logs_agent() {
  mkdir -p "${LOG_DIR}"
  touch "${STDOUT_LOG}" "${STDERR_LOG}"
  tail -n 50 -f "${STDOUT_LOG}" "${STDERR_LOG}"
}

main() {
  if [[ $# -ne 1 ]]; then
    usage
    exit 1
  fi

  case "$1" in
    install) install_agent ;;
    uninstall) uninstall_agent ;;
    status) status_agent ;;
    logs) logs_agent ;;
    *)
      usage
      exit 1
      ;;
  esac
}

main "$@"
