#!/usr/bin/env python3
"""Sync upstream pstack skills into the DSH plugin, preserving the DSH seam.

The DSH port of pstack is upstream prose plus a small, *file-local* set of
adaptations. Hand-merging those adaptations on every upstream release is what
made the old fork rot 64 commits behind. This script keeps the adaptations in
`overrides/` instead:

  overrides/<skill>/<path>   complete replacement files, copied verbatim
  overrides/<skill>/<path>.patch
                             unified diffs applied to the upstream file

Everything not named in `overrides/` is copied from upstream unchanged. That
means a re-sync is a file copy, and the diff between the DSH tree and upstream
is exactly the contents of `overrides/`.

Two normalizations are mandatory and are not "adaptations":

  * Line endings become LF. The DSH skill loader splits frontmatter on "\\n"
    and would otherwise read a trailing "\\r" into every value, which fails the
    name pattern and makes the loader *silently drop the skill*.
  * Encoding must stay valid UTF-8. An earlier sync wrote CP1252-decoded bytes
    back out as UTF-8 and turned every U+2192 into mojibake.

Usage:
    python sync-skills.py --upstream <dir> --dest <dir> [--check]
"""

import argparse
import os
import re
import shutil
import subprocess
import sys

NAME_RE = re.compile(r'^[a-z0-9]+(?:-[a-z0-9]+)*$')

# A skill the DSH loader will accept: kebab-case name plus a description.
def parse_frontmatter(text):
    if not text.startswith('---'):
        return None
    end = text.find('\n---', 3)
    if end < 0:
        return None
    fields = {}
    for line in text[4:end].split('\n'):
        m = re.match(r'^([A-Za-z0-9_-]+):\s*(.*)$', line)
        if m:
            fields[m.group(1)] = m.group(2)
    return fields


def read_lf(path):
    with open(path, 'rb') as f:
        raw = f.read()
    try:
        text = raw.replace(b'\r\n', b'\n').decode('utf-8')
    except UnicodeDecodeError as exc:
        raise SystemExit(f'invalid UTF-8 in {path}: {exc}')
    return repair_mojibake(text)


# The same corruption keeps coming back, so it is repaired rather than trusted.
# A UTF-8 file read as CP1252 and written back as UTF-8 turns each multi-byte
# character into two or three junk characters: U+2192 (->) becomes U+00E2 U+2020
# U+2019, which displays as "â†’". It happened once in the 0.15.20 sync and again
# in a hand-made 0.15.29 mirror branch, so normalizing it here means a re-sync
# produces correct prose regardless of which tree it is handed.
#
# Only sequences that cannot be legitimate text are touched: every pattern below
# is a CP1252 reading of UTF-8 lead bytes, which never occurs in real prose.
MOJIBAKE = [
    ('\u00e2\u2020\u2019', '\u2192'),  # ->  (U+2192 rightwards arrow)
    ('\u00e2\u2020\u0090', '\u2190'),  # <-  (U+2190 leftwards arrow)
    ('\u00e2\u20ac\u201d', '\u2014'),  # --  (U+2014 em dash)
    ('\u00e2\u20ac\u201c', '\u2013'),  # -   (U+2013 en dash)
    ('\u00e2\u20ac\u2122', '\u2019'),  # '   (U+2019 right single quote)
    ('\u00e2\u20ac\u0153', '\u201c'),  # "   (U+201C left double quote)
    ('\u00e2\u20ac\u009d', '\u201d'),  # "   (U+201D right double quote)
    ('\u00e2\u20ac\u00a6', '\u2026'),  # ... (U+2026 horizontal ellipsis)
    ('\u00c3\u00a9', '\u00e9'),        # e-acute
    ('\u00c3\u00a0', '\u00e0'),        # a-grave
    ('\u00c2\u00a0', '\u00a0'),        # non-breaking space
]


def repair_mojibake(text):
    for broken, fixed in MOJIBAKE:
        text = text.replace(broken, fixed)
    return text


def write_lf(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb') as f:
        f.write(text.replace('\r\n', '\n').encode('utf-8'))


def apply_overrides(upstream_root, dest_root, overrides_root):
    """Copy upstream, then layer overrides/ on top. Returns (applied, missing)."""
    applied = []
    missing = []

    # 1. copy upstream skills, LF-normalized
    for skill in sorted(os.listdir(upstream_root)):
        src = os.path.join(upstream_root, skill)
        if not os.path.isdir(src):
            continue
        for dirpath, _, names in os.walk(src):
            for n in names:
                s = os.path.join(dirpath, n)
                rel = os.path.relpath(s, upstream_root)
                write_lf(os.path.join(dest_root, rel), read_lf(s))

    # 2. layer overrides
    if not os.path.isdir(overrides_root):
        return applied, missing

    for skill in sorted(os.listdir(overrides_root)):
        sdir = os.path.join(overrides_root, skill)
        if not os.path.isdir(sdir):
            continue
        for dirpath, _, names in os.walk(sdir):
            for n in names:
                o = os.path.join(dirpath, n)
                rel = os.path.relpath(o, overrides_root)
                if n.endswith('.patch'):
                    target_rel = rel[:-len('.patch')]
                    target = os.path.join(dest_root, target_rel)
                    if not os.path.isfile(target):
                        missing.append(f'{rel} (patch target {target_rel} absent)')
                        continue
                    # `git apply` obeys core.autocrlf from global config, which is
                    # `true` on this machine: it would write CR back into every
                    # patched file and the loader would then silently drop those
                    # skills. Force LF for this invocation only.
                    res = subprocess.run(
                        ['git', '-c', 'core.autocrlf=false', '-c', 'core.eol=lf',
                         'apply', '--whitespace=nowarn', '-p1', '--directory', '', o],
                        cwd=dest_root, capture_output=True, text=True)
                    if res.returncode != 0:
                        missing.append(f'{rel} (patch failed: {res.stderr.strip()[:200]})')
                        continue
                    # Belt and braces: normalize whatever git wrote.
                    write_lf(target, read_lf(target))
                    applied.append(rel)
                else:
                    write_lf(os.path.join(dest_root, rel), read_lf(o))
                    applied.append(rel)
    return applied, missing


def validate(dest_root):
    """Every skill the loader would reject is a bug; report them all."""
    problems = []
    count = 0
    for skill in sorted(os.listdir(dest_root)):
        p = os.path.join(dest_root, skill, 'SKILL.md')
        if not os.path.isfile(p):
            continue
        count += 1
        raw = open(p, 'rb').read()
        if b'\r' in raw:
            problems.append(f'{skill}: contains CR (loader will drop it)')
            continue
        text = raw.decode('utf-8', 'replace')
        fm = parse_frontmatter(text)
        if fm is None:
            problems.append(f'{skill}: no parseable frontmatter')
            continue
        name = fm.get('name', '').strip('"\'')
        if name == 'Poteto Mode':
            name = 'poteto-mode'
        if not NAME_RE.match(name):
            problems.append(f'{skill}: name {name!r} fails the loader pattern')
        if not fm.get('description', '').strip():
            problems.append(f'{skill}: empty description')
    return count, problems


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--upstream', required=True, help='upstream pstack skills/ directory')
    ap.add_argument('--dest', required=True, help='DSH plugin skills/ directory')
    ap.add_argument('--overrides', default=os.path.join(os.path.dirname(__file__), 'overrides'))
    ap.add_argument('--check', action='store_true', help='validate only, do not write')
    args = ap.parse_args()

    if args.check:
        count, problems = validate(args.dest)
        print(f'skills = {count}')
        for p in problems:
            print(f'  PROBLEM {p}')
        return 1 if problems else 0

    applied, missing = apply_overrides(args.upstream, args.dest, args.overrides)
    count, problems = validate(args.dest)

    print(f'skills installed      = {count}')
    print(f'overrides applied     = {len(applied)}')
    for a in applied:
        print(f'    {a}')
    if missing:
        print(f'overrides NOT applied = {len(missing)}')
        for m in missing:
            print(f'    {m}')
    if problems:
        print(f'validation problems   = {len(problems)}')
        for p in problems:
            print(f'    {p}')
    else:
        print('validation            = clean')
    return 1 if (problems or missing) else 0


if __name__ == '__main__':
    sys.exit(main())
