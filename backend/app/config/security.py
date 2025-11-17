"""
Security configuration for VisionPulse API.
Adjust these values based on your deployment environment.
"""

# File Upload Limits
MAX_UPLOAD_SIZE_MB = 10  # Maximum file size in MB
MAX_IMAGES_PER_SESSION = 20  # Maximum images per session (prevents single user from uploading 1000 images)
SESSION_TTL_MINUTES = 60  # How long to track sessions (after this, limits reset)

# Rate Limiting (requests per minute per IP)
UPLOAD_RATE_LIMIT = "10/minute"  # Upload endpoint rate limit
INFERENCE_RATE_LIMIT = "20/minute"  # Inference endpoint (more lenient since uploads already limited)
EXPORT_RATE_LIMIT = "30/minute"  # Export endpoint (less CPU intensive)

# File Cleanup
FILE_TTL_MINUTES = 60  # Auto-delete uploaded files after this time
CLEANUP_INTERVAL_MINUTES = 10  # How often to run cleanup task

# Allowed file types
ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"]

# YOLO Inference
YOLO_CONFIDENCE_THRESHOLD = 0.25  # Minimum confidence for detections
YOLO_INFERENCE_TIMEOUT_SECONDS = 30  # Maximum time allowed for inference (increased for cold starts)

# Notes:
# - For production, consider using Redis for distributed rate limiting
# - Render free tier = CPU only, so keep inference limits reasonable
# - Adjust MAX_IMAGES_PER_SESSION based on your use case (20 is good for demos)
