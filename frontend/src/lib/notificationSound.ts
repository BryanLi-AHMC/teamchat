/** Throttle so rapid bursts of messages do not stack loud dings. */
const MIN_INTERVAL_MS = 1400;
let lastPlayedAt = 0;

let sharedCtx: AudioContext | null = null;
let unlockAttached = false;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") {
    return null;
  }
  const AC = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) {
    return null;
  }
  if (!sharedCtx) {
    sharedCtx = new AC();
  }
  return sharedCtx;
}

/** Browsers suspend audio until a user gesture; resume on first tap/key. */
function attachUnlockOnce() {
  if (unlockAttached || typeof window === "undefined") {
    return;
  }
  unlockAttached = true;
  const resume = () => {
    void getContext()?.resume();
  };
  window.addEventListener("pointerdown", resume, { passive: true, capture: true });
  window.addEventListener("keydown", resume, { capture: true });
}

/**
 * Short, soft two-tone chime for an incoming message (Web Audio — no asset file).
 * Respects browser autoplay rules; may stay silent until the user has interacted with the page once.
 */
export function playIncomingMessageNotificationSound() {
  if (typeof window === "undefined") {
    return;
  }
  const now = Date.now();
  if (now - lastPlayedAt < MIN_INTERVAL_MS) {
    return;
  }
  lastPlayedAt = now;

  attachUnlockOnce();
  const ctx = getContext();
  if (!ctx) {
    return;
  }

  const run = () => {
    const t0 = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, t0);
    master.gain.exponentialRampToValueAtTime(0.12, t0 + 0.015);
    master.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);
    master.connect(ctx.destination);

    const ding = (freq: number, start: number, dur: number) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, start);
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.55, start + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      osc.connect(g);
      g.connect(master);
      osc.start(start);
      osc.stop(start + dur + 0.02);
    };

    ding(784, t0, 0.1);
    ding(1046, t0 + 0.11, 0.12);
  };

  if (ctx.state === "suspended") {
    void ctx.resume().then(run).catch(() => {
      /* autoplay blocked until user gesture */
    });
  } else {
    run();
  }
}
