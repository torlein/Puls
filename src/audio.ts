// Korte, dempede bankelyder for Korotkoff-lydene. Lyden er av som standard og
// slås på med en avkrysningsboks, så den alltid starter etter et klikk.

let ctx: AudioContext | null = null;
export let soundOn = false;

export function setSound(on: boolean): void {
  soundOn = on;
  if (on && !ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AC) ctx = new AC();
  }
  if (on && ctx?.state === 'suspended') void ctx.resume();
}

export function thump(strength = 1): void {
  if (!soundOn || !ctx) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(110, t);
  osc.frequency.exponentialRampToValueAtTime(48, t + 0.12);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.35 * strength, t + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.18);
}
