import { spawn, spawnSync, execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(repoRoot, ".env");
const TUNNEL_URL_PATTERN = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;
const START_TIMEOUT_MS = 30_000;

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

function ensureCloudflaredAvailable() {
  const probe = spawnSync("cloudflared", ["--version"], { stdio: "ignore" });
  if (probe.error) {
    fail(
      "cloudflared was not found on PATH. Install it with:\n\n" +
        "  winget install --id Cloudflare.cloudflared -e\n\n" +
        "then open a new terminal and re-run this script.",
    );
  }
}

function readEnvFile() {
  try {
    return readFileSync(envPath, "utf8");
  } catch {
    fail(`Could not read ${envPath}. Does the repo's root .env file exist?`);
    return "";
  }
}

function withTunnelUrl(envContent, tunnelUrl) {
  const withApiUrl = envContent.replace(
    /^NEXT_PUBLIC_API_URL=.*$/m,
    `NEXT_PUBLIC_API_URL=${tunnelUrl}/api/v1`,
  );
  const withWsUrl = withApiUrl.replace(
    /^NEXT_PUBLIC_WS_URL=.*$/m,
    `NEXT_PUBLIC_WS_URL=${tunnelUrl}`,
  );
  if (withWsUrl === envContent) {
    fail(
      "Did not find NEXT_PUBLIC_API_URL / NEXT_PUBLIC_WS_URL lines in .env - " +
        "refusing to proceed without being able to point them at the tunnel.",
    );
  }
  return withWsUrl;
}

function recreateWebService() {
  console.log("\n> docker compose up -d --force-recreate web\n");
  execFileSync("docker", ["compose", "up", "-d", "--force-recreate", "web"], {
    cwd: repoRoot,
    stdio: "inherit",
  });
}

function startTunnel(logPath) {
  const child = spawn(
    "cloudflared",
    ["tunnel", "--url", "http://localhost:3000"],
    { cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"] },
  );

  const log = createWriteStream(logPath, { flags: "a" });
  let buffer = "";

  const waitForUrl = new Promise((pickUpUrl, giveUp) => {
    const timer = setTimeout(() => {
      giveUp(
        new Error(
          "Timed out waiting for cloudflared to print a trycloudflare.com " +
            `URL. Check the full log at:\n  ${logPath}`,
        ),
      );
    }, START_TIMEOUT_MS);

    const onChunk = (chunk) => {
      const text = chunk.toString("utf8");
      log.write(text);
      buffer += text;
      const match = buffer.match(TUNNEL_URL_PATTERN);
      if (match) {
        clearTimeout(timer);
        pickUpUrl(match[0]);
      }
    };

    child.stdout.on("data", onChunk);
    child.stderr.on("data", onChunk);
  });

  return { child, waitForUrl };
}

async function main() {
  ensureCloudflaredAvailable();

  const originalEnvContent = readEnvFile();
  const logPath = join(
    tmpdir(),
    `event-platform-cloudflared-${Date.now()}.log`,
  );

  console.log(`Starting cloudflared quick tunnel (log: ${logPath}) ...`);
  const { child, waitForUrl } = startTunnel(logPath);

  let tunnelUrl;
  try {
    tunnelUrl = await waitForUrl;
  } catch (error) {
    child.kill();
    fail(error.message);
    return;
  }

  console.log(`\nTunnel URL: ${tunnelUrl}\n`);

  writeFileSync(envPath, withTunnelUrl(originalEnvContent, tunnelUrl));

  try {
    recreateWebService();
  } catch (error) {
    console.error("Failed to recreate the web service - reverting .env.");
    writeFileSync(envPath, originalEnvContent);
    child.kill();
    throw error;
  }

  console.log(
    "\n==============================================================",
  );
  console.log(`  Shareable URL:   ${tunnelUrl}`);
  console.log(`  Kiosk screen:    ${tunnelUrl}/kiosk`);
  console.log("  Use this EXACT URL on every device, including this machine -");
  console.log("  logging in from a different hostname will not carry the");
  console.log(
    "  session cookie over (host-only cookies, no Domain attribute).",
  );
  console.log(
    "  Press Ctrl+C here to stop the tunnel and restore localhost-only dev.",
  );
  console.log(
    "==============================================================\n",
  );

  let revertedAlready = false;
  const revertAndExit = () => {
    if (revertedAlready) return;
    revertedAlready = true;
    console.log("\nStopping tunnel and restoring local .env ...");
    child.kill();
    writeFileSync(envPath, originalEnvContent);
    try {
      recreateWebService();
    } catch (error) {
      console.error(
        "Could not recreate the web service while reverting - run " +
          "`docker compose up -d --force-recreate web` manually.",
        error,
      );
    }
    process.exit(0);
  };

  process.on("SIGINT", revertAndExit);
  process.on("SIGTERM", revertAndExit);
  child.on("exit", (code) => {
    console.log(`\ncloudflared exited unexpectedly (code ${code}).`);
    revertAndExit();
  });
}

void main();
