# hackpuzzle extension

Internal tooling for packaging the hackpuzzle Chrome extension.

## Development

All source code for the extension lives under `background/`, `content/`, `popup/`, and `external/`.

## Production build

The repository now ships with a Node-based build pipeline that cleans previous artifacts, flips the runtime logging flag off, obfuscates JavaScript, minifies HTML/CSS, copies static assets, and emits a zipped package ready for upload.

```powershell
npm install
npm run build
```

Running `npm run build` now prompts you to choose the next semantic version:

- Hotfix (patch) – bump the last digit.
- Minor – bump the middle digit and reset the last.
- Major – bump the first digit and reset the rest.
- Custom – enter any `x.x.x` value.

The selected version is written back to `manifest.json` and the popup header, so source and production stay in sync. The built `manifest.json` is emitted with the name `hackpuzzle [prod]` to clearly mark production bundles.

Use `npm run qb` for a quick build that skips the version prompt and reuses the existing version (handy for CI or rapid iterations).

Artifacts:

- `dist/` – production-ready extension bundle.
- `dist/build-report.json` – per-file size and processing metadata.
- `artifacts/*.zip` – timestamped archive ready for Chrome Web Store submission.

### Additional scripts

- `npm run qb` – quick build; skips the version prompt and keeps the current version.
- `npm run clean` – remove build outputs without generating a new bundle.
- `npm run build:analyze` – run the build and print a per-file size report (includes the interactive version bump).
- `npm run release -- --version 0.0.0` – bump versions, run the quick build, tag, push, and publish a GitHub release (see below).

## Releases

The project ships with a small Node-based release assistant under `scripts/release.js`. It automates the chores involved in publishing a new version to GitHub and surfaces new versions inside the popup UI.

### Prerequisites

- A GitHub personal access token with `repo` scope exported as `GITHUB_TOKEN`.
- The repository slug exported as `GITHUB_REPOSITORY` (defaults to `iastudios/hackpuzzle`) or passed via `--repo owner/name`.
- A clean working tree (override with `--allow-dirty` if you know what you're doing).

### Typical release flow

```powershell
$env:GITHUB_TOKEN = "<your-token>"
$env:GITHUB_REPOSITORY = "iastudios/hackpuzzle"
npm run release -- --version 0.0.3 --notes "- Fix toggle persistence\n- Add update badge"
```

What the script does:

1. Updates `manifest.json`, `package.json`, and the popup header to the requested version.
2. Runs `npm run qb` so the bundle and build report reflect the new version.
3. Commits the version bump (if there are changes), creates an annotated tag, and pushes both to the configured remote (default `origin`).
4. Calls the GitHub Releases API to create the release entry and uploads the freshly built ZIP from `artifacts/`.

Flags such as `--skip-build`, `--no-push`, or `--no-release` let you opt out of individual steps. Refer to `scripts/release.js` for the full flag list.

### In-popup update indicator

The popup reads `chrome.runtime.getManifest().version` at runtime and fetches the latest tag from GitHub every six hours. When it finds a newer release than the installed version, it lights up the header message with “a new version is available” and links directly to the latest release page.

If you publish from a different repository, update the `GITHUB_RELEASE_CONFIG` block near the top of `popup/popup.js` so the indicator tracks the correct project.