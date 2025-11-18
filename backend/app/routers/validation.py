"""
Validation endpoint for ground truth annotation.

POST /validate/{session_id}
- Accept user verification of bounding boxes
- Calculate true metrics (precision, recall, F1)
- Return updated metrics
"""
from fastapi import APIRouter, HTTPException, Request, status
from slowapi import Limiter
from slowapi.util import get_remote_address
from app.schemas.validation import ValidationRequest, BoxValidation, GroundTruthBox
from app.utils.true_metrics import calculate_true_metrics, update_box_validation
from app.middleware.security import validate_session_id
from app.config.security import INFERENCE_RATE_LIMIT
from pathlib import Path
import tempfile
import json

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)

# Storage for ground truth validations
UPLOAD_DIR = Path(tempfile.gettempdir()) / "visionpulse_uploads"
VALIDATION_DIR = Path(tempfile.gettempdir()) / "visionpulse_validations"
VALIDATION_DIR.mkdir(exist_ok=True)


@router.post("/validate/{session_id}")
@limiter.limit(INFERENCE_RATE_LIMIT)
async def validate_detections(
    request: Request,
    session_id: str,
    validation_req: ValidationRequest
):
    """
    Validate bounding box detections (mark as TP or FP).
    
    Security:
    - Rate limited (20/min)
    - Input validated by Pydantic
    - Session ID sanitized
    - CSRF protected (requires X-CSRF-Token header)
    
    Args:
        session_id: Session identifier
        validation_req: Validation data with box verifications
    
    Returns:
        Updated metrics with true FP rate, precision, recall, F1
    """
    
    # Validate session ID
    try:
        session_id = validate_session_id(session_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    # Load existing boxes from inference
    validation_file = VALIDATION_DIR / f"{session_id}.json"
    
    try:
        if validation_file.exists():
            # Load existing session with multiple images
            with open(validation_file, 'r') as f:
                session_data = json.load(f)
                
            # Find all boxes across all images in this session
            all_boxes = []
            for image_data in session_data.get('images', []):
                for box_dict in image_data.get('boxes', []):
                    all_boxes.append(GroundTruthBox(**box_dict))
            
            # Get YOLO metrics from most recent image
            if session_data.get('images'):
                yolo_metrics = session_data['images'][-1].get('yolo_metrics', {})
            else:
                yolo_metrics = {}
        else:
            raise HTTPException(
                status_code=404,
                detail="Session not found. Run inference first."
            )
        
        # Update boxes with validations
        for validation in validation_req.validations:
            try:
                box_id = validation.box_id
                print(f"[VALIDATION] Updating box_id: {box_id}, is_correct: {validation.is_correct}")
                
                # Extract image_id from box_id (format: {image_id}_box_{idx})
                if '_box_' in box_id:
                    image_id_from_box = box_id.rsplit('_box_', 1)[0]
                    box_index = int(box_id.rsplit('_box_', 1)[1])
                    print(f"[VALIDATION]   -> Image ID: {image_id_from_box}, Box Index: {box_index}")
                    
                    # Find the specific image and update the specific box directly in session_data
                    image_found = False
                    for img_data in session_data['images']:
                        if img_data['image_id'] == image_id_from_box:
                            # Found the right image, now update the specific box
                            for i, box in enumerate(img_data['boxes']):
                                if box.get('box_id') == box_id:
                                    # Update this specific box
                                    img_data['boxes'][i]['is_verified'] = True
                                    img_data['boxes'][i]['is_correct'] = validation.is_correct
                                    if validation.confidence_override is not None:
                                        img_data['boxes'][i]['confidence'] = validation.confidence_override
                                    if validation.notes:
                                        img_data['boxes'][i]['notes'] = validation.notes
                                    print(f"[VALIDATION]   -> Updated box in image {img_data['image_id'][-10:]}, index {i}")
                                    image_found = True
                                    break
                            break
                    
                    if not image_found:
                        print(f"[VALIDATION]   -> WARNING: Box {box_id} not found in any image!")
                
            except Exception as e:
                print(f"[VALIDATION] Error updating box {validation.box_id}: {e}")
                raise HTTPException(status_code=400, detail=str(e))
        
        # Now reload all boxes for metrics calculation
        all_boxes = []
        for image_data in session_data.get('images', []):
            for box_dict in image_data.get('boxes', []):
                all_boxes.append(GroundTruthBox(**box_dict))
        
        # Calculate true metrics across ALL boxes in the session
        true_metrics = calculate_true_metrics(all_boxes, yolo_metrics)
        
        # Debug logging
        print(f"[VALIDATION] Session {session_id}: {len(all_boxes)} total boxes across {len(session_data.get('images', []))} images")
        print(f"[VALIDATION] Verified: {sum(1 for b in all_boxes if b.is_verified)}, Metrics: {true_metrics.dict()}")
        
        # Debug: Show breakdown by verification status
        tp_boxes = [b for b in all_boxes if b.is_verified and b.is_correct]
        fp_boxes = [b for b in all_boxes if b.is_verified and not b.is_correct]
        unverified_boxes = [b for b in all_boxes if not b.is_verified]
        print(f"[VALIDATION] TP: {len(tp_boxes)}, FP: {len(fp_boxes)}, Unverified: {len(unverified_boxes)}")
        
        # Debug: Show what we're saving
        print(f"[VALIDATION] Final state before saving to file:")
        for idx, img_data in enumerate(session_data['images']):
            verified_in_img = sum(1 for b in img_data['boxes'] if b.get('is_verified', False))
            print(f"[VALIDATION]   Image {idx} ({img_data['image_id'][-10:]}): {len(img_data['boxes'])} boxes, {verified_in_img} verified")
        
        # Store aggregate metrics at session level
        session_data['true_metrics'] = true_metrics.dict()
        
        # Save updated session data
        with open(validation_file, 'w') as f:
            json.dump(session_data, f, default=str)
        
        return {
            "session_id": session_id,
            "metrics": true_metrics.dict(),
            "verified_count": sum(1 for b in all_boxes if b.is_verified),
            "total_images": len(session_data.get('images', [])),
            "total_boxes": len(all_boxes)
        }
        
    except FileNotFoundError:
        raise HTTPException(
            status_code=404,
            detail="Session data not found"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Validation failed: {str(e)}"
        )


@router.get("/validations/{session_id}")
@limiter.limit("30/minute")
async def get_validations(request: Request, session_id: str):
    """
    Get current validation state for a session.
    
    Returns:
        Boxes with verification status + current metrics
    """
    
    # Validate session ID
    try:
        session_id = validate_session_id(session_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    validation_file = VALIDATION_DIR / f"{session_id}.json"
    
    if not validation_file.exists():
        raise HTTPException(
            status_code=404,
            detail="No validations found for this session"
        )
    
    try:
        with open(validation_file, 'r') as f:
            data = json.load(f)
        
        # Calculate session-wide metrics if any boxes are verified
        all_boxes = []
        yolo_metrics = {}
        
        for image_data in data.get('images', []):
            for box_dict in image_data.get('boxes', []):
                all_boxes.append(GroundTruthBox(**box_dict))
            # Use most recent image's YOLO metrics
            if image_data.get('yolo_metrics'):
                yolo_metrics = image_data['yolo_metrics']
        
        # Calculate and store metrics if any boxes are verified
        verified_count = sum(1 for b in all_boxes if b.is_verified)
        
        print(f"[GET VALIDATIONS] Session {session_id}: {len(all_boxes)} total boxes, {verified_count} verified")
        print(f"[GET VALIDATIONS] Images in session: {len(data.get('images', []))}")
        
        # Debug: Show per-image breakdown
        for idx, img in enumerate(data.get('images', [])):
            img_boxes = img.get('boxes', [])
            img_verified = sum(1 for b in img_boxes if b.get('is_verified', False))
            print(f"[GET VALIDATIONS]   Image {idx+1}: {len(img_boxes)} boxes, {img_verified} verified")
        
        if verified_count > 0:
            from app.utils.true_metrics import calculate_true_metrics
            true_metrics = calculate_true_metrics(all_boxes, yolo_metrics)
            data['true_metrics'] = true_metrics.dict()
            print(f"[GET VALIDATIONS] Calculated metrics: {true_metrics.dict()}")
            
            # Save updated metrics
            with open(validation_file, 'w') as f:
                json.dump(data, f, default=str)
        
        return data
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to load validations: {str(e)}"
        )


@router.post("/add-manual-box/{session_id}/{image_id}")
@limiter.limit(INFERENCE_RATE_LIMIT)
async def add_manual_box(
    request: Request,
    session_id: str,
    image_id: str,
    box: GroundTruthBox
):
    """
    Add a manually drawn box (False Negative - object missed by YOLO).
    
    Security:
    - Rate limited (20/min)
    - Input validated by Pydantic
    - Session ID sanitized
    - CSRF protected (requires X-CSRF-Token header)
    
    Args:
        session_id: Session identifier
        image_id: Image identifier within the session
        box: Box data with coordinates and label
    
    Returns:
        Updated box with box_id assigned
    """
    
    # Validate session ID
    try:
        session_id = validate_session_id(session_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    # Load existing session data
    validation_file = VALIDATION_DIR / f"{session_id}.json"
    
    try:
        if not validation_file.exists():
            raise HTTPException(
                status_code=404,
                detail="Session not found. Run inference first."
            )
            
        with open(validation_file, 'r') as f:
            session_data = json.load(f)
        
        # Find the specific image
        image_found = False
        for img_data in session_data.get('images', []):
            if img_data['image_id'] == image_id:
                image_found = True
                
                # Generate box_id for the new manual box
                box_count = len(img_data['boxes'])
                box_id = f"{image_id}_box_{box_count}"
                
                # Create the box dictionary
                box_dict = box.dict()
                box_dict['box_id'] = box_id
                box_dict['is_manual'] = True      # Mark as manually added (False Negative)
                box_dict['is_verified'] = True    # Manual boxes are always verified
                box_dict['is_correct'] = True     # Manual boxes are always correct (100%)
                
                # Add to the image's boxes
                img_data['boxes'].append(box_dict)
                
                print(f"[ADD MANUAL BOX] Added manual box {box_id} to image {image_id}")
                print(f"[ADD MANUAL BOX]   Label: {box.label}, is_manual: True, is_verified: True (100% correct)")
                
                # Save updated session data
                with open(validation_file, 'w') as f:
                    json.dump(session_data, f, default=str)
                
                return {
                    "box_id": box_id,
                    "box": box_dict,
                    "message": "Manual box added successfully"
                }
        
        if not image_found:
            raise HTTPException(
                status_code=404,
                detail=f"Image {image_id} not found in session"
            )
                
    except FileNotFoundError:
        raise HTTPException(
            status_code=404,
            detail="Session data not found"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to add manual box: {str(e)}"
        )


@router.delete("/delete-box/{session_id}/{image_id}/{box_id}")
@limiter.limit(INFERENCE_RATE_LIMIT)
async def delete_box(
    request: Request,
    session_id: str,
    image_id: str,
    box_id: str
):
    """
    Delete a box (annotation) from an image.
    
    Security:
    - Rate limited (20/min)
    - Session ID sanitized
    - CSRF protected (requires X-CSRF-Token header)
    
    Args:
        session_id: Session identifier
        image_id: Image identifier within the session
        box_id: Box identifier to delete
    
    Returns:
        Success message with updated box count
    """
    
    # Validate session ID
    try:
        session_id = validate_session_id(session_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    # Load existing session data
    validation_file = VALIDATION_DIR / f"{session_id}.json"
    
    try:
        if not validation_file.exists():
            raise HTTPException(
                status_code=404,
                detail="Session not found."
            )
            
        with open(validation_file, 'r') as f:
            session_data = json.load(f)
        
        # Find the specific image and delete the box
        image_found = False
        box_deleted = False
        
        for img_data in session_data.get('images', []):
            if img_data['image_id'] == image_id:
                image_found = True
                
                # Find and remove the box
                original_count = len(img_data['boxes'])
                img_data['boxes'] = [
                    box for box in img_data['boxes'] 
                    if box.get('box_id') != box_id
                ]
                new_count = len(img_data['boxes'])
                
                if new_count < original_count:
                    box_deleted = True
                    print(f"[DELETE BOX] Deleted box {box_id} from image {image_id}")
                    print(f"[DELETE BOX]   Box count: {original_count} -> {new_count}")
                    
                    # Save updated session data
                    with open(validation_file, 'w') as f:
                        json.dump(session_data, f, default=str)
                    
                    return {
                        "message": "Box deleted successfully",
                        "box_id": box_id,
                        "remaining_boxes": new_count
                    }
                
                break
        
        if not image_found:
            raise HTTPException(
                status_code=404,
                detail=f"Image {image_id} not found in session"
            )
        
        if not box_deleted:
            raise HTTPException(
                status_code=404,
                detail=f"Box {box_id} not found in image"
            )
                
    except FileNotFoundError:
        raise HTTPException(
            status_code=404,
            detail="Session data not found"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete box: {str(e)}"
        )
