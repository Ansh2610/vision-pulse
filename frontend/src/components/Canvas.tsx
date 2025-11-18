import { useRef, useEffect, useState } from 'react'
import { api } from '../api.ts'
import { Box } from '../types.ts'

interface Props {
  sessionId: string
  imageId: string
  imageSrc: string
  initialBoxes: Box[]
  onBoxesUpdate?: (boxes: Box[]) => void
  onBoxSelect?: (boxIndex: number | null) => void
  selectedBoxIndex?: number | null
  drawingMode?: boolean
}

export default function Canvas({ 
  sessionId, 
  imageId, 
  imageSrc, 
  initialBoxes, 
  onBoxesUpdate,
  onBoxSelect,
  selectedBoxIndex,
  drawingMode = false
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [boxes, setBoxes] = useState<Box[]>(initialBoxes)
  const [imgDims, setImgDims] = useState({ width: 0, height: 0 })
  const [isDrawing, setIsDrawing] = useState(false)
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null)
  const [currentBox, setCurrentBox] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)

  // Sync boxes when initialBoxes changes (e.g., switching to history image)
  useEffect(() => {
    setBoxes(initialBoxes)
  }, [initialBoxes])

  useEffect(() => {
    const img = new Image()
    img.src = imageSrc
    img.onload = () => {
      setImgDims({ width: img.width, height: img.height })
      drawCanvas(img)
    }
  }, [imageSrc])

  useEffect(() => {
    const img = new Image()
    img.src = imageSrc
    img.onload = () => drawCanvas(img)
  }, [boxes, selectedBoxIndex])

  const drawCanvas = (img: HTMLImageElement) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // fit to container (max 800px wide)
    const maxWidth = 800
    const scale = Math.min(1, maxWidth / img.width)
    const w = img.width * scale
    const h = img.height * scale

    canvas.width = w
    canvas.height = h

    ctx.drawImage(img, 0, 0, w, h)

    // draw existing boxes
    boxes.forEach((box, idx) => {
      const x1 = (box.x1 / img.width) * w
      const y1 = (box.y1 / img.height) * h
      const x2 = (box.x2 / img.width) * w
      const y2 = (box.y2 / img.height) * h

      // Highlight if selected
      const isSelected = selectedBoxIndex === idx
      
      // Color based on confidence or verification status
      let color = '#00ff00' // Default green
      if ((box as any).is_verified) {
        color = (box as any).is_correct ? '#00ff00' : '#ff0000' // Green if correct, red if wrong
      } else {
        color = box.confidence >= 0.7 ? '#00ff00' : box.confidence >= 0.5 ? '#ffaa00' : '#ff6600'
      }
      
      ctx.strokeStyle = isSelected ? '#0099ff' : color
      ctx.lineWidth = isSelected ? 4 : 2
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1)

      // label
      ctx.fillStyle = color
      ctx.fillRect(x1, y1 - 20, 100, 20)
      ctx.fillStyle = '#000'
      ctx.font = '12px sans-serif'
      ctx.fillText(`${box.label} ${(box.confidence * 100).toFixed(0)}%`, x1 + 2, y1 - 5)
    })

    // draw current box being drawn
    if (currentBox && isDrawing) {
      ctx.strokeStyle = '#0099ff'
      ctx.lineWidth = 2
      ctx.setLineDash([5, 5])
      ctx.strokeRect(
        currentBox.x1,
        currentBox.y1,
        currentBox.x2 - currentBox.x1,
        currentBox.y2 - currentBox.y1
      )
      ctx.setLineDash([])
    }
  }

  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    }
  }

  const findBoxAtPoint = (x: number, y: number): number => {
    const canvas = canvasRef.current
    if (!canvas) return -1

    const img = new Image()
    img.src = imageSrc
    const w = canvas.width
    const h = canvas.height

    for (let i = boxes.length - 1; i >= 0; i--) {
      const box = boxes[i]
      const x1 = (box.x1 / imgDims.width) * w
      const y1 = (box.y1 / imgDims.height) * h
      const x2 = (box.x2 / imgDims.width) * w
      const y2 = (box.y2 / imgDims.height) * h

      if (x >= x1 && x <= x2 && y >= y1 && y <= y2) {
        return i
      }
    }
    return -1
  }

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (drawingMode) return // Don't select when drawing
    
    const coords = getCanvasCoords(e)
    const boxIndex = findBoxAtPoint(coords.x, coords.y)
    
    // Only change selection if you clicked on a box
    if (boxIndex >= 0) {
      onBoxSelect?.(boxIndex)
    }
    // Don't deselect when clicking empty space - keep current selection
  }

  const handleCanvasDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (drawingMode) return
    
    const coords = getCanvasCoords(e)
    const boxIndex = findBoxAtPoint(coords.x, coords.y)
    
    if (boxIndex >= 0) {
      const box = boxes[boxIndex]
      const newLabelValue = prompt(`Edit label for "${box.label}":`, box.label)
      
      if (newLabelValue !== null && newLabelValue.trim() !== '') {
        const updatedBoxes = [...boxes]
        updatedBoxes[boxIndex] = { ...box, label: newLabelValue.trim() }
        setBoxes(updatedBoxes)
        onBoxesUpdate?.(updatedBoxes)
      }
    }
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawingMode) return
    
    const coords = getCanvasCoords(e)
    setIsDrawing(true)
    setStartPoint(coords)
    setCurrentBox({ x1: coords.x, y1: coords.y, x2: coords.x, y2: coords.y })
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawingMode || !isDrawing || !startPoint) return
    
    const coords = getCanvasCoords(e)
    setCurrentBox({
      x1: Math.min(startPoint.x, coords.x),
      y1: Math.min(startPoint.y, coords.y),
      x2: Math.max(startPoint.x, coords.x),
      y2: Math.max(startPoint.y, coords.y)
    })
    
    // Redraw canvas with current box
    const img = new Image()
    img.src = imageSrc
    img.onload = () => drawCanvas(img)
  }

  const handleMouseUp = async () => {
    if (!drawingMode || !isDrawing || !currentBox) return
    
    setIsDrawing(false)
    
    // Only add if box has reasonable size
    const width = currentBox.x2 - currentBox.x1
    const height = currentBox.y2 - currentBox.y1
    
    if (width > 10 && height > 10) {
      // Prompt for label
      const labelInput = prompt('Enter label for this annotation:', 'object')
      if (!labelInput) {
        setCurrentBox(null)
        setStartPoint(null)
        return
      }
      
      // Convert canvas coords to image coords
      const canvas = canvasRef.current
      if (!canvas) return
      
      const scaleX = imgDims.width / canvas.width
      const scaleY = imgDims.height / canvas.height
      
      const newBox: Box = {
        x1: currentBox.x1 * scaleX,
        y1: currentBox.y1 * scaleY,
        x2: currentBox.x2 * scaleX,
        y2: currentBox.y2 * scaleY,
        confidence: 1.0,
        label: labelInput.trim(),
        class_id: 999,
        is_manual: true,
        box_id: '' // Will be assigned by backend
      }
      
      try {
        // Send to backend to save as False Negative
        const response = await api.addManualBox(sessionId, imageId, newBox)
        
        // Update box with the box_id from backend
        const boxWithId: Box = {
          ...newBox,
          box_id: response.box_id,
          is_verified: false,
          is_correct: true
        }
        
        const updatedBoxes = [...boxes, boxWithId]
        setBoxes(updatedBoxes)
        onBoxesUpdate?.(updatedBoxes)
        
        console.log(`[CANVAS] Added manual box (FN): ${response.box_id}`)
      } catch (err) {
        console.error('Failed to add manual box:', err)
        const errorMsg = err instanceof Error ? err.message : 'Unknown error'
        alert(`Failed to add manual box: ${errorMsg}`)
      }
    }
    
    setCurrentBox(null)
    setStartPoint(null)
  }

  return (
    <div className="flex-1 overflow-auto bg-gray-100 flex items-center justify-center p-6">
      <canvas
        ref={canvasRef}
        className={`border-2 border-gray-300 shadow-lg bg-white max-w-full ${drawingMode ? 'cursor-crosshair' : 'cursor-pointer'}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleCanvasClick}
        onDoubleClick={handleCanvasDoubleClick}
      />
    </div>
  )
}
