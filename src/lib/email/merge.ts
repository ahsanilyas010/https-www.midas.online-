export function renderTemplate(template: string, data: Record<string, string | null | undefined>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => data[key] ?? "");
}
