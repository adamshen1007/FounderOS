# Local Founder Workspace

## Start in Three Commands

```bash
pnpm install
pnpm founderos platform doctor
pnpm platform:start
```

Open <http://127.0.0.1:4310>. The server is intentionally unavailable to other
devices. Press `Ctrl+C` to stop it.

## What You Are Seeing

The workspace reads `workspace/founderos.workspace.yaml` and derives project
summaries from canonical repository files. It does not copy project content
into a database. Refreshing the page rereads the in-memory index created at
startup; restart after changing the workspace manifest.

The committed example registers FounderOS itself and AI Launch Copilot. M5A
supports repository-contained projects only.

## Run a Workflow

Choose an action on a project dossier and confirm it. FounderOS creates a local
job, runs one fixed existing command, and records bounded output under
`.founderos/platform/jobs/`.

Available actions are deliberately narrow:

- Run all repository checks.
- Validate the example research graph.
- Create a fake-provider research review proposal.
- Check the generated engineering kit for drift.

The workspace cannot approve an agent proposal, commit, push, publish, or run
an arbitrary command.

## Recovery

If the server stops during a job, the next start marks that job failed with an
interruption message. Inspect the log, correct the cause, and start a new job.
FounderOS does not retry writes automatically.

To remove local history, stop the server and delete the individual files under
`.founderos/platform/jobs/`. This does not delete canonical project content.

## Troubleshooting

- **Port already in use:** run `pnpm founderos platform start --port 4311`.
- **Project path denied:** keep it inside this repository and remove symbolic
  links from the registered path.
- **Workflow unavailable:** only actions declared for that project are allowed.
- **Page cannot connect:** confirm the terminal process is still running and
  open the exact loopback URL it printed.

## Verification

```bash
pnpm test:platform
pnpm check:platform
pnpm check
```
