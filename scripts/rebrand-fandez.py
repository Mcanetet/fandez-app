#!/usr/bin/env python3
"""Rebrand Fundez → Fandez in text files and rename matching paths."""
from __future__ import annotations

import os
import shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIRS = {
    '.git', 'node_modules', 'tmp', 'playwright-report', 'test-results',
    'blob-report', '.preview', 'data'
}
SKIP_EXT = {
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf', '.woff', '.woff2',
    '.ttf', '.eot', '.zip', '.mp4', '.mov', '.sqlite', '.db'
}

def should_skip_dir(name: str) -> bool:
    return name in SKIP_DIRS or name.startswith('.')

def replace_text(s: str) -> str:
    return (
        s.replace('Fundez', 'Fandez')
         .replace('FUNDEZ', 'FANDEZ')
         .replace('fundez', 'fandez')
    )

changed_files = 0
renames = []

for dirpath, dirnames, filenames in os.walk(ROOT):
    dirnames[:] = [d for d in dirnames if not should_skip_dir(d)]
    rel_dir = os.path.relpath(dirpath, ROOT)
    if rel_dir.startswith('tmp'):
        continue
    for name in filenames:
        src = os.path.join(dirpath, name)
        ext = os.path.splitext(name)[1].lower()
        new_name = replace_text(name)
        dest = os.path.join(dirpath, new_name)

        if ext not in SKIP_EXT:
            try:
                with open(src, 'r', encoding='utf-8') as f:
                    original = f.read()
            except (UnicodeDecodeError, OSError):
                original = None
            if original is not None:
                updated = replace_text(original)
                if updated != original:
                    with open(src, 'w', encoding='utf-8') as f:
                        f.write(updated)
                    changed_files += 1

        if new_name != name:
            renames.append((src, dest))

for src, dest in sorted(renames, key=lambda p: len(p[0]), reverse=True):
    if os.path.exists(src) and src != dest:
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        shutil.move(src, dest)
        print(f'rename {os.path.relpath(src, ROOT)} -> {os.path.relpath(dest, ROOT)}')

print(f'updated_files={changed_files} renames={len(renames)}')
