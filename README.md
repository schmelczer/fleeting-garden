# Fleeting Garden

Fleeting Garden is a single-player WebGPU drawing garden. Pick a vibe palette,
draw persistent coloured paths, spawn agents from those strokes, erase locally,
and export the scene as an internal render buffer snapshot.

Check out the [agent logic](./src/pipelines/agents/agent.wgsl).

## Testing

- `npm test` runs the Vitest unit suite.
- `npm run test:e2e` runs the Playwright Chromium smoke test. The Playwright
  config builds the production bundle before serving it.
- `npx playwright install chromium` installs the local browser binary when needed.
