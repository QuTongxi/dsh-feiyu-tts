import { createHash, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile, writeFile, rename, rm } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'

// These four edits target the user edition of the v0.24.0 release. The hash
// pins the exact Vite bundle, including its local variable names.
const entry = 'index-BuqLWx_G.js'
const originalHash = '35f82368093d4d4daf9ad628147128f87ab5a7c8e74e28145062a62329fabbbe'
const edits = [
  ['this.controller=new AbortController;const{url:y,token:p}=Xt(),M=await fetch(y+"/api/tts"',
   'this.controller=new AbortController;const audio=await this.decodePhrase(s,d);if(audio)return this.playDecoded(audio,o,r,d)}async decodePhrase(s,d){const{url:y,token:p}=Xt(),M=await fetch(y+"/api/tts"'],
  ['const x=await this.context.decodeAudioData(S);d===this.generation&&(this.analyser=',
   'return this.context.decodeAudioData(S)}async playDecoded(x,o,r,d){d===this.generation&&(this.analyser='],
  ['await r.current.speak(J.text,', 'await speakFeiyuPhrases(r.current,zt,J.text,'],
  ['if(ae){s.current?.applyCommand({type:"perform",intent:"idea"',
   'if(ae&&!usesFeiyuVoice(await Pe)&&k===d.current){s.current?.applyCommand({type:"perform",intent:"idea"'],
]
const marker = '\n/* dsh-feiyu-tts playback v0.2.0 */\n'
const digest = data => createHash('sha256').update(data).digest('hex')

function rewrite(source, reverse) {
  for (const pair of edits) {
    const [from, to] = reverse ? [pair[1], pair[0]] : pair
    if (source.split(from).length !== 2) throw new Error('Companion renderer does not match v0.24.0 user edition.')
    source = source.replace(from, () => to)
  }
  return source
}

export async function configurePlayback(directory, enable) {
  if (!isAbsolute(directory)) throw new Error('Supply the absolute directory containing DeepSeek-chan.exe.')
  const target = join(directory, 'resources', 'app', 'dist', 'assets', entry)
  const current = await readFile(target, 'utf8')
  const helper = (await readFile(new URL('./playback.js', import.meta.url), 'utf8')).replaceAll('\r\n', '\n')
  const suffix = marker + helper
  const installed = current.endsWith(suffix)
  const original = installed ? rewrite(current.slice(0, -suffix.length), true) : current
  if (digest(original) !== originalHash) throw new Error('The renderer differs from the supported v0.24.0 user release.')
  if (installed === enable) return { enabled: enable, changed: false }
  const replacement = enable ? rewrite(original, false) + suffix : original
  const temp = target + '.' + randomUUID() + '.tmp'
  try {
    await writeFile(temp, replacement, { flag: 'wx' })
    await rename(temp, target)
  } finally {
    await rm(temp, { force: true })
  }
  return { enabled: enable, changed: true, restart: '重新打开大肥鱼桌面角色以切换播放器。' }
}

export function defaultCompanionDirectory() {
  if (process.platform !== 'win32') throw new Error('Supply the directory containing the v0.24.0 Windows user edition.')
  const base = join(process.env.LOCALAPPDATA, 'Programs', 'DeepSeekChan')
  const versioned = join(base, 'app-0.24.0')
  return existsSync(join(versioned, 'DeepSeek-chan.exe')) ? versioned : base
}
