import { spawn } from "node:child_process"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const scriptDir = dirname(fileURLToPath(import.meta.url))
const interfaceDir = resolve(scriptDir, "..")
const serverDir = resolve(interfaceDir, "..", ".server")

const children = []
let shuttingDown = false

function startProcess(name, command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: interfaceDir,
    env: process.env,
    shell: process.platform === "win32",
    stdio: ["inherit", "pipe", "pipe"],
    ...options,
  })

  children.push(child)

  child.stdout.on("data", (chunk) => {
    process.stdout.write(prefixLines(name, chunk))
  })

  child.stderr.on("data", (chunk) => {
    process.stderr.write(prefixLines(name, chunk))
  })

  child.on("exit", (code, signal) => {
    if (shuttingDown) {
      return
    }

    const reason = signal ? `signal ${signal}` : `code ${code ?? 0}`
    console.error(`[${name}] exited with ${reason}`)
    shutdown(code && code > 0 ? code : 1)
  })

  return child
}

function prefixLines(name, chunk) {
  return chunk
    .toString()
    .split(/\r?\n/)
    .map((line, index, lines) => {
      if (line.length === 0 && index === lines.length - 1) {
        return ""
      }
      return `[${name}] ${line}`
    })
    .join("\n")
}

function shutdown(exitCode = 0) {
  if (shuttingDown) {
    return
  }

  shuttingDown = true

  for (const child of children) {
    if (!child.killed && child.pid) {
      if (process.platform === "win32") {
        spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
          stdio: "ignore",
          shell: true,
        })
      } else {
        child.kill("SIGTERM")
      }
    }
  }

  setTimeout(() => process.exit(exitCode), 250)
}

process.on("SIGINT", () => shutdown(0))
process.on("SIGTERM", () => shutdown(0))

startProcess("api", "python", [
  "-B",
  "-m",
  "uvicorn",
  "api.main:app",
  "--app-dir",
  serverDir,
  "--host",
  "127.0.0.1",
  "--port",
  "8787",
])

startProcess("vite", "vite", ["--host", "127.0.0.1"])
