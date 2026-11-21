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

本地接口为 `POST /v1/audio/speech`，请求示例如下。响应是 MP3 音频。端口可通过插件配置 `port` 修改，角色的 API 地址需同步更新。同一端口由一个 DSH 配置使用。

```json
{"model":"FeiyuVoice-CosyVoice3","voice":"cute","input":"向日葵准备好了！","response_format":"mp3"}
```

安装包仅包含插件代码。声线和推理权重由作者单独发布，使用条款见[原作者发布页](https://www.bilibili.com/video/BV1cbH56KER3/)。
