"""
Pydantic schemas for ground truth validation.
Provides strict validation for user-provided annotations.
"""
from typing import Optional, Literal
from pydantic import BaseModel, Field, validator
from datetime import datetime


class BoxValidation(BaseModel):
    """
    User validation of a single bounding box.
    
    Security: All fields validated by Pydantic type system.
    """
    box_id: str = Field(..., min_length=1, max_length=100, description="Unique box identifier")
    is_correct: bool = Field(..., description="True if box is a true positive, False if false positive")
    confidence_override: Optional[float] = Field(None, ge=0.0, le=1.0, description="User-adjusted confidence")
    notes: Optional[str] = Field(None, max_length=500, description="Optional annotation notes")
    
    @validator('notes')
    def sanitize_notes(cls, v):
        """Remove potential XSS/injection attacks"""
        if v is None:
            return v
        # Strip dangerous characters
        dangerous_chars = ['<', '>', '"', "'", '\\', '/', '&']
        for char in dangerous_chars:
            v = v.replace(char, '')
        return v.strip()


class ValidationRequest(BaseModel):
    """
    Batch validation request for a session.
    
    Security: Limited to 100 validations per request (DoS protection).
    """
    validations: list[BoxValidation] = Field(..., min_items=1, max_items=100)
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class GroundTruthBox(BaseModel):
    """
    Box with ground truth validation.
    Extends original detection with user verification.
    """
    # Original YOLO detection
    x1: float
    y1: float
    x2: float
    y2: float
    confidence: float = Field(ge=0.0, le=1.0)
    label: str = Field(max_length=50)
    class_id: int
    box_id: Optional[str] = Field(None, max_length=200, description="Unique identifier for this box")
    
    # Ground truth fields
    is_verified: bool = False  # Has user reviewed this box?
    is_correct: bool = True    # Is it a true positive (TP) or false positive (FP)?
    is_manual: bool = False    # Was this box manually added by user (indicates FN)?
    verified_at: Optional[datetime] = None
    notes: Optional[str] = Field(None, max_length=500)
    
    class Config:
        # Allow extra fields from frontend that aren't in schema
        extra = "ignore"
    
    @validator('label')
    def sanitize_label(cls, v):
        """Sanitize label to prevent injection"""
        # Allow alphanumeric, spaces, hyphens, underscores only
        import re
        if not re.match(r'^[a-zA-Z0-9\s_-]+$', v):
            raise ValueError("Label contains invalid characters")
        return v.strip()


class TrueMetrics(BaseModel):
    """
    True classification metrics based on ground truth.
    
    Definitions:
    - True Positive (TP): Correct detection (is_correct=True)
    - False Positive (FP): Incorrect detection (is_correct=False)
    - False Negative (FN): Missed object (requires manual annotation)
    - True Negative (TN): N/A for object detection
    """
    # Counts
    true_positives: int = Field(ge=0)
    false_positives: int = Field(ge=0)
    false_negatives: int = Field(ge=0, default=0)
    total_verified: int = Field(ge=0)
    
    # Rates
    precision: float = Field(ge=0.0, le=1.0, description="TP / (TP + FP)")
    recall: float = Field(ge=0.0, le=1.0, description="TP / (TP + FN)")
    f1_score: float = Field(ge=0.0, le=1.0, description="2 * (precision * recall) / (precision + recall)")
    false_positive_rate: float = Field(ge=0.0, le=100.0, description="(FP / total_verified) * 100")
    
    # Original YOLO metrics (for comparison)
    yolo_avg_confidence: float = Field(ge=0.0, le=1.0)
    yolo_box_count: int = Field(ge=0)
    yolo_fps: float = Field(ge=0.0)
    
    @validator('precision', 'recall', 'f1_score')
    def check_valid_metric(cls, v):
        """Ensure metrics are valid numbers (not NaN)"""
        if not isinstance(v, (int, float)) or v < 0 or v > 1:
            return 0.0
        return v
