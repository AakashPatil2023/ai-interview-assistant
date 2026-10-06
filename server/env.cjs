const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");

function resolveEnvPath({
  env = process.env,
  projectDir = path.join(__dirname, ".."),
  executablePath = process.execPath,
  packaged = false
} = {}) {
  if (env.DOTENV_CONFIG_PATH) {
    return path.resolve(env.DOTENV_CONFIG_PATH);
  }

  // Portable executables extract to a temporary directory. Configuration belongs
  // next to the original executable, not inside that temporary directory.
  const directory = packaged
    ? env.PORTABLE_EXECUTABLE_DIR || path.dirname(executablePath)
    : projectDir;
  const candidates = [".env", "env", ".env.txt"].map((name) => path.join(directory, name));

  return candidates.find((candidate) => {
    try {
      return fs.statSync(candidate).isFile();
    } catch {
      return false;
    }
  }) || candidates[0];
}

function loadEnv(options = {}) {
  const envPath = resolveEnvPath(options);
  const result = dotenv.config({
    path: envPath,
    processEnv: options.env || process.env,
    quiet: true
  });
  return { envPath, error: result.error };
}

module.exports = { resolveEnvPath, loadEnv };
