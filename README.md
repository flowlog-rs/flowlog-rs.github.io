# FlowLog Docs Site

This repo contains the source for the FlowLog documentation [website](https://www.flowlog-rs.com)

## Development Environment

### Prerequisites

- Node.js: **22.x** (see `package.json` → `engines.node`)
- Package manager: `npm` or `yarn` (pick one and use it consistently)

### Install dependencies

Using npm:

```sh
npm ci
```

Using yarn:

```sh
yarn install --frozen-lockfile
```

### Run locally

```sh
npm run start
```

This starts a dev server (hot reload) and prints the local URL in the terminal.

### Build and preview the production site

```sh
npm run build
npm run serve
```

## Deployment

This repo is configured so that **pushing to `main` does not trigger a GitHub Actions deploy**.

To deploy, run:

```sh
npm run deploy
```

This triggers the GitHub Actions workflow `.github/workflows/deploy.yml` (manual `workflow_dispatch`) via the GitHub CLI.

Prerequisites for `npm run deploy`:

- Install GitHub CLI: `gh`
- Authenticate: `gh auth login`
- You must have permission to trigger workflows in the `flowlog-rs/flowlog-rs.github.io` repo

If you prefer the classic Docusaurus git-based deploy (pushes the built site to the deployment branch), use:

```sh
npm run deploy:local
```

## Where to make changes

- Tutorial docs: `docs/` (served under `/tutorial/...`)
- Developer docs: `developers/` (served under `/developers/...`)
- Blog posts: `blog/`
- Homepage / React components: `src/`
- Static assets (images, etc.): `static/`

Note: `build/` is generated output. Please don’t edit it by hand.

## Contributing

### Docs contributions: please start with an issue

If you want to contribute to the docs (tutorial/developer docs/blog), **please create or comment on a GitHub Issue first**.

- Use the issue to describe what you want to change and why
- After alignment, open a PR that references the issue (e.g. “Fixes #123”)
- PRs that change docs without an associated issue may be asked to add one first
