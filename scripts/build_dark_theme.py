#!/usr/bin/env python3
"""Generate dist/theme.css and dist/theme-map.js from dist/styles.css.

styles.css stays the single hand-edited stylesheet. This script derives:
  * light-theme contrast repairs: any `color` declaration whose contrast
    against the page or card background is below WCAG AA (4.5:1) is darkened
    along its own hue until it passes;
  * a dark theme: every colour-bearing declaration is re-emitted under
    `:root[data-theme="dark"]` and under `prefers-color-scheme: dark` (unless
    the reader chose light), with lightness remapped in OKLCH and hue kept;
  * theme-map.js: the same light->dark map for colours that app.js and
    bottleneck-view.js write into inline SVG, applied at runtime by theme.js.

Re-run after editing styles.css or the colour literals in the scripts:
    python3 scripts/build_dark_theme.py
The output is deterministic, so CI can regenerate it on every deploy.
"""
import json
import math
import re
from pathlib import Path

DIST = Path(__file__).resolve().parent.parent / 'dist'
SRC = DIST / 'styles.css'
OUT_CSS = DIST / 'theme.css'
OUT_MAP = DIST / 'theme-map.js'
JS_SOURCES = ['app.js', 'bottleneck-view.js']

DARK = ':root[data-theme="dark"]'
SYSTEM = ':root:not([data-theme="light"])'
COLOR_RE = re.compile(r'#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\([^)]*\)|(?<![-\w])white(?![-\w])')
COLOR_PROPS = ('color', 'background', 'background-color', 'background-image', 'border', 'border-color',
               'border-top', 'border-bottom', 'border-left', 'border-right', 'border-top-color',
               'border-bottom-color', 'border-left-color', 'border-right-color', 'outline', 'outline-color',
               'box-shadow', 'fill', 'stroke', 'stop-color', 'text-decoration-color', 'caret-color',
               'scrollbar-color', 'accent-color', 'column-rule')

# Core tokens get hand-chosen dark values; everything else is derived.
TOKENS_DARK = {
    '--bg': '#121917', '--paper': '#1a2321', '--ink': '#e7efe9', '--text': '#c3d0ca',
    '--muted': '#93a39d', '--border': '#2c3a37', '--teal': '#5fbcb0', '--teal-soft': '#16302c',
    '--orange': '#e3926d', '--orange-soft': '#36231a', '--blue': '#98add0',
}
# Containers with a dark fill in the light theme: their light text is intentional.
DARK_FILL_SCOPES = ('.endpoint-gate', '.proof-endpoint', '.button.primary', '.skip-link', '.notice', '.brand-symbol')
PAGE = (0xf7, 0xf8, 0xf6)
CARD = (0xff, 0xff, 0xff)


# ---------- colour maths ----------
def parse(c):
    c = c.strip().lower()
    if c == 'white':
        return (255, 255, 255, 1.0)
    if c.startswith('#'):
        h = c[1:]
        if len(h) == 3:
            h = ''.join(ch * 2 for ch in h)
        return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 1.0)
    nums = [float(x) for x in re.findall(r'[\d.]+', c)]
    return (int(nums[0]), int(nums[1]), int(nums[2]), nums[3] if len(nums) > 3 else 1.0)


def fmt(rgb, a=1.0):
    r, g, b = (max(0, min(255, round(v))) for v in rgb)
    if a >= 0.999:
        return '#%02x%02x%02x' % (r, g, b)
    return 'rgba(%d,%d,%d,%s)' % (r, g, b, ('%.3f' % a).rstrip('0').rstrip('.'))


def _lin(v):
    v /= 255
    return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4


def _gam(v):
    v = max(0.0, min(1.0, v))
    return 255 * (12.92 * v if v <= 0.0031308 else 1.055 * v ** (1 / 2.4) - 0.055)


def to_oklch(rgb):
    r, g, b = (_lin(v) for v in rgb)
    l = (0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b) ** (1 / 3)
    m = (0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b) ** (1 / 3)
    s = (0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b) ** (1 / 3)
    L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s
    A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s
    B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
    return L, math.hypot(A, B), math.atan2(B, A)


def from_oklch(L, C, H):
    A, B = C * math.cos(H), C * math.sin(H)
    l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
    m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
    s = (L - 0.0894841775 * A - 1.2914855480 * B) ** 3
    r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
    g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
    b = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    return tuple(_gam(v) for v in (r, g, b))


def in_gamut(L, C, H):
    """Reduce chroma until the colour is representable in sRGB."""
    for _ in range(40):
        A, B = C * math.cos(H), C * math.sin(H)
        l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
        m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
        s = (L - 0.0894841775 * A - 1.2914855480 * B) ** 3
        rgb = (4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
               -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
               -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)
        if all(-1e-4 <= v <= 1 + 1e-4 for v in rgb):
            break
        C *= 0.92
    return from_oklch(L, C, H)


def luminance(rgb):
    r, g, b = (_lin(v) for v in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a, b):
    la, lb = sorted((luminance(a), luminance(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def dark_of(color, role):
    """Map a light-theme colour to its dark-theme counterpart.

    role: 'fg' for text/icons, 'bg' for surfaces, 'line' for borders/strokes.
    Surfaces invert lightness (light tints become dark tints of the same hue),
    foregrounds become light, and saturated accents are lifted for contrast.
    """
    r, g, b, a = parse(color)
    L, C, H = to_oklch((r, g, b))
    if role == 'fg':
        if L < 0.88:                       # ink, body and muted text -> light
            L2 = max(0.70, 0.97 - 0.42 * L)
        else:                              # near-white text on dark fills
            L2 = 0.24
        C2 = C * (0.9 if C > 0.04 else 1.0)
    elif role == 'mark':                   # pale chart marks: paler means dimmer
        L2, C2 = max(0.36, 0.62 - (L - 0.8) * 2), C * 0.9
    elif role == 'line':
        L2 = 0.30 + (1 - L) * 0.55 if L > 0.6 else min(0.9, 0.55 + L * 0.45)
        C2 = C * 0.9
    else:                                  # surfaces
        if L >= 0.985:
            L2 = 0.215                     # cards sit above the page
        elif L > 0.80:
            L2 = 0.20 + (0.985 - L) * 0.62
        elif L > 0.55:                     # mid tones: accents keep identity
            L2 = 0.62 + (L - 0.55) * 0.3
        elif L < 0.45:                     # ink-coloured fills follow --ink and turn light
            L2 = 0.88
        else:                              # mid-dark fills (badges)
            L2 = 0.30 + L * 0.35
        C2 = min(C * 1.15, 0.06) if L > 0.8 else C
    if role == 'onfill':                   # text on a fill that turns light
        L2, C2 = 0.24, C
    if role == 'fg' and C > 0.04 and L < 0.62:   # saturated accents: keep hue, lift
        L2, C2 = max(0.74, 0.55 + L * 0.35), C * 0.95
    return fmt(in_gamut(L2, C2, H), a)


def light_fix(color, backgrounds=(PAGE, CARD), target=4.6):
    """Darken a text colour along its hue until it meets AA on both surfaces."""
    r, g, b, a = parse(color)
    if a < 0.999:
        return None
    if min(contrast((r, g, b), bg) for bg in backgrounds) >= 4.5:
        return None
    L, C, H = to_oklch((r, g, b))
    if L > 0.85:                           # light text meant for dark fills
        return None
    while L > 0.05:
        L -= 0.01
        rgb = in_gamut(L, C, H)
        if min(contrast(rgb, bg) for bg in backgrounds) >= target:
            return fmt(rgb)
    return None


# ---------- minimal CSS walker ----------
def blocks(css):
    """Yield (prelude, body) for top-level blocks; nested blocks are kept raw."""
    i, n = 0, len(css)
    while i < n:
        j = css.find('{', i)
        if j < 0:
            break
        depth, k = 1, j + 1
        while k < n and depth:
            depth += {'{': 1, '}': -1}.get(css[k], 0)
            k += 1
        yield css[i:j].strip(), css[j + 1:k - 1]
        i = k


def declarations(body):
    out = []
    for decl in body.split(';'):
        if ':' not in decl:
            continue
        prop, val = decl.split(':', 1)
        out.append((prop.strip().lower(), val.strip()))
    return out


def role_of(prop):
    if prop in ('color', 'fill', 'caret-color', 'text-decoration-color', 'accent-color'):
        return 'fg'
    if prop.startswith('border') or prop.startswith('outline') or prop in ('stroke', 'column-rule',
                                                                             'box-shadow', 'scrollbar-color'):
        return 'line'
    return 'bg'


def scope(selectors, prefix):
    parts = []
    for sel in selectors.split(','):
        sel = sel.strip()
        if not sel:
            continue
        if sel in (':root', 'html'):
            parts.append(prefix)
        elif sel.startswith(':root') or sel.startswith('html'):
            parts.append(prefix + sel.split(None, 1)[1:][0] if ' ' in sel else prefix)
        else:
            parts.append(f'{prefix} {sel}')
    return ','.join(parts)


def transform_rules(css, light_rules, dark_rules, media=None):
    for prelude, body in blocks(css):
        if prelude.startswith('@media'):
            if 'prefers-reduced-motion' in prelude:
                continue
            transform_rules(body, light_rules, dark_rules, media=prelude)
            continue
        if prelude.startswith('@'):
            continue
        light, dark = [], []
        for prop, val in declarations(body):
            if prop.startswith('--'):
                if prelude.strip() == ':root' and prop in TOKENS_DARK:
                    dark.append(f'{prop}:{TOKENS_DARK[prop]}')
                continue
            if prop not in COLOR_PROPS:
                continue
            if not COLOR_RE.search(val):
                # Token-only values are already themed, but must be repeated so that
                # prefixed dark rules keep the cascade order of the light sheet.
                if 'var(--' in val:
                    dark.append(f'{prop}:{val}')
                continue
            role = role_of(prop)
            if role == 'fg' and any(k in prelude for k in DARK_FILL_SCOPES):
                role = 'onfill'
            if prop == 'color' and not any(k in prelude for k in DARK_FILL_SCOPES):
                fixes = {}
                for m in COLOR_RE.finditer(val):
                    f = light_fix(m.group(0))
                    if f:
                        fixes[m.group(0)] = f
                if fixes:
                    light.append(f'{prop}:{COLOR_RE.sub(lambda m: fixes.get(m.group(0), m.group(0)), val)}')
            if prop == 'background' and 'url(' in val:
                # Redeclaring the shorthand would reset size/position of the image.
                dark.append(f'background-color:{dark_of(COLOR_RE.search(val).group(0), role)}')
                continue
            dark.append(f'{prop}:{COLOR_RE.sub(lambda m: dark_of(m.group(0), role), val)}')
        if light:
            light_rules.append((media, f'{prelude}{{{";".join(light)}}}'))
        if dark:
            body = ';'.join(dark)
            dark_rules.append((media, f'{scope(prelude, DARK)}{{{body}}}',
                               f'{scope(prelude, SYSTEM)}{{{body}}}'))


def build():
    css = SRC.read_text()
    css = re.sub(r'@import\s+url\([^)]*\)[^;]*;', '', css)   # the font URL itself contains ';'
    css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
    light, dark = [], []
    transform_rules(css, light, dark)

    def wrap(media, rule):
        return f'{media}{{{rule}}}' if media else rule

    out = ['/* Generated by scripts/build_dark_theme.py from styles.css. Do not edit by hand. */',
           ':root{color-scheme:light;--muted:#636f6b}',   # AA muted text in light f'{DARK}{{color-scheme:dark}}',
           '@media (prefers-color-scheme:dark){' + SYSTEM + '{color-scheme:dark}}',
           '/* Light theme: WCAG AA contrast repairs for small text. */']
    out += [wrap(m, r) for m, r in light]
    out.append('/* Dark theme chosen explicitly. */')
    out += [wrap(m, d) for m, d, _ in dark]
    out.append('/* Dark theme from the system preference, unless light was chosen. */')
    sys_rules = [wrap(m, s) for m, _, s in dark]
    out.append('@media (prefers-color-scheme:dark){' + ''.join(sys_rules) + '}')
    OUT_CSS.write_text('\n'.join(out) + '\n')

    # Colours written by JavaScript into inline SVG or style attributes.
    found = set()
    for name in JS_SOURCES:
        src = (DIST / name).read_text()
        found |= {m.group(0).lower() for m in re.finditer(r'#[0-9a-fA-F]{6}\b', src)}
    mapping = {}
    for c in sorted(found):
        L = to_oklch(parse(c)[:3])[0]
        # In the charts pale colours are marks (dots, grid, ramp ends), not surfaces.
        mapping[c] = dark_of(c, 'bg' if L >= 0.97 else 'mark' if L > 0.8 else 'fg')
    mapping['white'] = TOKENS_DARK['--paper']
    mapping['#fff'] = TOKENS_DARK['--paper']
    clash = set(mapping) & set(v.lower() for v in mapping.values())
    for k in clash:                      # keep dark outputs from being remapped again
        mapping[k] = fmt(tuple(v + 1 for v in parse(mapping[k])[:3]))
    OUT_MAP.write_text('// Generated by scripts/build_dark_theme.py. Do not edit by hand.\n'
                       f'export const DARK_MAP = {json.dumps(mapping, indent=0, sort_keys=True)};\n')
    return len(light), len(dark), len(mapping)


if __name__ == '__main__':
    nl, nd, nm = build()
    print(f'theme.css: {nl} light contrast repairs, {nd} dark rules; theme-map.js: {nm} colours')
