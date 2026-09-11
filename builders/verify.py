"""Verify the extracted release files before starting the editors."""
import hashlib
import json
from pathlib import Path


def verify(root, hashes=True):
    root = Path(root).resolve()
    manifest = json.loads((root / 'BUILDERS_MANIFEST.json').read_text(encoding='utf-8'))
    failures = []
    for entry in manifest['files']:
        path = (root / entry['path']).resolve()
        if not path.is_relative_to(root) or not path.is_file():
            failures.append(entry['path'] + ': missing or outside package')
            continue
        if path.stat().st_size != entry['bytes']:
            failures.append(entry['path'] + ': size differs')
            continue
        if hashes:
            digest = hashlib.sha256()
            with path.open('rb') as stream:
                for block in iter(lambda: stream.read(8*1024*1024), b''):
                    digest.update(block)
            if digest.hexdigest() != entry['sha256']:
                failures.append(entry['path'] + ': hash differs')
    return failures


if __name__ == '__main__':
    print('Checking bundle files. Large asset packs can take a few minutes.', flush=True)
    failures = verify(Path(__file__).resolve().parents[1])
    if failures:
        print('\n'.join(failures[:30]))
        raise SystemExit(1)
    print('All bundled files verified.')
