"""Run both editors from an isolated JNSQ Builders installation."""
from __future__ import annotations
import argparse
import json
import os
from pathlib import Path
import socket
import threading
import webbrowser

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.trustedhost import TrustedHostMiddleware

ROOT = Path(__file__).resolve().parents[1]


def create_app(root=ROOT, *, data_root=None):
    root = Path(root).resolve()
    # A marker is required: never run this service against the live workshop.
    if not (root / 'BUILDERS.json').is_file():
        raise RuntimeError('Build or extract JNSQ Builders first; do not run it in the household workspace.')
    data = Path(data_root).resolve() if data_root else root / 'data'
    if not data.is_relative_to(root):
        raise ValueError('Builder data must stay inside its installation.')
    data.mkdir(exist_ok=True)
    candidates = root / 'scratch/body_candidates'
    recipes = data / 'designs'
    objects = root / 'godot-room/assets/objects'
    os.environ['JNSQ_OBJECT_ASSETS'] = str(objects)
    os.environ['JNSQ_AVATAR_LIBRARY'] = str(data / 'avatar_library')
    os.environ['JNSQ_ROOM_DRAFTS'] = str(data / 'room_layouts')
    app = FastAPI(title='JNSQ Builders', docs_url=None, redoc_url=None)
    app.state.rooms = {}
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=['127.0.0.1', 'localhost', 'testserver'])

    @app.middleware('http')
    async def local_browser(request, call_next):
        origin = request.headers.get('origin')
        if request.method not in {'GET', 'HEAD', 'OPTIONS'} and origin and origin != str(request.base_url).rstrip('/'):
            return JSONResponse({'error': 'Use the local builder window.'}, status_code=403)
        response = await call_next(request)
        response.headers['Cross-Origin-Opener-Policy'] = 'same-origin'
        response.headers['Cross-Origin-Embedder-Policy'] = 'require-corp'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        return response

    from core.body_packages import BodyPackageError
    from core.body_candidates import (CandidateStager, list_candidates, load_candidate,
        candidate_model_path, save_candidate_mapping, append_preview_receipt)
    from core.body_recipes import list_recipes, load_recipe, save_recipe, PILOT_TARGET
    from room.avatar_library_routes import install as avatars
    from room.island_workshop import install as islands
    avatars(app, root, lambda: str(candidates), standalone=True)
    islands(app, root, data / 'islands', standalone=True)

    def guarded(fn, status=422):
        try:
            return fn()
        except (BodyPackageError, ValueError, TypeError, KeyError) as exc:
            return JSONResponse({'error': str(exc)}, status_code=status)

    @app.get('/api/builders-health')
    def health():
        return {'application': 'jnsq-builders', 'root': str(root), 'version': '0.1.0', 'standalone': True}

    @app.get('/', response_class=HTMLResponse)
    def home():
        return (root / 'builders/home.html').read_text(encoding='utf-8')

    @app.get('/body-workshop')
    def avatar_page():
        return FileResponse(root / 'room/body_workshop.html', media_type='text/html')

    @app.get('/api/avatar-bodies')
    def bodies():
        return {'assignments': [], 'assets': [], 'candidate_policy': {'pilot_target': PILOT_TARGET}}

    @app.get('/api/avatar-bodies/candidates')
    def candidate_list():
        return {'candidates': list_candidates(str(candidates), PILOT_TARGET)}

    @app.post('/api/avatar-bodies/candidates')
    async def upload(request: Request, filename: str):
        stager = CandidateStager(str(candidates), filename, PILOT_TARGET)
        try:
            async for block in request.stream():
                stager.write(block)
            return stager.finalize()
        except Exception as exc:
            stager.abort()
            if isinstance(exc, BodyPackageError):
                return JSONResponse({'error': str(exc)}, status_code=422)
            raise

    @app.get('/api/avatar-bodies/candidates/{key}/mapping')
    def mapping(key: str):
        return guarded(lambda: load_candidate(str(candidates), key, PILOT_TARGET), 404)

    @app.post('/api/avatar-bodies/candidates/{key}/mapping')
    async def map_save(key: str, request: Request):
        payload = await request.json()
        return guarded(lambda: save_candidate_mapping(str(candidates), key, PILOT_TARGET, payload))

    @app.get('/api/avatar-bodies/candidates/{key}/model')
    def model(key: str, compact: bool = False):
        def serve():
            path = Path(candidate_model_path(str(candidates), key, PILOT_TARGET))
            if compact:
                for name in ('preview-compact-v2.glb', 'preview-compact-v1.glb'):
                    packed = path.with_name(name)
                    if packed.is_file() and packed.stat().st_mtime >= path.stat().st_mtime:
                        path = packed
                        break
            return FileResponse(path, media_type='model/gltf-binary')
        return guarded(serve, 404)

    @app.post('/api/avatar-bodies/candidates/{key}/preview-receipts')
    async def preview(key: str, request: Request):
        payload = await request.json()
        return guarded(lambda: append_preview_receipt(str(candidates), key, PILOT_TARGET, payload))

    @app.get('/api/avatar-bodies/builder/recipes')
    def designs():
        return {'recipes': list_recipes(str(recipes))}

    @app.get('/api/avatar-bodies/builder/recipes/{key}')
    def design(key: str):
        return guarded(lambda: load_recipe(str(recipes), key), 404)

    @app.post('/api/avatar-bodies/builder/recipes')
    async def new_design(request: Request):
        payload = await request.json()
        return guarded(lambda: save_recipe(str(recipes), payload))

    @app.put('/api/avatar-bodies/builder/recipes/{key}')
    async def update_design(key: str, request: Request):
        payload = await request.json()
        return guarded(lambda: save_recipe(str(recipes), payload, key))

    from room.local_weather import LocalWeather
    weather = LocalWeather(str(data / 'weather.json'), str(data / 'tuning.json'))
    weather_lock = threading.Lock()

    @app.get('/weather-sync')
    def weather_read():
        with weather_lock:
            return weather.refresh() if weather.due() else weather.public_status()

    @app.post('/weather-sync')
    def weather_config(payload: dict):
        with weather_lock:
            return guarded(lambda: weather.configure(**payload))

    @app.post('/weather-sync/refresh')
    def weather_refresh():
        with weather_lock:
            return guarded(weather.refresh)

    # Household publication is deliberately not installed in this application.
    @app.get('/api/world-destinations')
    def destinations():
        return {'destinations': []}

    @app.get('/jnsq')
    def back():
        return RedirectResponse('/')

    import mimetypes
    mimetypes.add_type('application/wasm', '.wasm')
    mimetypes.add_type('text/javascript', '.mjs')
    app.mount('/3d/designer', StaticFiles(directory=root / 'godot-room/export/web/designer', html=True))
    app.mount('/assets/island-workshop', StaticFiles(directory=root / 'assets/jnsq/island-workshop', html=True))
    app.mount('/builders', StaticFiles(directory=root / 'builders'))
    app.mount('/models', StaticFiles(directory=objects))
    thumbs = objects / '.thumbnails'
    thumbs.mkdir(exist_ok=True)
    app.mount('/model-thumbnails', StaticFiles(directory=thumbs))
    return app


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--editor', choices=['home', 'avatar', 'world'], default='home')
    parser.add_argument('--port', type=int, default=61420)
    parser.add_argument('--no-browser', action='store_true')
    args = parser.parse_args()
    path = {'home': '/', 'avatar': '/body-workshop', 'world': '/island-workshop'}[args.editor]
    import httpx
    import uvicorn
    marker = ROOT / 'data/server.json'
    ports = [args.port]
    try:
        ports.append(json.loads(marker.read_text())['port'])
    except (OSError, ValueError, KeyError):
        pass
    for port in dict.fromkeys(ports):
        try:
            info = httpx.get(f'http://127.0.0.1:{port}/api/builders-health', timeout=1, trust_env=False).json()
            if info.get('application') == 'jnsq-builders' and info.get('root') == str(ROOT):
                if not args.no_browser:
                    webbrowser.open(f'http://127.0.0.1:{port}{path}')
                print('Using the running JNSQ Builders window.')
                return
        except (httpx.HTTPError, ValueError):
            pass
    listener = socket.socket()
    try:
        listener.bind(('127.0.0.1', args.port))
    except OSError:
        listener.close()
        listener = socket.socket()
        listener.bind(('127.0.0.1', 0))
    port = listener.getsockname()[1]
    app = create_app()

    class Server(uvicorn.Server):
        async def startup(self, sockets=None):
            await super().startup(sockets)
            if self.started:
                marker.write_text(json.dumps({'port': port, 'pid': os.getpid()}))
                url = f'http://127.0.0.1:{port}{path}'
                print(f'JNSQ Builders: {url}\nKeep this window open. Ctrl+C stops the editors.', flush=True)
                if not args.no_browser:
                    webbrowser.open(url)

    with listener:
        Server(uvicorn.Config(app, host='127.0.0.1', port=port)).run(sockets=[listener])


if __name__ == '__main__':
    main()
