import fastapi.templating
print("fastapi.templating imported successfully")

# import sys
# import os

# # 将错误输出重定向到文件（用于调试打包后闪退）
# log_path = os.path.join(os.path.dirname(sys.executable) if getattr(sys, 'frozen', False) else os.getcwd(), 'error.log')
# log_file = open(log_path, 'w', encoding='utf-8')
# #sys.stderr = log_file

"""
LAN File Transfer - Server
A local-network cross-device file transfer application.
Phase 1: Core skeleton - Upload, Download, Text sharing endpoints.
Phase 2: QR Code generation & Room connection info.
"""

import os
import sys

# 添加这段代码，用于 PyInstaller 打包后正确读取模板文件
def resource_path(relative_path):
    """获取资源的绝对路径，兼容开发环境和 PyInstaller 打包后的环境"""
    if hasattr(sys, '_MEIPASS'):
        # 如果是打包后的环境，返回临时解压目录里的路径
        return os.path.join(sys._MEIPASS, relative_path)
    # 如果是开发环境，返回当前目录下的路径
    return os.path.join(os.path.abspath("."), relative_path)

# 然后修改 Jinja2 模板的加载方式（找到你代码里初始化 templates 的地方）
# 原来是：templates = Jinja2Templates(directory="templates")
# 改成：
templates = fastapi.templating.Jinja2Templates(directory=resource_path("templates"))
# 同时确保 static 文件夹的挂载也要改成 resource_path("static")，如果你是用 app.mount 挂载的话
import io
import uuid
import json
import secrets
import string
import mimetypes
import socket
from pathlib import Path
from datetime import datetime

# Fix Windows console encoding for emoji support
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from fastapi import FastAPI, File, UploadFile, Request, HTTPException
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, StreamingResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
#from fastapi.templating import Jinja2Templates
import qrcode
import uvicorn

# --- Configuration ---
BASE_DIR = Path(__file__).resolve().parent
UPLOADS_DIR = BASE_DIR / "uploads"
DATA_DIR = BASE_DIR / "data"
STATIC_DIR = BASE_DIR / "static"
TEMPLATES_DIR = BASE_DIR / "templates"

# Ensure data directories exist
DATA_DIR.mkdir(parents=True, exist_ok=True)

# --- Room ID Generation ---
def generate_room_id(length: int = 6) -> str:
    """Generate a random alphanumeric Room ID."""
    alphabet = string.ascii_uppercase + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))


def generate_pin(length: int = 4) -> str:
    """Generate a random numeric PIN for secondary verification."""
    return ''.join(secrets.choice(string.digits) for _ in range(length))

ROOM_ID = generate_room_id()
PIN_CODE = generate_pin()
PIN_ENABLED = False  # Toggled via API
ROOM_DIR = UPLOADS_DIR / ROOM_ID
TEXTS_FILE = DATA_DIR / "texts.json"
PUSH_FILE = DATA_DIR / "pushes.json"

# Ensure room upload directory exists
ROOM_DIR.mkdir(parents=True, exist_ok=True)


# --- Network Helpers ---
def get_local_ip() -> str:
    """Get the local network IP address."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.1)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        # Fallback: try hostname resolution
        try:
            return socket.gethostbyname(socket.gethostname())
        except Exception:
            return "127.0.0.1"

LOCAL_IP = get_local_ip()
PORT = 8000
BASE_URL = f"http://{LOCAL_IP}:{PORT}"

# --- App Setup ---
app = FastAPI(title="LAN File Transfer", version="1.0.0")

# Mount static files
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

# Templates
templates = fastapi.templating.Jinja2Templates(directory=str(TEMPLATES_DIR))


# --- Text Store Helpers ---
def load_texts() -> list[dict]:
    """Load text/links from the room's texts.json file."""
    if not TEXTS_FILE.exists():
        return []
    try:
        with open(TEXTS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return []


def save_texts(texts: list[dict]) -> None:
    """Save text/links to the room's texts.json file."""
    with open(TEXTS_FILE, "w", encoding="utf-8") as f:
        json.dump(texts, f, ensure_ascii=False, indent=2)


# --- API Endpoints ---

# Root-level API (no room_id in path — uses current ROOM_ID)
@app.get("/api/room-info")
async def room_info_root():
    """Return room and connection information (PIN hidden unless verified)."""
    return {
        "room_id": ROOM_ID,
        "status": "active",
        "local_ip": LOCAL_IP,
        "port": PORT,
        "url": f"{BASE_URL}/{ROOM_ID}",
        "pin_enabled": PIN_ENABLED,
        "pin_code": PIN_CODE if PIN_ENABLED else None,
    }


@app.post("/api/toggle-pin")
async def toggle_pin(request: Request):
    """Enable or disable PIN protection."""
    global PIN_ENABLED, PIN_CODE
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    enabled = data.get("enabled", False)
    if enabled and not PIN_CODE:
        PIN_CODE = generate_pin()
    PIN_ENABLED = bool(enabled)
    return {
        "pin_enabled": PIN_ENABLED,
        "pin_code": PIN_CODE if PIN_ENABLED else None,
        "message": f"PIN protection {'enabled' if PIN_ENABLED else 'disabled'}",
    }


@app.post("/api/verify-pin")
async def verify_pin(request: Request):
    """Verify the PIN code for secondary authentication.
    If pin is empty string, returns the pin (for the PC-side reveal button).
    If pin is provided but wrong, returns 403.
    If pin matches, returns verified + pin."""
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    pin = data.get("pin", "").strip()
    # Empty pin = reveal request (from the PC host itself — trusted on LAN)
    if not pin:
        return {"verified": True, "pin": PIN_CODE, "message": "PIN revealed (host)"}
    if pin == PIN_CODE:
        return {"verified": True, "pin": PIN_CODE, "message": "PIN verified"}
    raise HTTPException(status_code=403, detail="Invalid PIN")


@app.get("/api/qrcode")
async def get_qrcode_root(size: int = 8):
    """Generate and return a QR code PNG image for the room URL."""
    url = f"{BASE_URL}/{ROOM_ID}"
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=size,
        border=2,
    )
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return StreamingResponse(buf, media_type="image/png")


# --- Room ID validation helper ---
def _require_room(room_id: str) -> None:
    """Raise 404 if room_id doesn't match the active room."""
    if room_id != ROOM_ID:
        raise HTTPException(status_code=404, detail="Room not found")


# --- Redirect root API to room-scoped (or handle directly) ---
# For convenience, root-level /api/* endpoints work without specifying room_id.
# They operate on the current active ROOM_ID.


@app.post("/api/upload/file")
async def upload_file_root(file: UploadFile = File(...)):
    """Upload a file (root API)."""
    return await _upload_file_impl(ROOM_ID, file)


@app.get("/api/files")
async def list_files_root():
    """List all uploaded files (root API)."""
    return _list_files_impl(ROOM_ID)


@app.get("/api/download/{filename:path}")
async def download_file_root(filename: str):
    """Download a file (root API)."""
    return _download_file_impl(ROOM_ID, filename)


@app.delete("/api/file/{filename:path}")
async def delete_file_root(filename: str):
    """Delete a file (root API)."""
    return _delete_file_impl(ROOM_ID, filename)


@app.post("/api/upload/text")
async def upload_text_root(request: Request):
    """Upload text or link (root API)."""
    return await _upload_text_impl(ROOM_ID, request)


@app.get("/api/texts")
async def list_texts_root():
    """List all texts (root API)."""
    return _list_texts_impl(ROOM_ID)


@app.delete("/api/text/{text_id}")
async def delete_text_root(text_id: str):
    """Delete a text (root API)."""
    return _delete_text_impl(ROOM_ID, text_id)


# --- Implementation functions (shared between root and room-scoped) ---

async def _upload_file_impl(room_id: str, file: UploadFile):
    _require_room(room_id)
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file selected")

    original_filename = file.filename
    safe_name = Path(original_filename).name

    dest_path = ROOM_DIR / safe_name
    counter = 1
    stem, suffix = os.path.splitext(safe_name)
    while dest_path.exists():
        dest_path = ROOM_DIR / f"{stem}_{counter}{suffix}"
        counter += 1

    try:
        with open(dest_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")

    size = os.path.getsize(dest_path)
    return {
        "filename": dest_path.name,
        "original_name": original_filename,
        "size": size,
        "message": "File uploaded successfully",
    }


def _list_files_impl(room_id: str):
    _require_room(room_id)
    files = []
    for entry in sorted(ROOM_DIR.iterdir(),
                        key=lambda e: e.stat().st_mtime,
                        reverse=True):
        if entry.name == "texts.json":
            continue
        if entry.is_file():
            size = entry.stat().st_size
            mime_type, _ = mimetypes.guess_type(entry.name)
            files.append({
                "filename": entry.name,
                "size": size,
                "mime_type": mime_type or "application/octet-stream",
                "modified": datetime.fromtimestamp(entry.stat().st_mtime).isoformat(),
            })
    return {"files": files}


def _download_file_impl(room_id: str, filename: str):
    _require_room(room_id)
    file_path = ROOM_DIR / filename
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    if file_path.name == "texts.json":
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(
        path=str(file_path),
        filename=file_path.name,
        media_type=mimetypes.guess_type(file_path.name)[0] or "application/octet-stream",
    )


def _delete_file_impl(room_id: str, filename: str):
    _require_room(room_id)
    file_path = ROOM_DIR / filename
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    if file_path.name == "texts.json":
        raise HTTPException(status_code=404, detail="File not found")

    os.remove(file_path)
    return {"message": f"Deleted {filename}"}


async def _upload_text_impl(room_id: str, request: Request):
    _require_room(room_id)
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    content = data.get("content", "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="Content cannot be empty")

    is_link = content.startswith(("http://", "https://"))
    entry_type = "link" if is_link else "text"

    entry = {
        "id": str(uuid.uuid4())[:8],
        "type": entry_type,
        "content": content,
        "timestamp": datetime.now().isoformat(),
    }

    texts = load_texts()
    texts.insert(0, entry)
    save_texts(texts)

    return {"entry": entry, "message": f"{entry_type.capitalize()} saved successfully"}


def _list_texts_impl(room_id: str):
    _require_room(room_id)
    return {"texts": load_texts()}


def _delete_text_impl(room_id: str, text_id: str):
    _require_room(room_id)
    texts = load_texts()
    texts = [t for t in texts if t["id"] != text_id]
    save_texts(texts)
    return {"message": f"Deleted text {text_id}"}


# --- Push History (tracks PC-to-mobile pushes) ---

def _load_pushes() -> list[dict]:
    if not PUSH_FILE.exists():
        return []
    try:
        with open(PUSH_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return []


def _save_pushes(pushes: list[dict]) -> None:
    with open(PUSH_FILE, "w", encoding="utf-8") as f:
        json.dump(pushes, f, ensure_ascii=False, indent=2)


def _add_push(item_type: str, content: str, filename: str = None, size: int = None) -> dict:
    push = {
        "id": str(uuid.uuid4())[:8],
        "type": item_type,
        "content": content,
        "filename": filename,
        "size": size,
        "timestamp": datetime.now().isoformat(),
    }
    pushes = _load_pushes()
    pushes.insert(0, push)
    _save_pushes(pushes)
    return push


@app.post("/api/push/text")
async def push_text(request: Request):
    """PC pushes a text/link to the shared room for mobile to pick up."""
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    content = data.get("content", "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="Content cannot be empty")

    is_link = content.startswith(("http://", "https://"))
    entry_type = "link" if is_link else "text"

    # Also add to texts store for unified listing
    text_entry = {
        "id": str(uuid.uuid4())[:8],
        "type": entry_type,
        "content": content,
        "timestamp": datetime.now().isoformat(),
    }
    texts = load_texts()
    texts.insert(0, text_entry)
    save_texts(texts)

    # Record in push history
    push = _add_push(entry_type, content)

    return {
        "entry": text_entry,
        "push": push,
        "message": f"Pushed {entry_type} to mobile",
    }


@app.post("/api/push/file")
async def push_file(file: UploadFile = File(...)):
    """PC pushes a file to the shared room for mobile to download."""
    # Reuse existing file upload implementation
    result = await _upload_file_impl(ROOM_ID, file)

    # Record in push history
    push = _add_push(
        "file",
        result["filename"],
        filename=result["filename"],
        size=result["size"],
    )

    result["push"] = push
    result["message"] = "Pushed file to mobile"
    return result


@app.get("/api/pushes")
async def list_pushes():
    """List all push records (PC-to-mobile history)."""
    return {"pushes": _load_pushes()}


# Room-scoped API (with room_id prefix — for multi-room future use)
@app.get("/{room_id}/api/room-info")
async def room_info(room_id: str):
    """Return room and connection information."""
    if room_id != ROOM_ID:
        raise HTTPException(status_code=404, detail="Room not found")
    return {
        "room_id": ROOM_ID,
        "status": "active",
        "local_ip": LOCAL_IP,
        "port": PORT,
        "url": f"{BASE_URL}/{ROOM_ID}",
    }


@app.get("/{room_id}/api/qrcode")
async def get_qrcode(room_id: str, size: int = 8):
    """Generate and return a QR code PNG image for the room URL."""
    if room_id != ROOM_ID:
        raise HTTPException(status_code=404, detail="Room not found")

    url = f"{BASE_URL}/{ROOM_ID}"

    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=size,
        border=2,
    )
    qr.add_data(url)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)

    return StreamingResponse(buf, media_type="image/png")


@app.post("/{room_id}/api/upload/file")
async def upload_file(room_id: str, file: UploadFile = File(...)):
    """Upload a file to the server."""
    if room_id != ROOM_ID:
        raise HTTPException(status_code=404, detail="Room not found")

    if not file.filename:
        raise HTTPException(status_code=400, detail="No file selected")

    original_filename = file.filename
    # Sanitize filename - keep original but use safe name for storage
    safe_name = Path(original_filename).name

    # If file with same name exists, add a suffix
    dest_path = ROOM_DIR / safe_name
    counter = 1
    stem, suffix = os.path.splitext(safe_name)
    while dest_path.exists():
        dest_path = ROOM_DIR / f"{stem}_{counter}{suffix}"
        counter += 1

    # Save file
    try:
        with open(dest_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")

    size = os.path.getsize(dest_path)
    return {
        "filename": dest_path.name,
        "original_name": original_filename,
        "size": size,
        "message": "File uploaded successfully",
    }


@app.get("/{room_id}/api/files")
async def list_files(room_id: str):
    """List all uploaded files."""
    if room_id != ROOM_ID:
        raise HTTPException(status_code=404, detail="Room not found")

    files = []
    for entry in sorted(ROOM_DIR.iterdir(),
                        key=lambda e: e.stat().st_mtime,
                        reverse=True):
        if entry.name == "texts.json":
            continue
        if entry.is_file():
            size = entry.stat().st_size
            mime_type, _ = mimetypes.guess_type(entry.name)
            files.append({
                "filename": entry.name,
                "size": size,
                "mime_type": mime_type or "application/octet-stream",
                "modified": datetime.fromtimestamp(entry.stat().st_mtime).isoformat(),
            })

    return {"files": files}


@app.get("/{room_id}/api/download/{filename:path}")
async def download_file(room_id: str, filename: str):
    """Download a file from the server."""
    if room_id != ROOM_ID:
        raise HTTPException(status_code=404, detail="Room not found")

    file_path = ROOM_DIR / filename
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    if file_path.name == "texts.json":
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(
        path=str(file_path),
        filename=file_path.name,
        media_type=mimetypes.guess_type(file_path.name)[0] or "application/octet-stream",
    )


@app.delete("/{room_id}/api/file/{filename:path}")
async def delete_file(room_id: str, filename: str):
    """Delete a file from the server."""
    if room_id != ROOM_ID:
        raise HTTPException(status_code=404, detail="Room not found")

    file_path = ROOM_DIR / filename
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    if file_path.name == "texts.json":
        raise HTTPException(status_code=404, detail="File not found")

    os.remove(file_path)
    return {"message": f"Deleted {filename}"}


@app.post("/{room_id}/api/upload/text")
async def upload_text(room_id: str, request: Request):
    """Upload text or link."""
    if room_id != ROOM_ID:
        raise HTTPException(status_code=404, detail="Room not found")

    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    content = data.get("content", "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="Content cannot be empty")

    # Detect if it's a link
    is_link = content.startswith(("http://", "https://"))
    entry_type = "link" if is_link else "text"

    entry = {
        "id": str(uuid.uuid4())[:8],
        "type": entry_type,
        "content": content,
        "timestamp": datetime.now().isoformat(),
    }

    texts = load_texts()
    texts.insert(0, entry)  # newest first
    save_texts(texts)

    return {"entry": entry, "message": f"{entry_type.capitalize()} saved successfully"}


@app.get("/{room_id}/api/texts")
async def list_texts(room_id: str):
    """List all texts and links."""
    if room_id != ROOM_ID:
        raise HTTPException(status_code=404, detail="Room not found")

    return {"texts": load_texts()}


@app.delete("/{room_id}/api/text/{text_id}")
async def delete_text(room_id: str, text_id: str):
    """Delete a text/link by ID."""
    if room_id != ROOM_ID:
        raise HTTPException(status_code=404, detail="Room not found")

    texts = load_texts()
    texts = [t for t in texts if t["id"] != text_id]
    save_texts(texts)

    return {"message": f"Deleted text {text_id}"}


# --- Main Page ---

@app.get("/{room_id}")
async def serve_page(room_id: str, request: Request):
    """Serve the main transfer page."""
    if room_id != ROOM_ID:
        raise HTTPException(status_code=404, detail="Room not found")

    return templates.TemplateResponse(
        request=request,
        name="index.html",
        context={
            "room_id": ROOM_ID,
            "local_ip": LOCAL_IP,
            "port": PORT,
            "url": f"{BASE_URL}/{ROOM_ID}",
        },
    )


@app.get("/")
async def root():
    """Root redirect - show a message that a room ID is needed."""
    return HTMLResponse("""
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>LAN File Transfer</title>
        <style>
            body { font-family: sans-serif; display: flex; justify-content: center;
                   align-items: center; min-height: 100vh; margin: 0; background: #f0f2f5; }
            .container { text-align: center; padding: 2rem; }
            .room-id { font-size: 3rem; font-weight: bold; letter-spacing: 0.5rem;
                       color: #1a73e8; background: #e8f0fe; padding: 1rem 2rem;
                       border-radius: 12px; margin: 1rem 0; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>📡 LAN File Transfer</h1>
            <p>Current Room ID:</p>
            <div class="room-id">""" + ROOM_ID + """</div>
            <p>Visit <code>/""" + ROOM_ID + """</code> to start transferring files.</p>
        </div>
    </body>
    </html>
    """)


# --- Startup ---
if __name__ == "__main__":
    print("=" * 50)
    print("  📡 LAN File Transfer Server")
    print("=" * 50)
    print(f"  Local IP:  {LOCAL_IP}")
    print(f"  Port:      {PORT}")
    print(f"  Room ID:   {ROOM_ID}")
    print(f"  PIN Code:  {PIN_CODE}")
    print(f"  Access:    {BASE_URL}/{ROOM_ID}")
    print("=" * 50)

    uvicorn.run(app, host="0.0.0.0", port=PORT)
