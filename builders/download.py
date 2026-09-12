"""Download, verify and extract the complete JNSQ Builders preview."""
import hashlib
import json
from pathlib import Path
import re
import shutil
import urllib.request
import zipfile

BASE='https://github.com/several-dozen-lizards/JNSQ-Builders/releases/download/v0.1.1-preview/'


def digest(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda:f.read(4*1024*1024),b''):h.update(block)
    return h.hexdigest()


def main():
    root=Path(__file__).resolve().parent
    cache=root/'download-cache';cache.mkdir(exist_ok=True)
    with urllib.request.urlopen(BASE+'DOWNLOADS.json',timeout=60) as response:
        manifest=json.load(response)
    total=sum(item['bytes'] for item in manifest['archives'])
    print(f'Complete download: {total/1e9:.1f} GB. Keep this window open.\nRerun to reuse completed downloads.',flush=True)
    if (root/'JNSQ-Builders'/'data').exists():
        raise RuntimeError('This folder already contains saved builder work. Download into a new folder to preserve it.')
    if shutil.disk_usage(root).free<total+28_000_000_000:
        raise RuntimeError('Please free enough disk space for the ZIPs plus 28 GB extracted, then retry.')
    for item in manifest['archives']:
        name=item['name']
        if not re.fullmatch(r'JNSQ-Builders-0\.1\.\d+-[a-z]+-\d+\.zip',name):
            raise ValueError('Unexpected archive name')
        url=item.get('url',BASE+name)
        if not re.fullmatch(r'https://github\.com/several-dozen-lizards/JNSQ-Builders/releases/download/v0\.1\.\d+-preview/'+re.escape(name),url):
            raise ValueError('Unexpected asset source')
        target=cache/name
        if target.exists() and target.stat().st_size==item['bytes'] and digest(target)==item['sha256']:
            print('Already verified: '+name,flush=True)
        else:
            print('Downloading '+name,flush=True)
            partial=target.with_suffix('.partial')
            with urllib.request.urlopen(url,timeout=120) as response,partial.open('wb') as out:
                shutil.copyfileobj(response,out,length=4*1024*1024)
            if partial.stat().st_size!=item['bytes'] or digest(partial)!=item['sha256']:
                raise RuntimeError('Download verification failed: '+name+'. Please rerun.')
            partial.replace(target)
        print('Extracting '+name,flush=True)
        with zipfile.ZipFile(target) as archive:
            for member in archive.infolist():
                destination=(root/member.filename).resolve()
                if not destination.is_relative_to(root/'JNSQ-Builders'):
                    raise ValueError('Unsafe archive path')
            archive.extractall(root)
    print('\nReady. Open JNSQ-Builders, run INSTALL_BUILDERS.bat, then START_BUILDERS.bat.\nAfter installation you may delete download-cache to reclaim disk space.',flush=True)


if __name__=='__main__':
    try:main()
    except Exception as error:
        print('\nCould not finish: '+str(error));raise SystemExit(1)
