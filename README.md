# ThinkFast Studio

A warm, plain-language Tauri desktop interface for structured decision workflows.

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
3. Wait briefly while its included decision engine starts.
4. Analyze documents offline.

The standard installer includes the recommended English decision engine, so there is no first-run model download. This makes the installer larger, but keeps the beginner experience self-contained and offline after installation.

Long documents are split into manageable passages before the selected local model evaluates them. The app combines those passage-level decisions into one document-level result and identifies passages that need a human look.

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
