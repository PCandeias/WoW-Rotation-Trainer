import type { BuffRegistry, BuffTrackerProps } from '@ui/components/BuffTracker';
import { MONK_BUFF_REGISTRY, resolveMonkBuffIconName } from '@core/class_modules/monk/monk_buff_registry';
import { SHAMAN_BUFF_REGISTRY } from '@core/class_modules/shaman/shaman_buff_registry';

const BUFF_REGISTRY_BY_PROFILE_SPEC = new Map<string, BuffRegistry>([
  ['monk', MONK_BUFF_REGISTRY],
  ['shaman', SHAMAN_BUFF_REGISTRY],
]);

const BUFF_ICON_RESOLVER_BY_PROFILE_SPEC = new Map<string, BuffTrackerProps['iconNameResolver']>([
  ['monk', resolveMonkBuffIconName],
]);

export function getBuffPresentationRegistryForProfileSpec(profileSpec: string): BuffRegistry {
  const registry = BUFF_REGISTRY_BY_PROFILE_SPEC.get(profileSpec);
  if (!registry) {
    throw new Error(`No buff presentation registry registered for profile spec '${profileSpec}'`);
  }

  return registry;
}

export function getBuffIconNameResolverForProfileSpec(
  profileSpec: string,
): BuffTrackerProps['iconNameResolver'] | undefined {
  return BUFF_ICON_RESOLVER_BY_PROFILE_SPEC.get(profileSpec);
}
