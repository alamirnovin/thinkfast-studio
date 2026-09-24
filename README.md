# ThinkFast Studio

A warm, plain-language Tauri desktop interface for Laya decision workflows.

Created by Alamir Novin.

## What ThinkFast Studio does

- Lets a user build decisions using ordinary language rather than JSON.
- Supports choice, scale, and yes/no decision formats.
- Imports CSV files or a text document through Documents to Analyze.
- Is designed to read Word (`.docx`) documents in the packaged desktop app.
- Shows understandable results, confidence, and a manual-review queue.
- Exports the visible results as a CSV file.

ThinkFast Studio is designed as a local desktop application. It does not require users to write code, prepare JSON, or configure an API endpoint.

## Friendly installation plan

The release app will be a standard macOS `.dmg` and Windows `.msi`/installer:

1. Download and open the installer.
2. Open ThinkFast Studio.
3. Select **Download decision engine** once.
4. Analyze documents offline afterward.

Bundling the full model inside every installer is possible but would make the initial download very large. The recommended experience is to ship the small app installer and let the app download the selected model with a single friendly button on first use.

Long documents are split into manageable passages before Laya evaluates them. The app will combine those passage-level decisions into one document-level result and identify passages that need a human look.

## Develop locally

```bash
npm install
npm run dev
```

## Build it as a Tauri desktop app

Install Rust and the platform prerequisites from the Tauri documentation, then run:

```bash
npm install
npm run tauri dev
```

For a production installer:

```bash
npm run tauri build
```

## Releases

GitHub Actions builds macOS and Windows installers whenever a version tag is pushed. The public GitHub Pages download page lives in `site/`.
