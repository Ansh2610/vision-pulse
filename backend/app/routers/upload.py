import os
import time
import uuid
import magic
from pathlib import Path
from fastapi import APIRouter, UploadFile, HTTPException, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from app.utils.session_manager import session_manager
from app.config.security import (
    MAX_UPLOAD_SIZE_MB, 
    UPLOAD_RATE_LIMIT, 
    ALLOWED_MIME_TYPES
)

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)

MAX_SIZE = MAX_UPLOAD_SIZE_MB * 1024 * 1024  # Convert MB to bytes
ALLOWED_TYPES = set(ALLOWED_MIME_TYPES)

# cross-platform temp dir
import tempfile
UPLOAD_DIR = Path(tempfile.gettempdir()) / "visionpulse_uploads"

UPLOAD_DIR.mkdir(exist_ok=True, parents=True)

@router.post("/upload")
@limiter.limit(UPLOAD_RATE_LIMIT)
async def upload_image(request: Request, file: UploadFile, session_id: str = None):
    """
    Upload an image. Returns session_id for tracking.
    Validates: size, MIME type, session limits.
    Security: Rate limited + session upload caps.
    """
    
    # size check
    contents = await file.read()
    if len(contents) > MAX_SIZE:
        raise HTTPException(400, f"File too large. Max {MAX_SIZE} bytes")
    
    # MIME check
    mime = magic.from_buffer(contents, mime=True)
    if mime not in ALLOWED_TYPES:
        raise HTTPException(400, f"Invalid file type: {mime}")
    
    # Generate or reuse session ID
    if not session_id:
        session_id = str(uuid.uuid4())
    
    # Check session limits
    allowed, reason = session_manager.can_upload(session_id)
    if not allowed:
        raise HTTPException(429, reason)
    
    # Save with unique filename: session_id + timestamp
    ext = file.filename.split(".")[-1] if "." in file.filename else "jpg"
    timestamp = int(time.time() * 1000)
    image_id = f"{session_id}_{timestamp}"
    filepath = UPLOAD_DIR / f"{image_id}.{ext}"
    
    # Ensure directory exists
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    
    with open(filepath, "wb") as f:
        f.write(contents)
    
    # Verify file was written
    if not filepath.exists():
        raise HTTPException(500, "Failed to save file")
    
    print(f"[UPLOAD] Saved {filepath.name} ({len(contents)} bytes) - exists: {filepath.exists()}")
    
    # Increment session counter
    session_manager.increment(session_id)
    
    return {
        "session_id": session_id,
        "image_id": image_id,  # Return the unique image ID
        "filename": file.filename,
        "size": len(contents),
        "mime": mime,
        "session_upload_count": session_manager.get_count(session_id)
    }
