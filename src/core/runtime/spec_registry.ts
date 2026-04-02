import type { CharacterProfile } from '../data/profileParser';
import type { SpecRuntime } from './spec_runtime';
import { monkWindwalkerRuntime } from '../class_modules/monk/monk_spec_runtime';
import { shamanEnhancementRuntime } from '../class_modules/shaman/shaman_spec_runtime';

const RUNTIME_REGISTRY = new Map<string, SpecRuntime>([
  ['monk', monkWindwalkerRuntime],
  ['shaman', shamanEnhancementRuntime],
]);

export function resolveSpecRuntime(profile: CharacterProfile): SpecRuntime {
  const runtime = RUNTIME_REGISTRY.get(profile.spec);
  if (runtime) {
    return runtime;
  }

  throw new Error(`No spec runtime registered for profile.spec='${profile.spec}'`);
}
