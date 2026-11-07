// Unterbrechung durch andere Apps (Navigationsansage): Vorgelesenes wird wiederholt, Gehörtes verworfen.
// Browser-Schnittstellen sind hier von Hand nachgebaut.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Listener = () => void;

class FakeContext {
  static last: FakeContext;
  state = 'running';
  private listeners: Listener[] = [];
  constructor() {
    FakeContext.last = this;
  }
  addEventListener(_: string, fn: Listener) {
    this.listeners.push(fn);
  }
  setState(s: string) {
    this.state = s;
    for (const fn of this.listeners) fn();
  }
  resume() {
    return Promise.resolve();
  }
}

class FakeUtterance {
  lang = '';
  rate = 1;
  voice: unknown = null;
  onend: (() => void) | null = null;
  onerror: ((ev: { error: string }) => void) | null = null;
  constructor(public text: string) {}
}

class FakeRecognition {
  static last: FakeRecognition;
  lang = '';
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  onresult: ((ev: unknown) => void) | null = null;
  onerror: ((ev: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  constructor() {
    FakeRecognition.last = this;
  }
  start() {}
  abort() {
    this.onerror?.({ error: 'aborted' });
    this.onend?.();
  }
}

let spoken: FakeUtterance[] = [];

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  spoken = [];
  const synth = {
    speak: (u: FakeUtterance) => spoken.push(u),
    cancel: () => {},
    getVoices: () => [],
    addEventListener: () => {},
  };
  vi.stubGlobal('window', { webkitSpeechRecognition: FakeRecognition, speechSynthesis: synth });
  vi.stubGlobal('speechSynthesis', synth);
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
  vi.stubGlobal('AudioContext', FakeContext);
  vi.stubGlobal('navigator', {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function ready() {
  const speech = await import('./speech.ts');
  const unlocked = speech.unlockAudio(false);
  await vi.advanceTimersByTimeAsync(2000);
  await unlocked;
  spoken = [];
  return speech;
}

describe('say', () => {
  it('spricht nach einer Unterbrechung noch einmal', async () => {
    const { say } = await ready();
    const done = say('la grenouille', 'fr-FR');
    await vi.advanceTimersByTimeAsync(0);
    expect(spoken).toHaveLength(1);
    spoken[0]!.onerror?.({ error: 'interrupted' });
    await vi.advanceTimersByTimeAsync(2000);
    expect(spoken).toHaveLength(2);
    spoken[1]!.onend?.();
    await done;
    expect(spoken.map((u) => u.text)).toEqual(['la grenouille', 'la grenouille']);
  });

  it('wiederholt nicht, wenn der Nutzer selbst abbricht', async () => {
    const { say, stopSpeaking } = await ready();
    const done = say('la grenouille', 'fr-FR');
    await vi.advanceTimersByTimeAsync(0);
    stopSpeaking();
    spoken[0]!.onerror?.({ error: 'interrupted' });
    await done;
    await vi.advanceTimersByTimeAsync(3000);
    expect(spoken).toHaveLength(1);
  });

  it('wartet, bis der Ton wieder frei ist', async () => {
    const { say } = await ready();
    const done = say('das Eichhörnchen', 'de-DE');
    await vi.advanceTimersByTimeAsync(0);
    FakeContext.last.setState('interrupted');
    spoken[0]!.onend?.();
    await vi.advanceTimersByTimeAsync(5000);
    expect(spoken).toHaveLength(1);
    FakeContext.last.setState('running');
    await vi.advanceTimersByTimeAsync(3000);
    expect(spoken).toHaveLength(2);
    spoken[1]!.onend?.();
    await done;
  });
});

describe('listen', () => {
  it('verwirft Gehörtes, wenn eine andere App dazwischen war', async () => {
    const { listen } = await ready();
    const heard = listen('fr-FR', 8000);
    const r = FakeRecognition.last;
    r.onresult?.({ results: { length: 1, 0: { length: 1, 0: { transcript: 'tournez à droite' } } } });
    FakeContext.last.setState('interrupted');
    FakeContext.last.setState('running');
    r.onend?.();
    await vi.advanceTimersByTimeAsync(2000);
    expect(await heard).toEqual({ kind: 'interrupted' });
  });

  it('liefert sonst das Gesagte', async () => {
    const { listen } = await ready();
    const heard = listen('fr-FR', 8000);
    const r = FakeRecognition.last;
    r.onresult?.({ results: { length: 1, 0: { length: 1, 0: { transcript: 'la grenouille' } } } });
    r.onend?.();
    expect(await heard).toEqual({ kind: 'speech', alts: ['la grenouille'] });
  });
});
