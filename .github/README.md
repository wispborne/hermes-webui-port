# Hermes desktop app as a web UI

This repo builds the [Hermes Agent](https://github.com/NousResearch/hermes-agent) desktop app as a web page, to use as a browser UI for a Hermes gateway you already run.

Everything here is upstream hermes-agent except one folder, [`desktop-web/`](../desktop-web/), which adds the browser build.
The upstream version it's built from is in [`desktop-web/UPSTREAM_VERSION`](../desktop-web/UPSTREAM_VERSION).
You don't run the agent from this repo: keep your gateway as it is, and serve the built page in front of it.

Setup, deployment and updating are in [`desktop-web/README.md`](../desktop-web/README.md).

## Branches

- `web`: the browser build. Use this one.
- `main`: upstream's files only, one snapshot per upstream version synced, without upstream's history.

## License

MIT, like upstream. Hermes Agent is by [Nous Research](https://nousresearch.com).
Upstream's own README is [`README.md`](../README.md) at the repo root.
