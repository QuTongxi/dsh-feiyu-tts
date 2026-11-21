import { execFile, spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { join } from 'node:path'

const execute = promisify(execFile)
const script = fileURLToPath(new URL('./speech.py', import.meta.url))

async function launchCommand(modelDir, port) {
  const file = join(modelDir, 'runtime.local.json')
  const runtime = JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''))
  if (process.platform === 'win32') {
    const prefix = ['-d', runtime.distribution, '--exec']
    async function linuxPath(path) {
      const { stdout } = await execute('wsl.exe', [...prefix, 'wslpath', '-a', '-u', path], { windowsHide: true })
      return stdout.trim()
    }
    const [linuxScript, linuxModel] = await Promise.all([linuxPath(script), linuxPath(modelDir)])
    return ['wsl.exe', [...prefix, runtime.python, '-u', linuxScript, '--package', linuxModel, '--port', String(port)]]
  }
  return [runtime.python, ['-u', script, '--package', modelDir, '--port', String(port)]]
}

export class SpeechService {
  constructor(modelDir, port) {
    this.modelDir = modelDir
    this.port = port
    this.url = `http://127.0.0.1:${port}/v1/audio/speech`
  }

  #starting
  #child
  #closed
  #disposed = false

  start() {
    if (this.#disposed) throw new Error('The Feiyu plugin has been disabled.')
    this.#starting ??= this.#launch().catch(error => {
      this.#starting = undefined
      throw error
    })
    return this.#starting
  }

  async #launch() {
    const [command, args] = await launchCommand(this.modelDir, this.port)
    if (this.#disposed) throw new Error('The Feiyu plugin has been disabled.')
    const child = spawn(command, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    this.#child = child
    this.#closed = new Promise(resolve => child.once('close', resolve))
    const lines = createInterface({ input: child.stdout })
    let stderr = ''
    child.stderr.on('data', chunk => {
      stderr = (stderr + chunk).slice(-4000)
      process.stderr.write(chunk)
    })
    await new Promise((resolve, reject) => {
      child.once('error', reject)
      lines.on('line', line => {
        if (line === 'FEIYU_READY') resolve()
      })
      child.once('close', (code, signal) => {
        this.#child = undefined
        this.#starting = undefined
        reject(new Error(`Feiyu worker exited (${signal || code}): ${stderr.trim()}`))
      })
    })
  }

  async dispose() {
    this.#disposed = true
    if (this.#child) {
      this.#child.stdin.end()
      await this.#closed
    }
  }
}
