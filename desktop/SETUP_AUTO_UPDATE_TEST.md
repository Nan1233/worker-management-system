# KTC Desktop TEST: install Setup once, update from GitHub

## One-time initial installation on each Windows PC
- Download the TEST Setup EXE from the **first beta GitHub Release**, not from a portable artifact.
- Install KTC to a **local drive** (normally C:). Do not install or launch the application from KTCNAS.
- The NAS may hold a backup copy of Setup and exported Excel files; it is not the application runtime.
- The current installed version needs the update-channel code in `desktop/electron/autoUpdate.cjs`. Older installers without it must be upgraded once manually.

## Publish subsequent TEST updates without visiting each PC
1. Open GitHub > Actions > **Publish KTC TEST Setup auto-update (beta)**.
2. Select branch **test**, then **Run workflow**.
3. Enter a NEW increasing prerelease version such as `1.9.18-beta.1`, then `1.9.18-beta.2`. Each new release must be a higher semantic version.
4. Wait for successful Windows build and GitHub Release creation. The release must contain `KTC-Production-Control-Setup.exe`, `KTC-Production-Control-Setup.exe.blockmap`, and `beta.yml`.
5. On installed PCs, KTC checks for updates after initial UI startup and then every six hours; users can choose to download and install or defer. It does not auto-replace the portable EXE.

Only manually approved workflow releases are distributed. Normal pushes to `test` build artifacts, but do **not** publish updates. Use the GitHub Release version of Setup for first-time installation.

## Safety and separation
- TEST app subscribes to the `beta` channel and accepts prereleases; production app subscribes only to stable `latest`.
- Never publish a TEST installer as a stable latest release. Never use the TEST prerelease workflow from `main`.
- Test releases are public downloads because this repository is public: never bundle credentials or secrets.
- The updater intentionally starts after first display. The app keeps its user data under `%LOCALAPPDATA%\KTC-Worker-Management\UserData`, separate from the install directory.
- Before deploying broadly, test one update (e.g., beta.1 to beta.2) end-to-end on a spare Windows PC, including shortcut, install location, existing user data, Excel exports and antivirus behavior.
- If GitHub Releases or internet access are blocked, leave the installed version functioning and install a newer Setup manually on that machine.
- Code signing is recommended for company-wide installations to reduce OS security warnings. An unsigned build cannot guarantee unattended, warning-free updates.
