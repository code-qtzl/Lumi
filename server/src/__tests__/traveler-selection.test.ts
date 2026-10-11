import { assertTravelerConfig, getTraveler, setTraveler } from '../traveler';

/**
 * A configured model traveler answers EVERY turn — there is no per-turn
 * random routing to the fixture (a 75/25 "mix lane" once shipped canned,
 * context-blind replies into live sessions; this pins its removal).
 * The fixture is selected only when no model key is configured (F7).
 */
describe('traveler selection', () => {
  const ENV_KEYS = ['GROQ_API_KEY', 'OLLAMA_MODEL', 'OPENAI_API_KEY', 'TRAVELER_API_KEY', 'TRAVELER_API_BASE', 'GEMINI_API_KEY'] as const;
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = Object.fromEntries(ENV_KEYS.map(k => [k, process.env[k]]));
    for (const k of ENV_KEYS) delete process.env[k];
    setTraveler(null); // reset the cached engine
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    setTraveler(null);
  });

  it('uses the model engine directly when a key is configured — no mix wrapper', () => {
    process.env.GROQ_API_KEY = 'test-key';
    const engine = getTraveler();
    expect(engine.name).toBe('groq:openai/gpt-oss-120b');
    expect(engine.name).not.toMatch(/^mix-/);
  });

  it('selects Ollama when configured without Groq', () => {
    process.env.OLLAMA_MODEL = 'llama3.3';
    expect(getTraveler().name).toBe('ollama:llama3.3');
  });

  it('falls back to the fixture engine only when keyless', () => {
    expect(getTraveler().name).toBe('fixture');
  });
});

/**
 * Production must never silently serve the fixture: a deploy with an empty
 * GROQ_API_KEY secret once ran canned replies on the live site.
 */
describe('assertTravelerConfig (production boot guard)', () => {
  const KEYS = ['NODE_ENV', 'ALLOW_FIXTURE', 'GROQ_API_KEY', 'OLLAMA_MODEL', 'OPENAI_API_KEY', 'TRAVELER_API_KEY', 'TRAVELER_API_BASE', 'GEMINI_API_KEY'] as const;
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = Object.fromEntries(KEYS.map(k => [k, process.env[k]]));
    for (const k of KEYS) delete process.env[k];
    setTraveler(null);
  });

  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    setTraveler(null);
  });

  it('refuses to boot in production when the model key is empty', () => {
    process.env.NODE_ENV = 'production';
    process.env.GROQ_API_KEY = '';
    expect(() => assertTravelerConfig()).toThrow(/No traveler model configured/);
  });

  it('boots in production with a model key', () => {
    process.env.NODE_ENV = 'production';
    process.env.GROQ_API_KEY = 'test-key';
    expect(() => assertTravelerConfig()).not.toThrow();
  });

  it('allows the fixture in production only with ALLOW_FIXTURE=1', () => {
    process.env.NODE_ENV = 'production';
    process.env.ALLOW_FIXTURE = '1';
    expect(() => assertTravelerConfig()).not.toThrow();
  });

  it('never blocks keyless dev', () => {
    process.env.NODE_ENV = 'development';
    expect(() => assertTravelerConfig()).not.toThrow();
  });
});
