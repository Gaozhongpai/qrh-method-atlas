// Colour theme: system (default), light or dark. CSS handles the stylesheet
// colours (theme.css); this module remaps colours that the charts write into
// inline SVG attributes and style attributes, and restores them for light.
import {DARK_MAP} from './theme-map.js?v=atlas-4';

const root = document.documentElement;
const media = matchMedia('(prefers-color-scheme: dark)');
const MODES = ['system', 'light', 'dark'];
const LABEL = {system: 'Auto', light: 'Light', dark: 'Dark'};
const ICON = {system: '◐', light: '☀', dark: '☾'};
const ATTRS = ['fill', 'stroke', 'stop-color'];
const COLOR = /#[0-9a-fA-F]{6}\b|#fff\b|\bwhite\b/g;

const stored = () => {try {const t = localStorage.getItem('qrh-theme'); return MODES.includes(t) ? t : 'system';} catch {return 'system';}};
let mode = stored();
const isDark = () => mode === 'dark' || (mode === 'system' && media.matches);
const swap = value => value.replace(COLOR, c => DARK_MAP[c.toLowerCase()] || c);

function paint(el, dark) {
  for (const attr of ATTRS) {
    const key = `light${attr.replace('-c', 'C').replace(/^./, c => c.toUpperCase())}`;
    if (dark) {
      const value = el.getAttribute(attr);
      if (value == null || el.dataset[key] != null) continue;
      const next = swap(value);
      if (next !== value) {el.dataset[key] = value; el.setAttribute(attr, next);}
    } else if (el.dataset[key] != null) {
      el.setAttribute(attr, el.dataset[key]); delete el.dataset[key];
    }
  }
  const style = el.getAttribute('style');
  if (dark && style && el.dataset.lightStyle == null) {
    const next = swap(style);
    if (next !== style) {el.dataset.lightStyle = style; el.setAttribute('style', next);}
  } else if (!dark && el.dataset.lightStyle != null) {
    el.setAttribute('style', el.dataset.lightStyle); delete el.dataset.lightStyle;
  }
}

function paintTree(node, dark) {
  if (node.nodeType !== 1) return;
  paint(node, dark);
  node.querySelectorAll('[fill],[stroke],[stop-color],[style]').forEach(el => paint(el, dark));
}

let observer = null;
function apply() {
  const dark = isDark();
  if (mode === 'system') delete root.dataset.theme; else root.dataset.theme = mode;
  paintTree(document.body, dark);
  observer?.disconnect();
  observer = null;
  if (dark) {
    observer = new MutationObserver(records => {
      for (const r of records) {
        if (r.type === 'attributes') {
          const data = `light${r.attributeName === 'style' ? 'Style' : r.attributeName.replace('-c', 'C').replace(/^./, c => c.toUpperCase())}`;
          delete r.target.dataset[data];
          paint(r.target, true);
        } else r.addedNodes.forEach(n => paintTree(n, true));
      }
      observer.takeRecords();   // drop the mutations caused by this repaint
    });
    observer.observe(document.body, {subtree: true, childList: true, attributes: true, attributeFilter: [...ATTRS, 'style']});
  }
  const button = document.getElementById('theme-toggle');
  if (button) {
    const next = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
    button.innerHTML = `${ICON[mode]} <span>${LABEL[mode]}</span>`;
    button.setAttribute('aria-label', `Colour theme: ${LABEL[mode]}. Switch to ${LABEL[next]}`);
    button.title = `Theme: ${LABEL[mode]} · click for ${LABEL[next]}`;
  }
}

function init() {
  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
    try {mode === 'system' ? localStorage.removeItem('qrh-theme') : localStorage.setItem('qrh-theme', mode);} catch {}
    apply();
  });
  media.addEventListener?.('change', () => {if (mode === 'system') apply();});
  apply();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
export {isDark};
