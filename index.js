import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'
import z from '@deepseek-ai/schemastery'
import { SpeechService } from './service.js'

export const name = 'dsh-feiyu-tts'
export const inject = ['tools']
export const Config = z.object({
  modelDirectory: z.string().default('').description('FeiyuVoice-CosyVoice3 模型目录，包含 manifest.json 和 runtime.local.json。'),
  port: z.number().min(1).max(65535).step(1).default(39182).description('本机语音 HTTP 服务端口。'),
})

export async function apply(ctx, config) {
  const dataHome = process.platform === 'win32' ? process.env.LOCALAPPDATA : (process.env.XDG_DATA_HOME || join(homedir(), '.local/share'))
  const dataDir = join(dataHome, name)
  const modelDir = config.modelDirectory || join(dataDir, 'FeiyuVoice-CosyVoice3')
  if (!isAbsolute(modelDir)) throw new Error('modelDirectory must be an absolute path.')
  const service = new SpeechService(modelDir, config.port)
  ctx.effect(() => () => service.dispose())
  const output = { schema: { type: 'string' }, render: (_args, text) => [{ type: 'text', text }] }
  async function start() {
    if (!existsSync(join(modelDir, 'runtime.local.json'))) {
      throw new Error(`请按插件 README 准备模型和推理环境，或设置 modelDirectory。缺少 ${join(modelDir, 'runtime.local.json')}`)
    }
    await service.start()
  }
  ctx.tools.register(defineTool({
    name: 'feiyu_start', description: '启动或检查本机大肥鱼语音服务，返回桌面角色可以使用的语音接口。', parameters: {}, output,
    async execute() {
      await start()
      return JSON.stringify({ endpoint: service.url, model: 'FeiyuVoice-CosyVoice3', voices: ['cute', 'gentle'] })
    },
  }))
  ctx.tools.register(defineTool({
    name: 'feiyu_synthesize', description: '用大肥鱼的可爱或温柔声线生成中文 MP3 并返回本机文件路径。直播中让角色开口请调用角色的 avatar_speak。',
    parameters: {
      text: { type: 'string', required: true, description: '朗读文本，最多 6000 个字符。' },
      voice: { type: 'string', enum: ['cute', 'gentle'], description: 'cute 可爱（默认），gentle 温柔。' },
    },
    output,
    async execute({ text, voice = 'cute' }, call) {
      call.signal.throwIfAborted()
      await start()
      const res = await fetch(service.url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: call.signal,
        body: JSON.stringify({ model: 'FeiyuVoice-CosyVoice3', input: text, voice, response_format: 'mp3' }),
      })
      if (!res.ok) throw new Error(`Feiyu HTTP ${res.status}: ${await res.text()}`)
      const audio = Buffer.from(await res.arrayBuffer())
      const dir = join(dataDir, 'audio')
      await mkdir(dir, { recursive: true })
      const path = join(dir, `${randomUUID()}.mp3`)
      const part = path + '.part'
      try {
        await writeFile(part, audio, { flag: 'wx', signal: call.signal })
        await rename(part, path)
      } finally {
        await rm(part, { force: true })
      }
      return JSON.stringify({ path, voice, bytes: audio.length })
    },
  }))
  if (existsSync(join(modelDir, 'runtime.local.json'))) await service.start()
}
