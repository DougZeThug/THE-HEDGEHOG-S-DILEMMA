/**
 * The time a playing memory advances by each frame. While sound is running, that is the
 * AudioContext's own clock, so a slow frame (a texture upload, a weak phone) never lets the image
 * fall behind its music; the room's frame dt is clamped to 0.1 s for its own reasons, and must
 * not be used here. While the context is suspended, real (unclamped) frame time is used instead.
 * Hidden or in settings, the App passes `paused` and the memory doesn't move at all.
 */
export class MemoryClock {
  private lastAudio: number | null = null;
  private lastReal: number | null = null;

  /**
   * @param real   performance.now() / 1000
   * @param audio  the AudioContext's currentTime
   * @param running whether the AudioContext is running
   */
  tick(real: number, audio: number, running: boolean, paused = false): number {
    const prevA = this.lastAudio, prevR = this.lastReal;
    this.lastAudio = running ? audio : null;
    this.lastReal = real;
    if (paused || prevR === null) return 0;
    const dt = running && prevA !== null ? audio - prevA : real - prevR;
    // A long stall (a hidden tab the browser kept running, a debugger) is not time the memory
    // lived through; anything beyond a second becomes a jump, which plays nothing it passes.
    return Math.max(0, Math.min(1, dt));
  }

  reset(): void {
    this.lastAudio = this.lastReal = null;
  }
}
