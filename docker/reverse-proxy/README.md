# Shared reverse proxy

A single [Caddy](https://caddyserver.com/) instance that is the **only**
thing binding host ports 80/443 on a VPS running both the Lela application
stack and the self-hosted Jitsi stack (`docker/jitsi/production/`). It
terminates TLS for both domains (automatic Let's Encrypt via Caddy's
built-in ACME client) and routes by hostname to each stack's own
containers over a shared, external Docker network. This is for a real VPS
deployment only - local development (`docker/jitsi/local/`) does not use
this at all (see that directory's own README for why it doesn't need to).

This is an **independent Compose project** - never merged into the root
`compose.yaml` or into the vendored `docker-jitsi-meet` clone under
`docker/jitsi/production/`.

## Why this exists

Lela's own dev-only `compose.yaml` has no reverse proxy or TLS at all, and
the official Jitsi Compose stack ships its own bundled nginx + Let's
Encrypt automation that would otherwise also try to bind port 443. Running
both stacks' own HTTPS automation on the same host would conflict. This
proxy is the minimum shared front door needed so the two stacks can
coexist on one VPS without fighting over ports - it is not a full
production deployment of Lela itself (see the gap called out below).

## Setup

1. Create the shared external network once, before starting any stack:
   ```
   docker network create lela-edge
   ```
2. Copy `.env.example` to `.env` here and fill in both domains and the ACME
   contact email.
3. Start this proxy, then `docker/jitsi/production/`, then (once it
   exists) Lela's own production stack - each with its own
   `docker compose up -d`.

## Port/conflict table

| Port                   | Bound by                                    | Notes                                                                                                                                                                  |
| ---------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 80                     | this proxy only                             | ACME HTTP-01 challenges for both domains                                                                                                                               |
| 443                    | this proxy only                             | TLS termination + hostname routing for both domains - **both other stacks' own HTTPS/Let's Encrypt must stay disabled** so neither ever tries to bind this port itself |
| 10000/udp (`JVB_PORT`) | `docker/jitsi/production/`'s `jvb` directly | Media traffic - cannot go through this (or any) HTTP reverse proxy; mapped straight to the host, unaffected by this proxy's own ports                                  |

## Routing

The `Caddyfile` here has two site blocks, one per domain:

- `JITSI_DOMAIN` forwards to `jitsi-web:8000` - the container's own
  internal HTTP port (confirmed from the official project's own
  `docker-compose.yml`, which maps `${HTTP_PORT}:8000`), reached via the
  explicit `container_name: jitsi-web` the production setup gives that
  service specifically so it resolves unambiguously on this shared network
  (two different Compose projects both naming a service plain `web` would
  otherwise register two conflicting aliases on the same external
  network). Caddy forwards WebSocket upgrade headers automatically - no
  extra config is needed for Jitsi's BOSH/Colibri signaling.
- `LELA_DOMAIN` forwards to `lela-web:3000` and `/api/*` to `lela-api:4000`
  - **placeholder names**, since Lela's own production Compose deployment
    does not exist yet (today there is only the dev-only root
    `compose.yaml`, which this proxy does not touch). When that production
    compose is defined, give its web/api services matching
    `container_name: lela-web` / `lela-api` and join them to this same
    `lela-edge` external network for this routing to work as written.

## Not a substitute for Lela's own production deployment

This proxy only solves the "two stacks, one VPS, one set of ports" problem.
It does not define how Lela's own API/web containers get built, deployed,
or kept secret-configured in production - that remains a separate,
not-yet-defined piece of work.
