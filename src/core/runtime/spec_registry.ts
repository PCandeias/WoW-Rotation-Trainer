import type { CharacterProfile } from '../data/profileParser';
import type { SpecRuntime } from './spec_runtime';
import { monkWindwalkerRuntime } from '../class_modules/monk/monk_spec_runtime';

export function resolveSpecRuntime(profile: CharacterProfile): SpecRuntime {
  if (profile.spec === 'monk') {
    return monkWindwalkerRuntime;
  }

  throw new Error(`No spec runtime registered for profile.spec='${profile.spec}'`);
}