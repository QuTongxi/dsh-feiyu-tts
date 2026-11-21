// Loaded inside the companion renderer. All clocks below follow the playing audio.
export function usesFeiyuVoice(settings) {
  return settings?.voiceEnabled !== false && settings?.tts?.provider === 'api' &&
    settings.tts.model === 'FeiyuVoice-CosyVoice3'
}

export function feiyuPhrases(text) {
  if (text.length <= 12) return [text]
  const parts = []
  for (const { segment } of new Intl.Segmenter('zh', { granularity: 'sentence' }).segment(text)) {
    const chars = Array.from(segment)
    let offset = 0
    while (offset < chars.length) {
      const target = parts.length ? 48 : 24
      const remaining = chars.length - offset
      let length = remaining
      // For the opening, a complete clause can be played even when the whole
      // sentence is short. Keep both sides substantial enough to pronounce.
      const openingPause = offset === 0 && !parts.length
        ? chars.findIndex((char, i) => i >= 6 && i < target && remaining - i > 6 && /[，；：]/u.test(char))
        : -1
      if (openingPause >= 0) {
        length = openingPause + 1
      } else if (remaining > target) {
        let boundary = 0
        for (let i = 6; i < Math.min(target, remaining); i++) {
          const pos = offset + i
          const numberSeparator = /[,:，：]/u.test(chars[pos]) && /\d/.test(chars[pos - 1]) && /\d/.test(chars[pos + 1])
          if (!numberSeparator && /[，、；：,;:\s]/u.test(chars[pos])) boundary = i + 1
        }
        length = boundary || (remaining <= target + 12 ? remaining : target)
      }
      const part = chars.slice(offset, offset + length).join('')
      if (part.trim()) parts.push(part)
      else if (parts.length) parts[parts.length - 1] += part
      offset += length
    }
  }
  return parts
}

export async function speakFeiyuPhrases(player, settings, text, onStart, onProgress) {
  if (!usesFeiyuVoice(settings)) return player.speak(text, onStart, onProgress)
  const parts = feiyuPhrases(text)
  const requested = performance.now()
  function started() {
    console.info('[Feiyu] first audio scheduled at %d ms (%d phrases)',
      Math.round(performance.now() - requested), parts.length)
    onStart?.()
  }
  if (parts.length < 2) return player.speak(text, started, onProgress)

  player.stop()
  const turn = player.generation
  player.controller = new AbortController()
  // A prefetched request may fail while the previous sentence is still playing.
  // Observe the rejection immediately and report it when that sentence is due.
  const prepare = part => player.decodePhrase(part, turn).then(audio => ({ audio }), error => ({ error }))
  let pending = prepare(parts[0])
  let playedSeconds = 0
  let playedChars = 0
  const totalChars = parts.reduce((total, part) => total + part.length, 0)
  try {
    for (let i = 0; i < parts.length; i++) {
      const { audio, error } = await pending
      if (player.generation !== turn) return
      if (error) throw error
      const progress = ({ elapsed, duration }) => {
        const time = playedSeconds + elapsed
        const ratio = (playedChars + parts[i].length * (elapsed / duration)) / totalChars
        // The final duration is unknown until the last sentence has been synthesized.
        onProgress?.({ elapsed: time, duration: ratio ? time / ratio : duration * totalChars / parts[i].length, ratio })
      }
      const playing = player.playDecoded(audio, i === 0 ? started : undefined, progress, turn)
      if (i + 1 < parts.length && player.generation === turn) pending = prepare(parts[i + 1])
      await playing
      if (player.generation !== turn) return
      player.analyser.disconnect()
      playedSeconds += audio.duration
      playedChars += parts[i].length
    }
  } finally {
    if (player.generation === turn) player.stop()
  }
}
