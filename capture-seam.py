#!/usr/bin/env python3
"""Capture the DSH seam as `overrides/` files, from the installed plugin.

The installed plugin tree is upstream pstack prose plus hand-made DSH seam
edits. Re-running `sync-skills.py` without overrides would wipe those edits,
which is exactly how the old fork rotted. This script compares the installed
tree against the upstream release it was synced from and writes the differences
out as overrides, so a re-sync reproduces the seam instead of destroying it.

  overrides/<skill>/<path>          whole-file replacement (added or rewritten)
  overrides/<skill>/<path>.patch    unified diff (upstream file with edits)

Usage:
    python capture-seam.py --upstream <dir> --installed <dir> [--apply]
"""

import argparse
import difflib
import os
import shutil
import sys


def read_text(path):
    with open(path, 'rb') as handle:
        return handle.read().replace(b'\r\n', b'\n').decode('utf-8', 'replace')


def walk(root):
    """Every file under root, as paths relative to root."""
    found = {}
    for dirpath, _, names in os.walk(root):
        for name in names:
            full = os.path.join(dirpath, name)
            found[os.path.relpath(full, root).replace(os.sep, '/')] = full
    return found


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--upstream', required=True, help='the upstream skills/ tree this was synced from')
    parser.add_argument('--installed', required=True, help='the installed plugin skills/ tree')
    parser.add_argument('--overrides', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), 'overrides'))
    parser.add_argument('--apply', action='store_true', help='write the overrides (default: report only)')
    args = parser.parse_args()

    upstream = walk(args.upstream)
    installed = walk(args.installed)

    added, changed, removed = [], [], []
    for rel, path in sorted(installed.items()):
        upstream_path = upstream.get(rel)
        if upstream_path is None:
            added.append((rel, path))
            continue
        mine = read_text(path)
        theirs = read_text(upstream_path)
        if mine != theirs:
            changed.append((rel, path, theirs, mine))

    for rel in sorted(upstream):
        if rel not in installed:
            removed.append(rel)

    print(f'installed files        = {len(installed)}')
    print(f'upstream files         = {len(upstream)}')
    print(f'added by the port      = {len(added)}')
    print(f'changed by the port    = {len(changed)}')
    print(f'in upstream only       = {len(removed)}')

    if not args.apply:
        for rel, _ in added:
            print(f'  + {rel}')
        for rel, _, _, _ in changed:
            print(f'  ~ {rel}')
        for rel in removed:
            print(f'  - {rel}')
        print('\nre-run with --apply to write overrides/')
        return 0

    written = []
    for rel, path in added:
        target = os.path.join(args.overrides, rel)
        os.makedirs(os.path.dirname(target), exist_ok=True)
        shutil.copyfile(path, target)
        written.append(rel)

    for rel, path, theirs, mine in changed:
        # A rewritten file is stored whole; a few edited lines become a patch so
        # the override stays readable and reviewable.
        ratio = difflib.SequenceMatcher(None, theirs, mine).ratio()
        target_dir = os.path.dirname(os.path.join(args.overrides, rel))
        os.makedirs(target_dir, exist_ok=True)
        if ratio < 0.80:
            target = os.path.join(args.overrides, rel)
            shutil.copyfile(path, target)
            written.append(rel)
            continue
        diff = difflib.unified_diff(
            theirs.splitlines(keepends=True),
            mine.splitlines(keepends=True),
            fromfile=f'a/{rel}',
            tofile=f'b/{rel}',
            n=3,
        )
        target = os.path.join(args.overrides, rel + '.patch')
        with open(target, 'w', encoding='utf-8', newline='\n') as handle:
            handle.writelines(diff)
        written.append(rel + '.patch')

    print(f'\noverrides written      = {len(written)}')
    for rel in written:
        print(f'  {rel}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
