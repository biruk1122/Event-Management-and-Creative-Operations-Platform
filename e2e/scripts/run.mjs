import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";

function findAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate an e2e test port."));
        return;
      }
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

const runId = `run_${randomBytes(8).toString("hex")}`;
const [apiPort, webPort] = await Promise.all([
  findAvailablePort(),
  findAvailablePort(),
]);
const environment = {
  ...process.env,
  API_PORT: String(apiPort),
  E2E_RUN_ID: runId,
  WEB_PORT: String(webPort),
};
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

process.stdout.write(
  `[e2e] run ${runId} using API port ${apiPort} and web port ${webPort}\n`,
);

execFileSync(process.execPath, ["scripts/provision.mjs"], {
  env: environment,
  stdio: "inherit",
});
execFileSync(pnpm, ["exec", "playwright", "test", ...process.argv.slice(2)], {
  env: environment,
  stdio: "inherit",
});
