"""Local speech endpoint for the DeepSeek-chan desktop avatar."""
import argparse
import asyncio
import json
import logging
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from aiohttp import web
import numpy as np
import torch


class Feiyu:
    def __init__(self, package: Path, repo: Path):
        os.chdir(repo)
        sys.path[:0] = [str(repo), str(repo / "third_party" / "Matcha-TTS")]
        from cosyvoice.cli.cosyvoice import AutoModel

        self.package = package
        self.manifest = json.loads((package / "manifest.json").read_text(encoding="utf-8-sig"))
        self.base = package / self.manifest["base_model_dir"]
        self.voice = AutoModel(model_dir=str(self.base), fp16=False, load_trt=False, load_vllm=False)
        self.loaded_checkpoint = self.base / "llm.pt"
        for network in (self.voice.model.llm, self.voice.model.flow, self.voice.model.hift):
            if next(network.parameters()).device.type != "cuda":
                raise RuntimeError("Feiyu requires the configured CUDA device")

    def synthesize(self, text: str, style: str) -> bytes:
        from cosyvoice.utils.common import set_all_random_seed

        selection = self.manifest["styles"][style]
        options = self.manifest["inference"]
        checkpoint = self.package / selection["llm_checkpoint"]
        prompt = options["prompt_prefix"] + selection["reference_text"]
        reference = str(self.package / selection["reference_audio"])
        with torch.inference_mode():
            if checkpoint != self.loaded_checkpoint:
                self.voice.model.llm.load_state_dict(torch.load(checkpoint, map_location="cpu", weights_only=True), strict=True)
                self.loaded_checkpoint = checkpoint
            self.voice.model.llm.eval()
            set_all_random_seed(options["seed"])
            chunks = [part["tts_speech"].detach().cpu().numpy()[0]
                      for part in self.voice.inference_zero_shot(text, prompt, reference,
                                                                stream=False, speed=options["speed"])]
        audio = np.concatenate(chunks)
        peak = float(np.abs(audio).max())
        if audio.size <= 2400 or not np.isfinite(audio).all() or peak <= 1e-4:
            raise RuntimeError("Feiyu produced invalid audio")
        audio = (audio * min(1.0, 0.98 / peak)).astype("<f4")
        rate = self.voice.sample_rate
        mp3 = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-f", "f32le",
                              "-ar", str(rate), "-ac", "1", "-i", "pipe:0", "-c:a", "libmp3lame",
                              "-b:a", "96k", "-f", "mp3", "pipe:1"], input=audio.tobytes(),
                             stdout=subprocess.PIPE, check=True).stdout
        logging.info("Feiyu %s: %d characters, %.2f s, %.4f peak, %d MP3 bytes",
                     style, len(text), len(audio) / rate, peak, len(mp3))
        return mp3


async def serve(package: Path, port: int):
    runtime = json.loads((package / "runtime.local.json").read_text(encoding="utf-8-sig"))
    repo = Path(runtime["repo"])
    voice = None

    def render(text: str, style: str) -> bytes:
        nonlocal voice
        if voice is None:
            voice = Feiyu(package, repo)
        return voice.synthesize(text, style)

    async def speech(request):
        if request.content_type != "application/json":
            raise web.HTTPUnsupportedMediaType()
        try:
            data = await request.json()
        except (ValueError, UnicodeError) as error:
            raise web.HTTPBadRequest(text="Expected a JSON object") from error
        if not isinstance(data, dict) or data.get("model") != "FeiyuVoice-CosyVoice3" or data.get("response_format", "mp3") != "mp3":
            raise web.HTTPBadRequest(text="Expected FeiyuVoice-CosyVoice3 and mp3")
        style = data.get("voice", "cute")
        text = data.get("input")
        if style not in ("cute", "gentle") or not isinstance(text, str) or not 1 <= len(text.strip()) <= 6000:
            raise web.HTTPBadRequest(text="Expected cute or gentle and 1 to 6000 characters")
        audio = await asyncio.get_running_loop().run_in_executor(inference, render, text.strip(), style)
        return web.Response(body=audio, content_type="audio/mpeg")

    app = web.Application()
    app.router.add_post("/v1/audio/speech", speech)
    runner = web.AppRunner(app)
    with ThreadPoolExecutor(max_workers=1) as inference:
        await runner.setup()
        try:
            await web.TCPSite(runner, "127.0.0.1", port).start()
            print("FEIYU_READY", flush=True)
            # The plugin closes this pipe on unload. Host exit also produces EOF.
            await asyncio.to_thread(sys.stdin.buffer.read, 1)
        finally:
            await runner.cleanup()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--package", required=True, type=Path)
    parser.add_argument("--port", required=True, type=int)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    torch.set_num_threads(4)
    os.environ.update(HF_HUB_OFFLINE="1", TRANSFORMERS_OFFLINE="1")
    asyncio.run(serve(args.package.resolve(), args.port))
