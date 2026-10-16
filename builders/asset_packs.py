"""Select, verify and install optional immutable asset packs without user state.

Run --list first for measured sizes. A destination must be given explicitly.
This installs models only; it neither starts an app nor changes saved designs.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import tempfile
import urllib.parse
import urllib.request
import zipfile

TIERS = ('compact', 'standard', 'high')


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(4 * 1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def safe_target(value):
    pure = PurePosixPath(value)
    if '\\' in value or ':' in value or pure.is_absolute() or '..' in pure.parts:
        raise ValueError('Unsafe asset target')
    if not (value.startswith('assets/avatar-starters/') or value.startswith('godot-room/assets/objects/')):
        raise ValueError('Asset target is outside immutable library roots')
    if pure.suffix != '.glb' or any(part.startswith('.') for part in pure.parts):
        raise ValueError('Only named GLB assets may be installed')
    return Path(*pure.parts)


def select(manifest, tier='standard', collections=None, assets=None):
    if manifest.get('schema') != 'jnaiq-asset-packs/1' or tier not in TIERS:
        raise ValueError('Unsupported catalog or quality tier')
    all_assets = manifest['assets']
    if len({a['id'] for a in all_assets}) != len(all_assets):
        raise ValueError('Duplicate asset IDs')
    collections, assets = set(collections or []), set(assets or [])
    if collections - {a['collection'] for a in all_assets} or assets - {a['id'] for a in all_assets}:
        raise ValueError('Unknown collection or asset')
    selected = [a for a in all_assets if not (collections or assets) or a['collection'] in collections or a['id'] in assets]
    targets = [safe_target(a['target']).as_posix().casefold() for a in selected]
    if len(set(targets)) != len(targets):
        raise ValueError('Duplicate installation targets')
    archives = {}
    for asset in selected:
        variant = asset['variants'][tier]
        key = variant['archive']
        archive = manifest['archives'][key]
        if not re.fullmatch('[a-f0-9]{64}', key) or archive['file'] != key + '.zip':
            raise ValueError('Invalid content-addressed archive')
        if variant['sha256'] != key or variant['bytes'] != archive['unpacked_bytes']:
            raise ValueError('Inconsistent asset manifest')
        if any(not isinstance(archive[n], int) or archive[n] <= 0 for n in ['bytes', 'unpacked_bytes']):
            raise ValueError('Invalid asset size')
        if not re.fullmatch('[a-f0-9]{64}', archive['sha256']):
            raise ValueError('Invalid archive checksum')
        archives[key] = archive
    return selected, archives


def fetch(source, destination):
    parsed = urllib.parse.urlparse(str(source))
    if parsed.scheme in {'https', 'http'}:
        if parsed.scheme == 'http' and parsed.hostname not in {'127.0.0.1', 'localhost', '::1'}:
            raise ValueError('Remote asset downloads require HTTPS')
        with urllib.request.urlopen(str(source), timeout=120) as response, destination.open('wb') as out:
            shutil.copyfileobj(response, out, 4 * 1024 * 1024)
    else:
        shutil.copyfile(source, destination)


def install(manifest, base, destination, tier='standard', collections=None, assets=None):
    selected, archives = select(manifest, tier, collections, assets)
    destination = destination.resolve()
    destination.mkdir(parents=True, exist_ok=True)
    lock = destination / '.asset-install.lock'
    # Concurrent installs must not race receipts or rollbacks.
    with lock.open('x'):
        pass
    try:
        receipt_path = destination / '.asset-library.json'
        previous = json.loads(receipt_path.read_text()) if receipt_path.exists() else {'assets': {}}
        previous_raw = receipt_path.read_bytes() if receipt_path.exists() else None
        pending = []
        for asset in selected:
            target = (destination / safe_target(asset['target'])).resolve()
            if not target.is_relative_to(destination):
                raise ValueError('Asset target resolves outside installation')
            variant = asset['variants'][tier]
            old = previous['assets'].get(asset['id'], {})
            if target.exists():
                current = digest(target)
                if current == variant['sha256']:
                    continue
                if old.get('target') != asset['target'] or current != old.get('sha256'):
                    raise ValueError('Locally modified or unowned asset would be overwritten: ' + asset['id'])
            pending.append((asset, variant, target))
        needed = {v['archive'] for _, v, _ in pending}
        cache = destination / '.asset-download-cache'
        cache.mkdir(exist_ok=True)
        required = sum(archives[key]['bytes'] + archives[key]['unpacked_bytes'] for key in needed)
        required += sum(p.stat().st_size for _, _, p in pending if p.exists())
        if shutil.disk_usage(destination).free < required:
            raise OSError('Not enough free space for download, staging and rollback')
        with tempfile.TemporaryDirectory(prefix='.asset-stage-', dir=destination) as temp:
            stage = Path(temp)
            for key in sorted(needed):
                entry, cached = archives[key], cache / (key + '.zip')
                if not cached.exists() or cached.stat().st_size != entry['bytes'] or digest(cached) != entry['sha256']:
                    source = (urllib.parse.urljoin(str(base).rstrip('/') + '/', entry['file'])
                              if str(base).startswith(('https://', 'http://')) else Path(base) / entry['file'])
                    partial = cached.with_suffix('.partial')
                    fetch(source, partial)
                    if partial.stat().st_size != entry['bytes'] or digest(partial) != entry['sha256']:
                        raise ValueError('Asset download hash/size mismatch')
                    partial.replace(cached)
                with zipfile.ZipFile(cached) as bundle:
                    if bundle.namelist() != ['asset.glb', 'CREDITS.json'] or bundle.getinfo('asset.glb').file_size != entry['unpacked_bytes']:
                        raise ValueError('Unexpected asset archive contents')
                    unpacked = stage / (key + '.glb')
                    with bundle.open('asset.glb') as src, unpacked.open('wb') as out:
                        shutil.copyfileobj(src, out)
                    if digest(unpacked) != key:
                        raise ValueError('Unpacked asset hash mismatch')
            replacements = []
            try:
                for index, (asset, variant, target) in enumerate(pending):
                    target.parent.mkdir(parents=True, exist_ok=True)
                    backup = stage / f'backup-{index}'
                    if target.exists():
                        shutil.copy2(target, backup)
                    replacements.append((target, backup))
                    ready = stage / f'ready-{index}'
                    shutil.copyfile(stage / (variant['archive'] + '.glb'), ready)
                    os.replace(ready, target)
                updated = {'version': manifest['version'], 'assets': dict(previous['assets'])}
                for asset in selected:
                    variant = asset['variants'][tier]
                    updated['assets'][asset['id']] = {'target': asset['target'], 'sha256': variant['sha256'],
                                                     'tier': tier, 'credits': asset['credits']}
                ready = stage / 'receipt.json'
                ready.write_text(json.dumps(updated, indent=2) + '\n', encoding='utf-8')
                os.replace(ready, receipt_path)
            except BaseException:
                for target, backup in reversed(replacements):
                    if backup.exists():
                        os.replace(backup, target)
                    else:
                        target.unlink(missing_ok=True)
                if previous_raw is not None:
                    receipt_path.write_bytes(previous_raw)
                else:
                    receipt_path.unlink(missing_ok=True)
                raise
        return {'selected': len(selected), 'installed': len(pending), 'reused': len(selected) - len(pending), 'tier': tier}
    finally:
        lock.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--catalog', required=True, type=Path)
    parser.add_argument('--base-url', help='Optional HTTPS pack location; defaults to the catalog folder')
    parser.add_argument('--tier', choices=TIERS, default='standard')
    parser.add_argument('--collection', action='append')
    parser.add_argument('--asset', action='append')
    parser.add_argument('--list', action='store_true')
    parser.add_argument('--destination', type=Path)
    args = parser.parse_args()
    manifest = json.loads(args.catalog.read_text(encoding='utf-8'))
    selected, archives = select(manifest, args.tier, args.collection, args.asset)
    if args.list:
        print(json.dumps({'tier': args.tier, 'assets': [a['id'] for a in selected],
                          'download_bytes': sum(a['bytes'] for a in archives.values()),
                          'installed_bytes': sum(a['variants'][args.tier]['bytes'] for a in selected)}, indent=2))
    elif args.destination:
        print(json.dumps(install(manifest, args.base_url or args.catalog.parent, args.destination,
                                 args.tier, args.collection, args.asset), indent=2))
    else:
        parser.error('Use --list or provide --destination')


if __name__ == '__main__':
    main()
