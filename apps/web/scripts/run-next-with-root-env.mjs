import { spawn } from "node:child_process";
import nextEnv from "@next/env";
import { resolve } from "node:path";

const appDirectory = process.cwd();
const { loadEnvConfig } = nextEnv;

loadEnvConfig(resolve(appDirectory, "../.."), true);

const child = spawn(
  process.execPath,
  [
    resolve(appDirectory, "node_modules/next/dist/bin/next"),
    ...process.argv.slice(2),
  ],
  {
    env: process.env,
    stdio: "inherit",
  },
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exitCode = code ?? 1;
});
