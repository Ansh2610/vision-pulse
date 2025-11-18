"""
True metrics calculation based on ground truth validation.

Replaces proxy metrics with real classification metrics:
- True Positives (TP): Correct detections
- False Positives (FP): Incorrect detections
- False Negatives (FN): Missed objects
- Precision, Recall, F1 Score
"""
from typing import List
from app.schemas.validation import GroundTruthBox, TrueMetrics


def calculate_true_metrics(
    boxes: List[GroundTruthBox],
    yolo_metrics: dict
) -> TrueMetrics:
    """
    Calculate true classification metrics from verified boxes.
    
    Args:
        boxes: List of boxes with ground truth validation
        yolo_metrics: Original YOLO metrics (fps, avg_conf, box_count)
    
    Returns:
        TrueMetrics with precision, recall, F1, true FP rate
    
    Security: All inputs validated by Pydantic schemas.
    """
    
    # Filter verified boxes only
    verified_boxes = [b for b in boxes if b.is_verified]
    
    if not verified_boxes:
        # No verification yet - return empty metrics
        return TrueMetrics(
            true_positives=0,
            false_positives=0,
            false_negatives=0,
            total_verified=0,
            precision=0.0,
            recall=0.0,
            f1_score=0.0,
            false_positive_rate=0.0,
            yolo_avg_confidence=yolo_metrics.get('avg_confidence', 0.0),
            yolo_box_count=yolo_metrics.get('box_count', 0),
            yolo_fps=yolo_metrics.get('fps', 0.0)
        )
    
    # Count TP: Correct detections (both YOLO and manual boxes that are verified as correct)
    # Manual boxes represent True Positives that were missed by YOLO initially (recovered FN → TP)
    true_positives = sum(1 for b in verified_boxes if b.is_correct)
    
    # Count FP: Incorrect YOLO detections only (manual boxes are always correct)
    false_positives = sum(1 for b in verified_boxes if not b.is_correct and not b.is_manual)
    
    # Count FN: Manually added boxes that are NOT yet verified
    # Once manual boxes are verified as correct, they become TP (recovered false negatives)
    false_negatives = sum(1 for b in boxes if b.is_manual and not b.is_verified)
    
    # Calculate metrics
    total_verified = len(verified_boxes)
    
    # Precision: TP / (TP + FP)
    # "Of all detections, how many were correct?"
    if (true_positives + false_positives) > 0:
        precision = true_positives / (true_positives + false_positives)
    else:
        precision = 0.0
    
    # Recall: TP / (TP + FN)
    # "Of all actual objects, how many did we detect?"
    if (true_positives + false_negatives) > 0:
        recall = true_positives / (true_positives + false_negatives)
    else:
        recall = 0.0 if true_positives == 0 else 1.0  # If no FN and we have TP, recall is 100%
    
    # F1 Score: Harmonic mean of precision and recall
    if (precision + recall) > 0:
        f1_score = 2 * (precision * recall) / (precision + recall)
    else:
        f1_score = 0.0
    
    # True False Positive Rate: (FP / total_verified) * 100
    fp_rate = (false_positives / total_verified * 100) if total_verified > 0 else 0.0
    
    return TrueMetrics(
        true_positives=true_positives,
        false_positives=false_positives,
        false_negatives=false_negatives,
        total_verified=total_verified,
        precision=round(precision, 3),
        recall=round(recall, 3),
        f1_score=round(f1_score, 3),
        false_positive_rate=round(fp_rate, 1),
        yolo_avg_confidence=yolo_metrics.get('avg_confidence', 0.0),
        yolo_box_count=yolo_metrics.get('box_count', 0),
        yolo_fps=yolo_metrics.get('fps', 0.0)
    )


def update_box_validation(
    boxes: List[GroundTruthBox],
    box_id: str,
    is_correct: bool,
    confidence_override: float = None,
    notes: str = None
) -> GroundTruthBox:
    """
    Update a single box's ground truth validation.
    
    Args:
        boxes: List of all boxes
        box_id: ID of box to update (format: "session_id_index")
        is_correct: Whether this is a true positive
        confidence_override: Optional user-adjusted confidence
        notes: Optional annotation notes
    
    Returns:
        Updated GroundTruthBox
    
    Raises:
        ValueError: If box_id not found
    """
    from datetime import datetime
    
    # Find box by ID
    # Box ID format: "session_id_0", "session_id_1", etc.
    try:
        index = int(box_id.split('_')[-1])
        if index < 0 or index >= len(boxes):
            raise ValueError(f"Box index {index} out of range")
        
        box = boxes[index]
        box.is_verified = True
        box.is_correct = is_correct
        box.verified_at = datetime.utcnow()
        
        if confidence_override is not None:
            box.confidence = confidence_override
        
        if notes:
            box.notes = notes
        
        return box
        
    except (ValueError, IndexError) as e:
        raise ValueError(f"Invalid box_id: {box_id}") from e
