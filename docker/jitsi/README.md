# Self-hosted Jitsi Meet

Two independent setups, both vendoring the actual official
[`jitsi/docker-jitsi-meet`](https://github.com/jitsi/docker-jitsi-meet)
project rather than reimplementing its Compose file by hand:

- **`local/`** - runs on your own machine, no domain/VPS/public IP/paid
  service of any kind. Start here. See `local/README.md`.
- **`production/`** - a real VPS deployment, meant to run behind the
  shared reverse proxy in `../reverse-proxy/`. See `production/README.md`.

Lela's own side of this integration (`JITSI_ENABLED`/`JITSI_DOMAIN` env
vars, the `GET /meetings/:id/jitsi-session` endpoint, the frontend embed)
is identical either way - see `docs/development/jitsi-integration.md`.
Only which Jitsi deployment those vars point at changes between the two.

Neither directory is merged into the root `compose.yaml` or depended on by
Lela's own `api`/`web` containers - both are separate Compose projects you
start independently.
