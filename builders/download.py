"""Download, verify and extract the complete JNAIQ Builders preview."""
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import shutil
import urllib.request
import zipfile

# Immutable release coordinates keep their original repository/asset names.
# Product branding must not silently rewrite a download URL.
BASE='https://github.com/several-dozen-lizards/JNSQ-Builders/releases/download/v0.2.0-preview.1/'


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
    if any((root/name/'data').exists() for name in ('JNAIQ-Builders', 'JNSQ-Builders')):
        raise RuntimeError('This folder already contains saved builder work. Download into a new folder to preserve it.')
    extracted=manifest.get('extracted_bytes',28_000_000_000)
    if not isinstance(extracted,int) or extracted<0:raise ValueError('Invalid extracted size')
    if shutil.disk_usage(root).free<total+extracted:
        raise RuntimeError(f'Please free enough disk space for the ZIPs plus {extracted/1e9:.2f} GB extracted, then retry.')
    for item in manifest['archives']:
        name=item['name']
        if not re.fullmatch(r'(?:JNAIQ|JNSQ)-Builders-\d+\.\d+\.\d+(?:-preview\.\d+)?-[a-z]+-\d+\.zip',name):
            raise ValueError('Unexpected archive name')
        url=item.get('url',BASE+name)
        if not re.fullmatch(r'https://github\.com/several-dozen-lizards/JNSQ-Builders/releases/download/v\d+\.\d+\.\d+-preview(?:\.\d+)?/'+re.escape(name),url):
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
            destinations=[]
            for member in archive.infolist():
                relative=PurePosixPath(member.filename)
                if ('\\' in member.filename or ':' in member.filename or relative.is_absolute()
                        or '..' in relative.parts or not relative.parts
                        or relative.parts[0] not in {'JNAIQ-Builders','JNSQ-Builders'}
                        or (member.external_attr >> 16) & 0o170000 == 0o120000):
                    raise ValueError('Unsafe archive path')
                destination=(root/'JNAIQ-Builders').joinpath(*relative.parts[1:]).resolve()
                if not destination.is_relative_to((root/'JNAIQ-Builders').resolve()):
                    raise ValueError('Unsafe archive path')
                destinations.append((member,destination))
            for member,destination in destinations:
                if member.is_dir():
                    destination.mkdir(parents=True,exist_ok=True)
                else:
                    destination.parent.mkdir(parents=True,exist_ok=True)
                    with archive.open(member) as source,destination.open('wb') as out:
                        shutil.copyfileobj(source,out)
    print('\nReady. Open JNAIQ-Builders, run INSTALL_BUILDERS.bat, then START_BUILDERS.bat.\nAfter installation you may delete download-cache to reclaim disk space.',flush=True)


if __name__=='__main__':
    try:main()
    except Exception as error:
        print('\nCould not finish: '+str(error));raise SystemExit(1)
