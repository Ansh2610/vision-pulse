import { Zap, Target, BarChart3 } from 'lucide-react'
import Upload from './Upload'
import { Box, Metrics } from '../types'

interface Props {
  onComplete: (results: Array<{
    sessionId: string
    imageSrc: string
    boxes: Box[]
    metrics: Metrics
    imageId: string
    filename?: string
  }>) => void
}

export default function LandingPage({ onComplete }: Props) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Hero Section - Golden Ratio Layout */}
      <div className="max-w-7xl mx-auto px-6 py-16 text-center">
        {/* App Name - Largest Element */}
        <div className="mb-12">
          <h1 className="text-8xl font-bold text-gray-900 mb-6 tracking-tight">
            VisionPulse
          </h1>
          <p className="text-3xl text-gray-600 font-light">
            AI-Powered Image Annotation Platform
          </p>
        </div>

        {/* Upload Section - Golden Ratio Center Point */}
        <div className="max-w-2xl mx-auto mb-20">
          <Upload onComplete={onComplete} />
        </div>
      </div>

      {/* Features Section */}
      <div className="max-w-6xl mx-auto px-6 py-20 border-t border-gray-200">
        <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
          Streamline Your Annotation Workflow
        </h2>
        
        <div className="grid md:grid-cols-3 gap-8">
          {/* Feature 1 */}
          <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
              <Zap className="w-6 h-6 text-blue-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              Instant Detection
            </h3>
            <p className="text-gray-600 leading-relaxed">
              Upload images and receive automated object detection powered by YOLOv8. 
              Results appear instantly with confidence scores and bounding boxes.
            </p>
          </div>

          {/* Feature 2 */}
          <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
              <Target className="w-6 h-6 text-green-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              Manual Refinement
            </h3>
            <p className="text-gray-600 leading-relaxed">
              Edit, add, or remove annotations with intuitive canvas tools. 
              Double-click to rename labels and verify detection accuracy.
            </p>
          </div>

          {/* Feature 3 */}
          <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
              <BarChart3 className="w-6 h-6 text-purple-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              Quality Metrics
            </h3>
            <p className="text-gray-600 leading-relaxed">
              Track precision, recall, and F1 scores. Validate detections to calculate 
              true classification metrics across your entire session.
            </p>
          </div>
        </div>
      </div>

      {/* How It Works */}
      <div className="bg-gray-50 border-t border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-20">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
            How It Works
          </h2>
          
          <div className="grid md:grid-cols-4 gap-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
                1
              </div>
              <h4 className="font-semibold text-gray-900 mb-2">Upload Images</h4>
              <p className="text-sm text-gray-600">
                Support for JPEG, PNG, and WebP formats
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
                2
              </div>
              <h4 className="font-semibold text-gray-900 mb-2">AI Detection</h4>
              <p className="text-sm text-gray-600">
                Automatic object detection with YOLOv8
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
                3
              </div>
              <h4 className="font-semibold text-gray-900 mb-2">Verify & Edit</h4>
              <p className="text-sm text-gray-600">
                Review annotations and make corrections
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
                4
              </div>
              <h4 className="font-semibold text-gray-900 mb-2">Export</h4>
              <p className="text-sm text-gray-600">
                Download in YOLO format for training
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Section */}
      <div className="max-w-6xl mx-auto px-6 py-20">
        <div className="grid md:grid-cols-2 gap-8 text-center">
          <div>
            <div className="text-4xl font-bold text-blue-600 mb-2">80+ Classes</div>
            <p className="text-gray-600">Pre-trained object categories</p>
          </div>
          <div>
            <div className="text-4xl font-bold text-green-600 mb-2">Real-time</div>
            <p className="text-gray-600">Instant inference results</p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-gray-200 bg-gray-50">
        <div className="max-w-6xl mx-auto px-6 py-8 text-center text-sm text-gray-500">
          <p>Built with YOLOv8, FastAPI, and React</p>
        </div>
      </div>
    </div>
  )
}
