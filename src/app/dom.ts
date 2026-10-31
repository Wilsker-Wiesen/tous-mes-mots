// Kleine DOM-Hilfen ohne Framework.

const root = document.getElementById('app')!;

export type Child = Node | string | null | false | undefined;
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  const { class: cls, ...rest } = props;
  if (cls) el.className = cls;
  Object.assign(el, rest);
  for (const c of children) if (c) el.append(c);
  return el;
}

export function show(...nodes: Node[]): void {
  root.replaceChildren(...nodes);
}

