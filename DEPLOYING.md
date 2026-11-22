# Sending a new Android build to testers

`scripts/deploy-android.sh` builds a release APK on your Mac, uploads it to **Firebase App Distribution**
(project `calico-549b5`) and emails it to **every tester** in the project. Testers install it from the
email link or the Firebase App Tester app.

A full run takes about 4 minutes (most of it is the Gradle build).

---

## One-time setup

You only need to do this once per Mac.

1. **Android Studio** installed (the script uses its bundled Java and the Android SDK at
   `~/Library/Android/sdk`). If your SDK is somewhere else, set `ANDROID_HOME`.
2. **Node.js 20+** and the project's packages:
   ```bash
   cd mobile
   npm install
   ```
3. **Firebase CLI**, logged in with an account that can manage the `calico-549b5` project:
   ```bash
   npm install -g firebase-tools
   firebase login
   ```
4. **`.env`** with the live API URL. Release builds bake this URL into the app, and the script stops if it is
   missing:
   ```bash
   cp .env.example .env    # then paste the /exec URL
   ```
5. **At least one tester** in App Distribution (see [Managing testers](#managing-testers)).

---

## Quick start

From the `mobile` folder, run the script with no arguments and answer the questions:

```bash
scripts/deploy-android.sh
```

```
Build number (last was 2):
1) Next build (3)
2) Reuse last build (2)
3) Enter a number
Choose 1-3: 1

Release type (current version is 1.1.0):
1) Major  -> 2.0.0	3) Patch  -> 1.1.1
2) Minor  -> 1.2.0	4) None   (keep 1.1.0)
Choose 1-4: 3

Release notes [last commit message]: Fix stock filter

Ready to build:
  Version:      1.1.0 -> 1.1.1 (patch)
  Build number: 2 -> 3
  Notes:        Fix stock filter
  Upload:       Firebase App Distribution, all testers
Continue? [Y/n]
```

Press **Enter** at "Continue?" to build and send. Answer **n** (or press **Ctrl‑D** at any menu) to stop
without changing anything.

You can also run it as `npm run deploy:android`.

---

## The questions explained

### Build number

The Android `versionCode`: a whole number phones use to tell which build is newer.

| Choice | Use it when |
|---|---|
| **Next build** | Almost always. Testers get the new build as an update. |
| **Reuse last build** | Rebuilding the same release (for example, the last upload failed). Phones that already have that build won't treat it as an update. |
| **Enter a number** | You need a specific number. It must be higher than any build testers already have, or Android refuses to install it over theirs. |

### Release type

The version name people see in the app (`1.1.0`). Pick what this build changes:

| Choice | Example | Use it for |
|---|---|---|
| **Major** | 1.1.0 → 2.0.0 | Big changes, a redesign, anything that needs a new API |
| **Minor** | 1.1.0 → 1.2.0 | New features or screens |
| **Patch** | 1.1.0 → 1.1.1 | Bug fixes and small tweaks |
| **None** | stays 1.1.0 | Rebuilding the same version |

The new version is saved in both `app.json` and `package.json`.

### Release notes

Shown to testers in the email and in App Tester. Press **Enter** to use the last git commit message.

---

## Skipping the questions

Anything you pass on the command line is not asked. Pass everything to run without any prompts:

```bash
scripts/deploy-android.sh 3 --release patch --notes "Fix stock filter"
```

| Argument | Meaning |
|---|---|
| `3` (first argument) | Build number. Leave it out to be asked. |
| `-r`, `--release` | `major`, `minor`, `patch` or `none` |
| `-n`, `--notes` | Release notes |
| `--skip-upload` | Build the APK only. Nothing is uploaded and no one is notified. |
| `-h`, `--help` | Show the help |

More examples:

```bash
# Asks only for the release type and notes
scripts/deploy-android.sh 3

# Rebuild the same version and build number
scripts/deploy-android.sh --release none --notes "Rebuild"

# Make an APK to install yourself, without telling testers
scripts/deploy-android.sh --release none --skip-upload
```

When there is no terminal to ask in (for example in CI), the script reuses the last build number if you
don't pass one, and `--release` is required.

---

## What the script does

1. Checks your answers, Java, the Android SDK, the Firebase CLI and `.env`.
2. Gets the list of testers from Firebase. This happens before the build, so a login problem stops the
   script in seconds instead of after four minutes.
3. Writes the build number and version into `app.json` (and the version into `package.json`).
4. Runs `expo prebuild` to regenerate the `android/` folder from `app.json`.
5. Builds the release APK with Gradle and copies it to `dist/calico-<version>-<build>.apk`.
6. Uploads the APK to App Distribution and sends it to every tester with your notes.

After a successful run, commit the `app.json` and `package.json` changes so the next build starts from the
right numbers:

```bash
git add app.json package.json
git commit -m "Release 1.1.1 (3)"
```

---

## Managing testers

The script sends each build to **everyone** listed under App Distribution → Testers & Groups in the
Firebase console. To add or remove people from the command line:

```bash
# List testers
firebase appdistribution:testers:list --project calico-549b5

# Add testers (they get an invite email with the next build)
firebase appdistribution:testers:add person@example.com other@example.com --project calico-549b5

# Remove a tester
firebase appdistribution:testers:remove person@example.com --project calico-549b5
```

---

## Troubleshooting

| Message | Fix |
|---|---|
| `could not list testers (are you logged in?)` | Run `firebase login`, and check your account has access to `calico-549b5`. |
| `no testers found in project` | Add at least one tester (see above). |
| `.env is missing` / `EXPO_PUBLIC_API_URL ... is not set` | Create `.env` and put the live `/exec` URL in it. |
| `no JDK found` | Install Android Studio, or set `JAVA_HOME` to a JDK 17+. |
| `Android SDK not found` | Install the SDK from Android Studio, or set `ANDROID_HOME`. |
| `Warning: build N is lower than the previous M` | Testers who have build M can't install N. Run again with a higher number. |
| `build.gradle does not have versionCode N after prebuild` | Delete the `android/` folder and run again. |
| Gradle build fails | Scroll up to the first `FAILED` task. `cd android && ./gradlew clean` and running again fixes most cache problems. |
| Testers say the update won't install | The build number wasn't higher than theirs, or the build was signed with a different key (see below). |

---

## Good to know

- **Don't edit anything in `android/` by hand.** The folder is generated, and every deploy deletes and
  recreates it from `app.json`. Put native settings in `app.json` instead.
- **Builds are signed with the standard React Native debug key.** That's fine for testers, and every
  build so far uses the same key, so updates install over each other. Before publishing to the Play
  Store you need your own release keystore, and phones with a debug-signed build will have to uninstall it
  once to switch.
- **The APK is about 80 MB** because it includes code for all phone CPU types. Copies are kept in `dist/`,
  which git ignores; delete old ones whenever you like.
- **Android only.** The script doesn't build for iPhone.
