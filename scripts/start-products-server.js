const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const logDir = path.join(rootDir, "work");

fs.mkdirSync(logDir, { recursive: true });

const env = {
  SystemRoot: process.env.SystemRoot || "C:\\Windows",
  ComSpec: process.env.ComSpec || "C:\\Windows\\System32\\cmd.exe",
  TEMP: process.env.TEMP,
  TMP: process.env.TMP,
  PATH: "C:\\Windows\\System32;C:\\Windows;C:\\Program Files\\nodejs"
};

const out = fs.openSync(path.join(logDir, "products-server.log"), "a");
const err = fs.openSync(path.join(logDir, "products-server.err"), "a");
const child = spawn(process.execPath, ["src/productsServer.js"], {
  cwd: rootDir,
  detached: true,
  env,
  stdio: ["ignore", out, err],
  windowsHide: true
});

child.unref();
console.log(child.pid);
