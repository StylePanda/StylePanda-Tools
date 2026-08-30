#!/usr/bin/env bash

set -Eeuo pipefail

umask 022

readonly BASE_DIR="/var/www/stylepanda-tools"
readonly REPO_DIR="${BASE_DIR}/repo"
readonly RELEASES_DIR="${BASE_DIR}/releases"
readonly CURRENT_LINK="${BASE_DIR}/current"
readonly LOCK_FILE="${BASE_DIR}/deploy.lock"
readonly BRANCH="main"
readonly REMOTE="origin"
readonly EXPECTED_REMOTE="git@github-stylepanda-tools:StylePanda/StylePanda-Tools.git"
readonly SSH_CONFIG="/home/simon/.ssh/config"
readonly SSH_KNOWN_HOSTS="/home/simon/.ssh/known_hosts"
readonly GIT_SSH_COMMAND_VALUE="ssh -F ${SSH_CONFIG} -o UserKnownHostsFile=${SSH_KNOWN_HOSTS}"
readonly PRODUCTION_ORIGIN="https://tools.stylepanda.me"
readonly KEEP_RELEASES=5
readonly RELEASE_PATTERN='^[0-9]{14}-[0-9a-f]{7,}$'
readonly -a PUBLIC_PATHS=(
  "index.html"
  "404.html"
  "datenschutz.html"
  "robots.txt"
  "sitemap.xml"
  "assets"
  "tools"
)
readonly -a REQUIRED_FILES=(
  "index.html"
  "404.html"
  "datenschutz.html"
  "robots.txt"
  "sitemap.xml"
  "tools/text/index.html"
  "tools/pdf/index.html"
)
readonly -a HTTPS_PATHS=(
  "/"
  "/tools/text/"
  "/tools/pdf/"
  "/datenschutz.html"
  "/robots.txt"
  "/sitemap.xml"
)
readonly -a SECURITY_HEADERS=(
  "X-Content-Type-Options"
  "Referrer-Policy"
  "X-Frame-Options"
  "Permissions-Policy"
  "Content-Security-Policy"
)

staging_dir=""
temporary_link=""
new_release=""
previous_release=""
target_commit=""
switched=0

log() {
  printf '[deploy] %s\n' "$*"
}

fail() {
  printf '[deploy] ERROR: %s\n' "$*" >&2
  return 1
}

cleanup() {
  if [[ -n "${temporary_link}" && -L "${temporary_link}" ]]; then
    unlink -- "${temporary_link}" || true
  fi
  if [[ -n "${staging_dir}" && -d "${staging_dir}" ]]; then
    if [[ "${staging_dir}" == "${RELEASES_DIR}"/.*.tmp.* ]]; then
      rm -rf -- "${staging_dir}"
    else
      printf '[deploy] Refusing to clean unexpected staging path: %s\n' "${staging_dir}" >&2
    fi
  fi
}

atomic_link() {
  local target="$1"
  local link_path="$2"
  local temp_path="${BASE_DIR}/.current.$$.tmp"

  [[ "${link_path}" == "${CURRENT_LINK}" ]] || fail "Refusing unexpected symlink target: ${link_path}"
  [[ -d "${target}" ]] || fail "Release target is not a directory: ${target}"
  [[ "$(dirname -- "${target}")" == "${RELEASES_DIR}" ]] || fail "Release target is outside releases directory"

  temporary_link="${temp_path}"
  ln -s -- "${target}" "${temporary_link}"
  mv -Tf -- "${temporary_link}" "${link_path}"
  temporary_link=""
}

rollback() {
  log "Smoke test failed; starting rollback"
  if [[ -n "${previous_release}" ]]; then
    atomic_link "${previous_release}" "${CURRENT_LINK}"
    log "Rollback restored: ${previous_release}"
  else
    if [[ -L "${CURRENT_LINK}" ]]; then
      unlink -- "${CURRENT_LINK}"
    fi
    log "Rollback removed failed first-deployment link; no previous release existed"
  fi
  switched=0
}

on_error() {
  local exit_code=$?
  trap - ERR
  if (( switched == 1 )); then
    if ! rollback; then
      printf '[deploy] CRITICAL: automatic rollback failed; manual intervention required\n' >&2
    fi
  fi
  printf '[deploy] DEPLOYMENT FAILED (exit %d)\n' "${exit_code}" >&2
  exit "${exit_code}"
}

trap cleanup EXIT
trap on_error ERR

require_root() {
  [[ "${EUID}" -eq 0 ]] || fail "Run this script as root, for example with sudo"
}

require_commands() {
  local command_name
  for command_name in basename curl cut date dirname find flock git grep ln mkdir mktemp mv readlink rm sort ssh stat tail tar tr unlink; do
    command -v "${command_name}" >/dev/null 2>&1 || fail "Required command not found: ${command_name}"
  done
}

acquire_lock() {
  exec 9>"${LOCK_FILE}"
  flock -n 9 || fail "Another deployment is already running"
  log "Deployment lock acquired"
}

validate_repository() {
  local actual_remote current_branch upstream fetch_refspec status_output

  [[ -d "${BASE_DIR}" ]] || fail "Base directory is missing: ${BASE_DIR}"
  [[ -d "${RELEASES_DIR}" ]] || fail "Releases directory is missing: ${RELEASES_DIR}"
  [[ -d "${REPO_DIR}" ]] || fail "Repository directory is missing: ${REPO_DIR}"
  [[ -f "${SSH_CONFIG}" && -r "${SSH_CONFIG}" ]] || fail "SSH config is missing or unreadable: ${SSH_CONFIG}"
  [[ -f "${SSH_KNOWN_HOSTS}" && -r "${SSH_KNOWN_HOSTS}" ]] || fail "known_hosts is missing or unreadable: ${SSH_KNOWN_HOSTS}"
  git -C "${REPO_DIR}" rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail "Repository directory is not a valid Git worktree"

  actual_remote="$(git -C "${REPO_DIR}" remote get-url "${REMOTE}")"
  [[ "${actual_remote}" == "${EXPECTED_REMOTE}" ]] || fail "Unexpected origin remote: ${actual_remote}"

  current_branch="$(git -C "${REPO_DIR}" symbolic-ref --quiet --short HEAD)"
  [[ "${current_branch}" == "${BRANCH}" ]] || fail "Production checkout must be on ${BRANCH}, found ${current_branch}"
  upstream="$(git -C "${REPO_DIR}" rev-parse --abbrev-ref --symbolic-full-name '@{upstream}')"
  [[ "${upstream}" == "${REMOTE}/${BRANCH}" ]] || fail "${BRANCH} must track ${REMOTE}/${BRANCH}, found ${upstream}"
  fetch_refspec="$(git -C "${REPO_DIR}" config --get-all "remote.${REMOTE}.fetch")"
  grep -Eq "refs/heads/(\\*|${BRANCH}):refs/remotes/${REMOTE}/(\\*|${BRANCH})" <<<"${fetch_refspec}" || fail "origin fetch configuration does not include ${BRANCH}"

  status_output="$(git -C "${REPO_DIR}" status --porcelain=v1 --untracked-files=all)"
  [[ -z "${status_output}" ]] || fail "Production checkout contains local changes or untracked files"
  log "Repository and Git/SSH configuration validated"
}

fetch_target() {
  local short_commit timestamp release_name

  log "Fetching GitHub ${REMOTE}/${BRANCH}"
  env GIT_SSH_COMMAND="${GIT_SSH_COMMAND_VALUE}" git -C "${REPO_DIR}" fetch --prune "${REMOTE}" "+refs/heads/${BRANCH}:refs/remotes/${REMOTE}/${BRANCH}"
  git -C "${REPO_DIR}" show-ref --verify --quiet "refs/remotes/${REMOTE}/${BRANCH}" || fail "Fetched ${REMOTE}/${BRANCH} reference is missing"
  target_commit="$(git -C "${REPO_DIR}" rev-parse --verify "refs/remotes/${REMOTE}/${BRANCH}^{commit}")"
  short_commit="$(git -C "${REPO_DIR}" rev-parse --short=7 "${target_commit}")"
  timestamp="$(date -u +%Y%m%d%H%M%S)"
  release_name="${timestamp}-${short_commit}"
  [[ "${release_name}" =~ ${RELEASE_PATTERN} ]] || fail "Generated release name is invalid"

  new_release="${RELEASES_DIR}/${release_name}"
  staging_dir="${RELEASES_DIR}/.${release_name}.tmp.$$"
  [[ ! -e "${new_release}" && ! -e "${staging_dir}" ]] || fail "Release path already exists: ${new_release}"
  log "Target commit: ${target_commit}"
  log "New release: ${new_release}"
}

record_previous_release() {
  local resolved

  if [[ -e "${CURRENT_LINK}" && ! -L "${CURRENT_LINK}" ]]; then
    fail "Current path exists but is not a symlink: ${CURRENT_LINK}"
  fi
  if [[ -L "${CURRENT_LINK}" ]]; then
    resolved="$(readlink -f -- "${CURRENT_LINK}")"
    [[ -n "${resolved}" && -d "${resolved}" ]] || fail "Current symlink does not resolve to a directory"
    [[ "$(dirname -- "${resolved}")" == "${RELEASES_DIR}" ]] || fail "Current symlink points outside releases directory"
    [[ "$(basename -- "${resolved}")" =~ ${RELEASE_PATTERN} ]] || fail "Current symlink target is not a managed release"
    previous_release="${resolved}"
    log "Previous release: ${previous_release}"
  else
    log "Previous release: none (first deployment)"
  fi
}

create_release() {
  mkdir -- "${staging_dir}"
  git -C "${REPO_DIR}" archive "${target_commit}" -- "${PUBLIC_PATHS[@]}" | tar -x -C "${staging_dir}"
  mv -- "${staging_dir}" "${new_release}"
  staging_dir=""
  log "Immutable release created from fetched commit"
}

validate_release() {
  local relative_path unexpected

  for relative_path in "${REQUIRED_FILES[@]}"; do
    [[ -f "${new_release}/${relative_path}" && -r "${new_release}/${relative_path}" ]] || fail "Required readable file missing: ${relative_path}"
  done
  [[ -d "${new_release}/assets" && -r "${new_release}/assets" ]] || fail "Required assets directory is missing or unreadable"

  unexpected="$(find "${new_release}" -type l -print -quit)"
  [[ -z "${unexpected}" ]] || fail "Unexpected symlink in release: ${unexpected}"
  unexpected="$(find "${new_release}" -type f ! -readable -print -quit)"
  [[ -z "${unexpected}" ]] || fail "Unreadable file in release: ${unexpected}"
  unexpected="$(find "${new_release}" \( -name '.env' -o -name '.env.*' -o -name '.git' -o -name 'tests' -o -name 'README.md' -o -name 'deploy.sh' -o -name 'STYLEPANDA_TOOLS_*_REPORT.txt' \) -print -quit)"
  [[ -z "${unexpected}" ]] || fail "Development or sensitive item found in release: ${unexpected}"

  grep -q '<h1' "${new_release}/index.html" || fail "Homepage content marker missing"
  grep -q 'Datenschutzerklärung' "${new_release}/datenschutz.html" || fail "Privacy policy content marker missing"
  grep -q 'Sitemap: https://tools.stylepanda.me/sitemap.xml' "${new_release}/robots.txt" || fail "robots.txt sitemap marker missing"
  log "Release validation passed"
}

switch_current() {
  atomic_link "${new_release}" "${CURRENT_LINK}"
  switched=1
  log "Current switched atomically to: ${new_release}"
}

check_https_response() {
  local path="$1"
  local url="${PRODUCTION_ORIGIN}${path}"
  local header_file status header_name

  header_file="$(mktemp)"
  status="$(curl --silent --show-error --max-time 20 --output /dev/null --dump-header "${header_file}" --write-out '%{http_code}' "${url}")"
  [[ "${status}" == "200" ]] || {
    rm -f -- "${header_file}"
    fail "HTTPS smoke test returned ${status} for ${url}"
  }
  for header_name in "${SECURITY_HEADERS[@]}"; do
    if ! grep -qi "^${header_name}:" "${header_file}"; then
      rm -f -- "${header_file}"
      fail "Security header ${header_name} is missing for ${url}"
    fi
  done
  rm -f -- "${header_file}"
  log "Smoke test passed: ${url} (200 + security headers)"
}

check_http_redirect() {
  local header_file status location

  header_file="$(mktemp)"
  status="$(curl --silent --show-error --max-time 20 --output /dev/null --dump-header "${header_file}" --write-out '%{http_code}' 'http://tools.stylepanda.me/')"
  location="$(grep -i '^Location:' "${header_file}" | tail -n 1 | tr -d '\r' | cut -d' ' -f2-)"
  rm -f -- "${header_file}"
  [[ "${status}" =~ ^30[1278]$ ]] || fail "HTTP endpoint did not redirect; status ${status}"
  [[ "${location}" == https://tools.stylepanda.me/* ]] || fail "HTTP redirect target is not the production HTTPS origin"
  log "HTTP-to-HTTPS redirect passed: ${status} -> ${location}"
}

run_smoke_tests() {
  local path missing_path missing_status

  log "Starting production smoke tests"
  for path in "${HTTPS_PATHS[@]}"; do
    check_https_response "${path}"
  done
  missing_path="/deployment-smoke-missing-$RANDOM-$RANDOM"
  missing_status="$(curl --silent --show-error --max-time 20 --output /dev/null --write-out '%{http_code}' "${PRODUCTION_ORIGIN}${missing_path}")"
  [[ "${missing_status}" == "404" ]] || fail "Missing URL returned ${missing_status}, expected 404"
  log "Custom 404 status passed: ${missing_path} (404)"
  check_http_redirect
}

prune_releases() {
  local -a releases=()
  local index release_name candidate resolved_current

  resolved_current="$(readlink -f -- "${CURRENT_LINK}")"
  mapfile -t releases < <(find "${RELEASES_DIR}" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | grep -E "${RELEASE_PATTERN}" | sort -r)
  for (( index=KEEP_RELEASES; index<${#releases[@]}; index++ )); do
    release_name="${releases[index]}"
    [[ "${release_name}" =~ ${RELEASE_PATTERN} ]] || continue
    candidate="${RELEASES_DIR}/${release_name}"
    [[ "$(dirname -- "${candidate}")" == "${RELEASES_DIR}" ]] || fail "Retention candidate escaped releases directory"
    if [[ "${candidate}" == "${resolved_current}" || "${candidate}" == "${previous_release}" ]]; then
      log "Retention protected: ${candidate}"
      continue
    fi
    rm -rf -- "${candidate}"
    log "Retention removed old managed release: ${candidate}"
  done
  log "Release retention completed (target: ${KEEP_RELEASES}; current and previous protected)"
}

main() {
  require_root
  require_commands
  [[ -d "${BASE_DIR}" ]] || fail "Base directory is missing: ${BASE_DIR}"
  acquire_lock
  validate_repository
  fetch_target
  record_previous_release
  create_release
  validate_release
  switch_current
  run_smoke_tests
  prune_releases
  switched=0
  log "DEPLOYMENT SUCCEEDED: ${new_release}"
}

main "$@"
