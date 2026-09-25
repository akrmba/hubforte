export function mergeTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return variables[key] ?? match;
  });
}

export function extractVariables(template: string): string[] {
  const matches = template.match(/\{\{(\w+)\}\}/g) || [];
  const vars = matches.map((m) => m.replace(/^\{\{|\}\}$/g, ""));
  return [...new Set(vars)];
}
