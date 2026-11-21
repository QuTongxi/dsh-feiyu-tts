# DSH 大肥鱼语音

让 DeepSeek Harness 用 FeiyuVoice-CosyVoice3 的“可爱”和“温柔”两种声线生成中文 MP3。启用插件后，已有的 DeepSeek-chan 桌面角色可以直接调用本机语音接口。首次合成时加载 GPU 模型，后续台词复用同一进程。禁用插件时释放端口和模型。

## 安装

1. 在 DeepSeek Harness 的 **插件 → 添加插件 → 安装第三方插件** 中输入 `github:QuTongxi/dsh-feiyu-tts`，安装并启用。也可以从 [Releases](https://github.com/QuTongxi/dsh-feiyu-tts/releases) 下载安装包，在同一界面填入其绝对路径。在源码目录运行 `npm pack` 可自行打包。
2. 准备 NVIDIA GPU、Linux 或 Windows + WSL2，以及作者的 FeiyuVoice-CosyVoice3 模型和 CosyVoice 推理环境。已有可用环境可以直接复用。新环境的依赖、固定版本以及模型下载地址见[作者部署指南](https://github.com/Esmerubphire/astrbot_plugin_feiyu_voice/blob/main/server/INSTALL_AGENT.md)和[模型卡](https://huggingface.co/Esmerubphire/FeiyuVoice-CosyVoice3)。部署指南中只需 TTS 引擎，Python 环境还需要 `aiohttp`，Linux 的 PATH 中需要 `ffmpeg`。
3. 在模型目录中放入 `runtime.local.json`。可以复制作者的 `runtime.template.json` 并填写实际路径。插件使用其中的 `python` 和 `repo`，Windows 还使用 `distribution`，即 `wsl -l -q` 中的发行版名称。前两项是 Linux 绝对路径。保留模型包中的 `models/`、`references/` 和 `manifest.json`。
4. 在插件配置中把 `modelDirectory` 设为包含上述文件的**模型目录**。Windows 填 Windows 路径。默认目录为 Windows 的 `%LOCALAPPDATA%\dsh-feiyu-tts\FeiyuVoice-CosyVoice3`，或 Linux 的 `$XDG_DATA_HOME/dsh-feiyu-tts/FeiyuVoice-CosyVoice3`（缺省位于 `~/.local/share`）。在 DSH 里说「调用 feiyu_start，检查大肥鱼语音服务」。

如果在另一台机器上从头安装，模型卡中的下载命令可以直接取回两种声线。已配置好的 `runtime.local.json` 也能用于模型包自带的验证命令。在包含模型的目录执行下列 Windows PowerShell 命令即可检查权重和源码版本。

```powershell
.\Speak.ps1 -VerifyOnly
```

需要在 DSH **发现** 页面查看插件版本时，可以在 **管理索引源** 添加[本项目的插件索引](https://raw.githubusercontent.com/QuTongxi/dsh-feiyu-tts/main/market.json)。

## 使用

- **生成文件**。让 DSH「用温柔声线生成『先种一棵向日葵』」。`feiyu_synthesize(text, voice)` 支持 `cute`（默认）和 `gentle`。结果给出实际 MP3 路径，文件位于插件数据目录的 `audio/`。
- **角色播报**。按桌面角色项目的说明连接它自带的 DSH 桥接。在角色的声音设置中选择「自定义 API」，地址填 `http://127.0.0.1:39182/v1`，模型填 `FeiyuVoice-CosyVoice3`，音色填 `cute` 或 `gentle`，密钥留空。让 DSH「调用 avatar_speak，用开心的表情说一句游戏解说」，角色会播放合成音频并驱动口型。[上游角色与 DSH 接入说明](https://github.com/lcyyun/deepseek-chan-companion/blob/main/docs/dsh-agent-guide.md)
- **接入 PvZ**。在同一 DSH 配置启用 `dsh-pvz` 和角色桥接后，可以说「用 pvz_get_state 看一眼棋盘，再用 avatar_speak 播报一句」。同一句台词只需调用一次角色播报工具。[DSH PvZ 插件](https://github.com/QuTongxi/dsh-pvz)

### 缩短开口前的等待

升级到 0.2.0 后，每种声线的参考录音只在首次使用时提取特征。开播前可让 DSH「调用 `feiyu_start`，用 `warmup_voice=cute` 静默预热」。预热会加载模型并在本机合成一句短话。切换到温柔声线时可以指定 `gentle`。

长解说还需要一次播放器更新。使用 **DeepSeek-chan v0.24.0 Windows x64 用户版**时，对 DSH 说「调用 `feiyu_configure_playback`，设置 `enabled=true`」，然后完全退出并重新打开大肥鱼桌面角色。便携版放在自选位置时，把包含 `DeepSeek-chan.exe` 的目录作为 `directory` 传入。工具会核对该版本前端资源的 SHA-256，并在本机更新播放代码。需要还原时设置 `enabled=false`，再重新打开角色。

此后只需调用一次 `avatar_speak`。角色先播放第一句，同时准备下一句，口型和进度跟随实际音频。停止或替换播报时会取消后续播放。肥鱼语音跳过思考后的固定开场等待。没有合适停顿的短句继续一次播放，`feiyu_synthesize` 仍可导出完整 MP3。

在 Linux、RTX 5060 Ti 16 GB、PyTorch 2.11.0+cu128 上，用相同的“可爱”声线在 Chromium 中对比了 v0.24.0 发行包的播放器。下表从播放器收到完整文字开始计时，到第一段解码音频调用 Web Audio 的 `start()` 为止。两版都已预热，短句取三次中位数，长段各测一次。LLM 写台词和扬声器硬件的延迟在计时范围之外。

| 台词 | v0.1.0 + 原版播放器 | v0.2.0 + 分句播放器 |
| --- | ---: | ---: |
| 第三路马上就要守不住啦！ | 0.89 秒 | 0.84 秒 |
| 第三路来僵尸了，快种豌豆射手！ | 1.11 秒 | 0.67 秒 |
| 79 字、四句话的战况解说 | 4.06 秒 | 0.66 秒 |

本地接口为 `POST /v1/audio/speech`，请求示例如下。响应是 MP3 音频。端口可通过插件配置 `port` 修改，角色的 API 地址需同步更新。同一端口由一个 DSH 配置使用。

```json
{"model":"FeiyuVoice-CosyVoice3","voice":"cute","input":"向日葵准备好了！","response_format":"mp3"}
```

安装包仅包含插件代码。声线和推理权重由作者单独发布，使用条款见[原作者发布页](https://www.bilibili.com/video/BV1cbH56KER3/)。
