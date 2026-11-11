// Control panel: a row of icon tabs, one section open at a time. Sections that only make sense for
// the glass stand (flowers, glass, light, size) disappear when the current stool is shown.
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON = {
  view: '<path d="M4 8h3l1.5-2.500h7L17 8h3v11H4z"/><circle cx="12" cy="13.3" r="3.3"/>',
  object: '<path d="M12 3l8 4.500v9L12 21l-8-4.500v-9z"/><path d="M4 7.500l8 4.5 8-4.500M12 12v9"/>',
  flowers: '<circle cx="12" cy="5.2" r="2.3"/><circle cx="15.9" cy="8" r="2.3"/><circle cx="14.4" cy="12.3" r="2.3"/><circle cx="9.6" cy="12.3" r="2.3"/><circle cx="8.1" cy="8" r="2.3"/><path d="M12 14.600V21M12 18.500c1.8-2 3.6-2.2 5-1.5"/>',
  glass: '<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M9.3 4v16M14.7 4v16M4 9.300h16M4 14.700h16"/>',
  light: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.500c.800.8 1 1.5 1 2.500h6c0-1 .200-1.7 1-2.500A6 6 0 0 0 12 3z"/>',
  room: '<circle cx="12" cy="12" r="3.8"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.600l1.4 1.400M17 17l1.4 1.400M5.6 18.400L7 17M17 7l1.4-1.4"/>',
  size: '<path d="M5 19L19 5M5 19v-5M5 19h5M19 5v5M19 5h-5"/>',
};
const TABS = [['view', 'Views'], ['object', 'Object'], ['flowers', 'Flowers', true], ['glass', 'Glass', true], ['light', 'Light inside', true], ['size', 'Size', true], ['room', 'Room light']];

export function buildUI(S, api) {
  const panel = document.getElementById('panel'); panel.textContent = '';
  const body = el('div', 'body'), tabs = el('nav', 'tabs'); panel.append(body, tabs);
  const sections = {}, tabBtns = {}; let active = 'flowers';

  const section = (key) => { const s = el('section'); s.hidden = true; sections[key] = s; body.append(s); return s; };
  const seg = (parent, key, opts, rebuild = false, after) => {
    const row = el('div', 'seg');
    for (const [val, label] of Object.entries(opts)) {
      const b = el('button', '', label); b.type = 'button'; const v = val === 'true' ? true : val === 'false' ? false : val;
      b.classList.toggle('on', S[key] === v);
      b.onclick = () => { S[key] = v; row.querySelectorAll('button').forEach((x) => x.classList.remove('on')); b.classList.add('on'); api.apply(rebuild); if (after) after(); };
      row.append(b);
    }
    parent.append(row); return row;
  };
  const slider = (parent, key, label, min, max, step, fmt, rebuild = false) => {
    const row = el('label', 'slider'); const name = el('span', '', label), val = el('em', '', fmt(S[key]));
    const i = el('input'); i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = S[key]; i.id = 'ctl-' + key;
    i.oninput = () => { S[key] = parseFloat(i.value); val.textContent = fmt(S[key]); if (!rebuild) api.apply(false); };
    i.onchange = () => { if (rebuild) api.apply(true); };
    const top = el('div'); top.append(name, val); row.append(top, i); parent.append(row);
  };

  const refresh = () => {
    const stand = S.object === 'stand';
    for (const [key, , standOnly] of TABS) tabBtns[key].hidden = !!standOnly && !stand;
    if (tabBtns[active].hidden) active = 'object';
    for (const [key] of TABS) { sections[key].hidden = key !== active; tabBtns[key].classList.toggle('on', key === active && !panel.classList.contains('closed')); }
  };
  for (const [key, label] of TABS) {
    const b = el('button'); b.type = 'button'; b.innerHTML = svg(ICON[key]); b.title = label; b.setAttribute('aria-label', label);
    b.onclick = () => { if (active === key) panel.classList.toggle('closed'); else { active = key; panel.classList.remove('closed'); } refresh(); requestAnimationFrame(() => dispatchEvent(new Event('resize'))); };
    tabBtns[key] = b; tabs.append(b); section(key).append(el('h3', '', label));
  }

  const vr = el('div', 'seg wrap');
  for (const [k, label] of Object.entries({ hero: 'Niche', front: 'Front', close: 'Close', top: 'Bowl', hall: 'Entrance', wide: 'Whole hall', bed: 'Office door', passage: 'Passage' })) { const b = el('button', '', label); b.type = 'button'; b.onclick = () => api.goView(k); vr.append(b); }
  sections.view.append(vr); seg(sections.view, 'spin', { false: 'Still', true: 'Slow orbit' });

  seg(sections.object, 'object', { stand: 'Glass stand', stool: 'Current stool' }, false, refresh); seg(sections.object, 'bowl', { true: 'Key bowl', false: 'No bowl' });

  seg(sections.flowers, 'flowers', { ...api.flowers, none: 'Empty' }, true).classList.add('wrap');
  const again = el('button', 'ghost', 'Rearrange'); again.type = 'button'; again.onclick = () => api.reseed(); sections.flowers.append(again);

  seg(sections.glass, 'glass', { edelit: 'Pixel', flutes: 'Flutes', clear: 'Clear' });
  slider(sections.glass, 'strength', 'Pattern depth', .3, 1.8, .05, (v) => v.toFixed(2) + '×');
  seg(sections.glass, 'mirror', { true: 'Mirror floor', false: 'Clear base' });

  seg(sections.light, 'lamp', { off: 'Off', top: 'LED under lid', globe: 'Globe lamp' }, true);
  slider(sections.light, 'lampI', 'Brightness', .1, 1.5, .05, (v) => Math.round(v * 100) + '%');
  slider(sections.light, 'warmth', 'Warmth', 0, 1, .05, (v) => Math.round(4200 - v * 2000) + ' K');

  slider(sections.size, 'H', 'Height', .7, 1.1, .01, (v) => Math.round(v * 100) + ' cm', true);
  slider(sections.size, 'W', 'Footprint', .3, .45, .0125, (v) => (v * 100).toFixed(1).replace('.0', '') + ' cm', true);

  seg(sections.room, 'time', { day: 'Daylight', evening: 'Evening' });

  if (innerWidth < 700) panel.classList.add('closed');
  refresh(); requestAnimationFrame(() => dispatchEvent(new Event('resize')));
}
