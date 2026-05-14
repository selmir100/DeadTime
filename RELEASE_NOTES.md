# DeadTime v0.1.0-beta

DeadTime is a lightweight local utility for keeping momentum during waiting periods.

## Important

This beta is **not a packaged desktop installer yet**. The GitHub download contains source files for a local preview.

## How To Run

1. Download the ZIP from GitHub or clone the repository.
2. Make sure Node.js 18 or newer is installed.
3. Open a terminal in the `DeadTime` folder.
4. Run:

```powershell
node .\serve.mjs
```

5. Open:

```text
http://127.0.0.1:4173/
```

## Included In This Beta

- Countdown timers
- Resume point field
- Background wait tracking
- Mini task checklist
- Scratchpad notes
- Fast shortcuts
- Compact mode
- Dark/light settings
- Local browser storage persistence

## Privacy

DeadTime runs locally and does not send your notes, tasks, timers, or wait labels to a server. App state is stored in browser `localStorage`.

The included logo PNG has been stripped of nonessential PNG metadata before release. Git commits use the GitHub noreply email for the publishing account.

## Next Planned Step

Package DeadTime as a lightweight desktop app, likely with Tauri, so users can download and run it without starting a local preview server manually.
