"""Generated catalog helpers only; no household server."""
import os
from pathlib import Path
REPO=str(Path(__file__).resolve().parents[1])
OBJECT_CATALOG_CATEGORIES={"seating","beds","surfaces","pictures","misc"}

def _object_asset_root():
    return os.environ.get(
        "JNSQ_OBJECT_ASSETS",
        os.path.join(REPO, "godot-room", "assets", "objects"))

def _object_thumbnail_root():
    return os.path.join(_object_asset_root(), ".thumbnails")

def _catalog_category(stem: str, detail: dict) -> str:
    metadata = detail.get("metadata") if isinstance(detail, dict) else {}
    metadata = metadata if isinstance(metadata, dict) else {}
    explicit = str(metadata.get("category", "")).strip().lower()
    if explicit in OBJECT_CATALOG_CATEGORIES:
        return explicit
    folded = stem.lower().replace("-", "_")
    if any(word in folded for word in (
            "chair", "couch", "sofa", "bench", "stool", "seat")):
        return "seating"
    if "bed" in folded:
        return "beds"
    if any(word in folded for word in (
            "desk", "table", "shelf", "cabinet", "counter",
            "nightstand", "surface")):
        return "surfaces"
    if (detail.get("format") in {"png", "jpg", "jpeg"}
            or any(word in folded for word in (
                "poster", "picture", "painting", "portrait", "frame"))):
        return "pictures"
    return "misc"

def _catalog_item(stem: str, detail: dict) -> dict:
    metadata = detail.get("metadata") if isinstance(detail, dict) else {}
    metadata = metadata if isinstance(metadata, dict) else {}
    category = _catalog_category(stem, detail)
    default_sizes = {
        "seating": 1.6, "beds": 2.0, "surfaces": 1.4,
        "pictures": 1.0, "misc": 0.8,
    }
    try:
        size = float(metadata.get("default_size_m", default_sizes[category]))
    except (TypeError, ValueError):
        size = default_sizes[category]
    display = str(metadata.get("display_name", "")).strip()
    if not display:
        display = stem.replace("_", " ").replace("-", " ").title()
    image_format = detail.get("format") in {"png", "jpg", "jpeg"}
    thumbnail_path = os.path.join(_object_thumbnail_root(), stem + ".png")
    thumbnail_ready = image_format or os.path.isfile(thumbnail_path)
    thumbnail_url = ("/models/" + str(detail.get("filename", ""))
                     if image_format else
                     "/model-thumbnails/" + stem + ".png")
    return {
        "kind": stem,
        "filename": detail.get("filename", ""),
        "display_name": display,
        "category": category,
        "format": detail.get("format", ""),
        "bytes": int(detail.get("bytes", 0)),
        "packaged": bool(detail.get("packaged", False)),
        "size_m": max(0.02, min(6.0, size)),
        "capability": metadata.get("capability")
        or metadata.get("jnsq_capability"),
        "thumbnail_url": thumbnail_url,
        "thumbnail_ready": thumbnail_ready,
    }
