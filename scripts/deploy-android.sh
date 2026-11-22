#!/usr/bin/env bash
#
# Build a release APK and send it to every tester in Firebase App Distribution.
#
# Usage:
#   scripts/deploy-android.sh [build-number] [options]
#
#   Run with no arguments to be asked for each choice. Anything you pass is not asked.
#
#   build-number  Android versionCode. If left out you are asked; when there is no
#                 terminal (e.g. CI) the last one in app.json is reused.
#
# Options:
#   -r, --release TYPE     How to change the version name (asked if not given):
#                            major  1.1.0 -> 2.0.0
#                            minor  1.1.0 -> 1.2.0
#                            patch  1.1.0 -> 1.1.1
#                            none   keep 1.1.0 (no increment)
#   -n, --notes "text"     Release notes shown to testers (default: last git commit subject)
#       --skip-upload      Build only; do not upload or notify testers
#   -h, --help             Show this help
#
# Example:
#   scripts/deploy-android.sh                      # asks everything
#   scripts/deploy-android.sh 3 --release patch --notes "Fix stock filter"
#   scripts/deploy-android.sh --release none     # same version and build number
#
# Needs: Node, Firebase CLI logged in (firebase login), Android SDK, and a JDK
# (falls back to the one bundled with Android Studio).

set -euo pipefail

FIREBASE_PROJECT="calico-549b5"
FIREBASE_APP_ID="1:251845842750:android:7173146f2e4174a17ebe6f"

usage() { sed -n '3,29p' "$0" | sed 's/^# \{0,1\}//'; }
die() { echo "Error: $*" >&2; exit 1; }
step() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

# ---- arguments ------------------------------------------------------------
BUILD_NUMBER=""
NOTES=""
RELEASE_TYPE=""
SKIP_UPLOAD=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    -n|--notes)    NOTES="${2:-}"; shift 2 ;;
    -r|--release)  RELEASE_TYPE="${2:-}"; shift 2 ;;
    --skip-upload) SKIP_UPLOAD=1; shift ;;
    -h|--help)     usage; exit 0 ;;
    -*)            die "unknown option $1 (see --help)" ;;
    *)             [[ -z "$BUILD_NUMBER" ]] || die "build number given twice"; BUILD_NUMBER="$1"; shift ;;
  esac
done

LAST_BUILD="$(node -p "require('./app.json').expo.android.versionCode || 0")"
CURRENT_VERSION="$(node -p "require('./app.json').expo.version")"
INTERACTIVE=0; [[ -t 0 ]] && INTERACTIVE=1
ASKED=0

# Next version for a release type, e.g. bump_version 1.1.0 minor -> 1.2.0
bump_version() {
  local IFS=. maj min pat
  read -r maj min pat <<<"$1"
  case "$2" in
    major) echo "$((maj + 1)).0.0" ;;
    minor) echo "$maj.$((min + 1)).0" ;;
    patch) echo "$maj.$min.$((pat + 1))" ;;
    *)     echo "$1" ;;
  esac
}

# Build number: ask when not passed (interactive), otherwise reuse the last one.
if [[ -z "$BUILD_NUMBER" ]]; then
  if [[ $INTERACTIVE -eq 1 ]]; then
    ASKED=1
    echo
    echo "Build number (last was $LAST_BUILD):"
    PS3="Choose 1-3: "
    select choice in "Next build ($((LAST_BUILD + 1)))" "Reuse last build ($LAST_BUILD)" "Enter a number"; do
      case "$REPLY" in
        1) BUILD_NUMBER=$((LAST_BUILD + 1)); break ;;
        2) BUILD_NUMBER=$LAST_BUILD; break ;;
        3) while :; do
             read -r -p "Build number: " BUILD_NUMBER
             [[ "$BUILD_NUMBER" =~ ^[1-9][0-9]*$ ]] && break
             echo "Enter a positive whole number."
           done
           break ;;
      esac
    done
    [[ -n "$BUILD_NUMBER" ]] || { echo; echo "Cancelled."; exit 1; }
  else
    BUILD_NUMBER="$LAST_BUILD"
    echo "No build number given; reusing the last one ($BUILD_NUMBER)."
  fi
fi
[[ "$BUILD_NUMBER" =~ ^[1-9][0-9]*$ ]] || die "build number must be a positive whole number (got '$BUILD_NUMBER')"

# Release type
if [[ -z "$RELEASE_TYPE" ]]; then
  [[ $INTERACTIVE -eq 1 ]] || die "release type is required (--release major|minor|patch|none)"
  ASKED=1
  echo
  echo "Release type (current version is $CURRENT_VERSION):"
  PS3="Choose 1-4: "
  select choice in \
      "Major  -> $(bump_version "$CURRENT_VERSION" major)" \
      "Minor  -> $(bump_version "$CURRENT_VERSION" minor)" \
      "Patch  -> $(bump_version "$CURRENT_VERSION" patch)" \
      "None   (keep $CURRENT_VERSION)"; do
    case "$REPLY" in
      1) RELEASE_TYPE=major; break ;;
      2) RELEASE_TYPE=minor; break ;;
      3) RELEASE_TYPE=patch; break ;;
      4) RELEASE_TYPE=none; break ;;
    esac
  done
  [[ -n "$RELEASE_TYPE" ]] || { echo; echo "Cancelled."; exit 1; }
fi
case "$RELEASE_TYPE" in
  major|minor|patch|none) ;;
  *) die "release type must be major, minor, patch or none (got '$RELEASE_TYPE')" ;;
esac

# Release notes
DEFAULT_NOTES="$(git log -1 --pretty=%s 2>/dev/null || true)"
if [[ -z "$NOTES" && $INTERACTIVE -eq 1 && $SKIP_UPLOAD -eq 0 ]]; then
  ASKED=1
  echo
  read -r -p "Release notes${DEFAULT_NOTES:+ [$DEFAULT_NOTES]}: " NOTES
fi
NOTES="${NOTES:-$DEFAULT_NOTES}"

# Confirm what was chosen in the prompts before the long build.
if [[ $ASKED -eq 1 ]]; then
  echo
  echo "Ready to build:"
  echo "  Version:      $CURRENT_VERSION -> $(bump_version "$CURRENT_VERSION" "$RELEASE_TYPE") ($RELEASE_TYPE)"
  echo "  Build number: $LAST_BUILD -> $BUILD_NUMBER"
  if [[ $SKIP_UPLOAD -eq 1 ]]; then
    echo "  Upload:       skipped"
  else
    echo "  Notes:        ${NOTES:-Build $BUILD_NUMBER}"
    echo "  Upload:       Firebase App Distribution, all testers"
  fi
  read -r -p "Continue? [Y/n] " answer
  [[ -z "$answer" || "$answer" =~ ^[Yy] ]] || { echo "Cancelled."; exit 0; }
fi

# ---- environment ----------------------------------------------------------

if [[ -z "${JAVA_HOME:-}" ]] || [[ ! -x "$JAVA_HOME/bin/java" ]]; then
  STUDIO_JBR="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
  if /usr/libexec/java_home >/dev/null 2>&1; then
    export JAVA_HOME="$(/usr/libexec/java_home)"
  elif [[ -x "$STUDIO_JBR/bin/java" ]]; then
    export JAVA_HOME="$STUDIO_JBR"
  else
    die "no JDK found. Install Android Studio or set JAVA_HOME."
  fi
fi
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
[[ -d "$ANDROID_HOME" ]] || die "Android SDK not found at $ANDROID_HOME (set ANDROID_HOME)"

command -v node >/dev/null || die "node is not installed"
if [[ $SKIP_UPLOAD -eq 0 ]]; then
  command -v firebase >/dev/null || die "Firebase CLI is not installed (npm i -g firebase-tools)"
fi

[[ -f .env ]] || die ".env is missing; release builds need EXPO_PUBLIC_API_URL (copy .env.example)"
grep -q '^EXPO_PUBLIC_API_URL=https://.*/exec' .env || die "EXPO_PUBLIC_API_URL in .env is not set to a /exec URL"

# ---- 1. find testers first, so we fail before a long build ----------------
TESTERS_FILE=""
if [[ $SKIP_UPLOAD -eq 0 ]]; then
  step "Fetching App Distribution testers"
  TESTERS_FILE="$(mktemp -t calico-testers)"
  trap 'rm -f "$TESTERS_FILE"' EXIT
  firebase appdistribution:testers:list --project "$FIREBASE_PROJECT" --json 2>/dev/null \
    | node -e '
        let s = ""; process.stdin.on("data", d => s += d).on("end", () => {
          const json = JSON.parse(s.slice(s.indexOf("{")));
          if (json.status !== "success") { console.error(json.error || "listing testers failed"); process.exit(1); }
          const emails = (json.result.testers || []).map(t => t.name.split("/testers/")[1]).filter(Boolean);
          process.stdout.write(emails.join("\n"));
        });' > "$TESTERS_FILE" \
    || die "could not list testers (are you logged in? run: firebase login)"
  TESTER_COUNT="$(grep -c . "$TESTERS_FILE" || true)"
  [[ "$TESTER_COUNT" -gt 0 ]] || die "no testers found in project $FIREBASE_PROJECT"
  echo "Found $TESTER_COUNT tester(s)."
fi

# ---- 2. set build number and version in app.json ---------------------------
step "Setting build number $BUILD_NUMBER and $RELEASE_TYPE version in app.json"
BUILD_NUMBER="$BUILD_NUMBER" RELEASE_TYPE="$RELEASE_TYPE" node -e '
  const fs = require("fs");
  const cfg = JSON.parse(fs.readFileSync("app.json", "utf8"));
  const prev = cfg.expo.android.versionCode || 0;
  const next = Number(process.env.BUILD_NUMBER);
  if (next < prev) console.warn(`Warning: build ${next} is lower than the previous ${prev}; Android will refuse to install it over a newer build.`);
  cfg.expo.android.versionCode = next;

  const old = cfg.expo.version;
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(old);
  if (!m) { console.error(`Version in app.json must look like 1.2.3 (got ${old})`); process.exit(1); }
  let [maj, min, pat] = m.slice(1).map(Number);
  switch (process.env.RELEASE_TYPE) {
    case "major": maj++; min = 0; pat = 0; break;
    case "minor": min++; pat = 0; break;
    case "patch": pat++; break;
  }
  const version = `${maj}.${min}.${pat}`;
  cfg.expo.version = version;
  fs.writeFileSync("app.json", JSON.stringify(cfg, null, 2) + "\n");

  // keep package.json in step with the app version
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  if (pkg.version !== version) { pkg.version = version; fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n"); }

  console.log(version === old ? `Version stays ${version}` : `Version ${old} -> ${version}`);
  console.log(next === prev ? `Build number stays ${next}` : `Build number ${prev} -> ${next}`);
'
VERSION_NAME="$(node -p 'require("./app.json").expo.version')"

# ---- 3. regenerate the native project from app.json ------------------------
step "Running expo prebuild (android)"
EXPO_NO_GIT_STATUS=1 CI=1 npx expo prebuild --platform android --no-install

grep -q "versionCode $BUILD_NUMBER\$" android/app/build.gradle \
  || die "android/app/build.gradle does not have versionCode $BUILD_NUMBER after prebuild"

# ---- 4. build the release APK ---------------------------------------------
step "Building release APK $VERSION_NAME ($BUILD_NUMBER)"
(cd android && ./gradlew assembleRelease)

APK="android/app/build/outputs/apk/release/app-release.apk"
[[ -f "$APK" ]] || die "build finished but $APK was not found"
OUT_DIR="$PROJECT_DIR/dist"
mkdir -p "$OUT_DIR"
OUT_APK="$OUT_DIR/calico-$VERSION_NAME-$BUILD_NUMBER.apk"
cp "$APK" "$OUT_APK"
echo "APK: $OUT_APK ($(du -h "$OUT_APK" | cut -f1))"

if [[ $SKIP_UPLOAD -eq 1 ]]; then
  step "Done (upload skipped)"
  exit 0
fi

# ---- 5. upload and distribute ---------------------------------------------
step "Uploading to Firebase App Distribution and notifying $TESTER_COUNT tester(s)"
firebase appdistribution:distribute "$OUT_APK" \
  --project "$FIREBASE_PROJECT" \
  --app "$FIREBASE_APP_ID" \
  --testers-file "$TESTERS_FILE" \
  --release-notes "${NOTES:-Build $BUILD_NUMBER}"

step "Released Calico $VERSION_NAME ($BUILD_NUMBER) to $TESTER_COUNT tester(s)"
