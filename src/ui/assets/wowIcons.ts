export const LOCAL_WOW_ICON_MANIFEST: Record<string, string> = {};

export function getLocalWowIconPath(iconName: string): string | undefined {
  const relativePath = LOCAL_WOW_ICON_MANIFEST[iconName];
  if (!relativePath) {
    return undefined;
  }

  if (typeof document === 'undefined') {
    return `/${relativePath.replace(/^\/+/, '')}`;
  }

  return new URL(relativePath.replace(/^\/+/, ''), document.baseURI).toString();
}
