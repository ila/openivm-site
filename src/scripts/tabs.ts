// Accessible tabs: [data-tabs] root with role="tab" buttons (aria-controls → panel id).
export function initTabs(root: ParentNode = document) {
  for (const el of root.querySelectorAll<HTMLElement>('[data-tabs]')) {
    if (el.dataset.tabsReady) continue;
    el.dataset.tabsReady = '1';
    const tabs = [...el.querySelectorAll<HTMLButtonElement>(':scope > [role="tablist"] [role="tab"]')];
    const select = (tab: HTMLButtonElement) => {
      for (const t of tabs) {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        const panel = document.getElementById(t.getAttribute('aria-controls')!);
        if (panel) panel.hidden = !on;
      }
    };
    for (const t of tabs) t.addEventListener('click', () => select(t));
    el.addEventListener('keydown', (e) => {
      const i = tabs.indexOf(document.activeElement as HTMLButtonElement);
      if (i < 0 || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
      const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]!;
      next.focus();
      select(next);
    });
  }
}
