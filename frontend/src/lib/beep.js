let ctx

/** Tiny scan feedback tone: high short beep = added, low double buzz = unknown code. */
export function beep(ok = true) {
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)()
    const tone = (freq, start, dur) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'square'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.06, ctx.currentTime + start)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur)
      osc.connect(gain).connect(ctx.destination)
      osc.start(ctx.currentTime + start)
      osc.stop(ctx.currentTime + start + dur)
    }
    if (ok) tone(1800, 0, 0.08)
    else {
      tone(300, 0, 0.12)
      tone(250, 0.15, 0.18)
    }
  } catch {
    /* audio is a nicety; never let it break a sale */
  }
}
