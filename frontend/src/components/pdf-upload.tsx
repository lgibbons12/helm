import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Upload,
  FileText,
  Loader2,
  CheckCircle2,
  AlertCircle,
  X,
  Trash2,
  RefreshCw,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

import { pdfApi, type PDF, ApiError } from '@/lib/api'
import { Button } from '@/components/ui/button'

// =============================================================================
// PDF Upload Component
// =============================================================================

interface PDFUploadProps {
  classId?: string
  assignmentId?: string
  onUploadComplete?: (pdfId: string) => void
}

export function PDFUpload({ classId, assignmentId, onUploadComplete }: PDFUploadProps) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [uploadStage, setUploadStage] = useState<'idle' | 'uploading' | 'processing' | 'done' | 'error'>('idle')
  const [fileName, setFileName] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [errorDetail, setErrorDetail] = useState<string | null>(null)

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      setFileName(file.name)
      setErrorMessage(null)
      setErrorDetail(null)

      // 1. Get presigned URL
      setUploadStage('uploading')
      let uploadData
      try {
        uploadData = await pdfApi.getUploadUrl(file.name, classId, assignmentId)
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : 'failed to get upload url'
        throw new Error(`presign failed: ${msg}`)
      }

      const { upload_url, fields, pdf_id } = uploadData

      // 2. Upload directly to S3
      const formData = new FormData()
      Object.entries(fields).forEach(([key, value]) => {
        formData.append(key, value)
      })
      formData.append('file', file)

      let s3Response: Response
      try {
        s3Response = await fetch(upload_url, { method: 'POST', body: formData })
      } catch (err) {
        throw new Error(`s3 upload failed: network error — is minio/s3 running?`)
      }

      if (!s3Response.ok && s3Response.status !== 204) {
        const body = await s3Response.text().catch(() => '')
        throw new Error(
          `s3 upload failed: ${s3Response.status} ${s3Response.statusText}${body ? ` — ${body.slice(0, 200)}` : ''}`
        )
      }

      // 3. Trigger text extraction
      setUploadStage('processing')
      try {
        await pdfApi.processPdf(pdf_id)
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : 'extraction failed'
        throw new Error(`text extraction failed: ${msg}`)
      }

      return pdf_id
    },
    onSuccess: (pdfId) => {
      setUploadStage('done')
      queryClient.invalidateQueries({ queryKey: ['pdfs'] })
      onUploadComplete?.(pdfId)

      setTimeout(() => {
        setUploadStage('idle')
        setFileName(null)
      }, 2000)
    },
    onError: (err) => {
      setUploadStage('error')
      const message = err instanceof Error ? err.message : 'upload failed'
      // Split on first colon to get stage and detail
      const colonIdx = message.indexOf(':')
      if (colonIdx > -1) {
        setErrorMessage(message.slice(0, colonIdx).trim())
        setErrorDetail(message.slice(colonIdx + 1).trim())
      } else {
        setErrorMessage(message)
        setErrorDetail(null)
      }
    },
  })

  const handleFile = (file: File) => {
    if (file.type !== 'application/pdf') {
      setUploadStage('error')
      setErrorMessage('invalid file type')
      setErrorDetail('only pdf files are supported')
      return
    }
    if (file.size > 50 * 1024 * 1024) {
      setUploadStage('error')
      setErrorMessage('file too large')
      setErrorDetail('max size is 50mb')
      return
    }
    uploadMutation.mutate(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const isUploading = uploadStage === 'uploading' || uploadStage === 'processing'

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !isUploading && fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all ${
          dragOver
            ? 'border-primary bg-primary/5'
            : uploadStage === 'error'
              ? 'border-destructive/50 bg-destructive/5'
              : uploadStage === 'done'
                ? 'border-green-500/50 bg-green-500/5'
                : 'border-border/50 hover:border-border hover:bg-muted/30'
        } ${isUploading ? 'pointer-events-none' : ''}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleFile(file)
            e.target.value = ''
          }}
        />

        {uploadStage === 'idle' && (
          <div className="space-y-2">
            <Upload className="w-8 h-8 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground lowercase">
              drop a pdf here or click to upload
            </p>
            <p className="text-xs text-muted-foreground/60 lowercase">max 50mb</p>
          </div>
        )}

        {uploadStage === 'uploading' && (
          <div className="space-y-2">
            <Loader2 className="w-8 h-8 mx-auto text-primary animate-spin" />
            <p className="text-sm text-muted-foreground lowercase">
              uploading {fileName}...
            </p>
          </div>
        )}

        {uploadStage === 'processing' && (
          <div className="space-y-2">
            <Loader2 className="w-8 h-8 mx-auto text-primary animate-spin" />
            <p className="text-sm text-muted-foreground lowercase">extracting text...</p>
          </div>
        )}

        {uploadStage === 'done' && (
          <div className="space-y-2">
            <CheckCircle2 className="w-8 h-8 mx-auto text-green-500" />
            <p className="text-sm text-green-600 lowercase">{fileName} uploaded</p>
          </div>
        )}

        {uploadStage === 'error' && (
          <div className="space-y-1.5">
            <AlertCircle className="w-8 h-8 mx-auto text-destructive" />
            <p className="text-sm text-destructive font-medium lowercase">
              {errorMessage || 'upload failed'}
            </p>
            {errorDetail && (
              <p className="text-xs text-destructive/70 lowercase break-all px-2">
                {errorDetail}
              </p>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="text-xs lowercase mt-1"
              onClick={(e) => {
                e.stopPropagation()
                setUploadStage('idle')
                setErrorMessage(null)
                setErrorDetail(null)
              }}
            >
              try again
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

// =============================================================================
// PDF Manager — shows all uploaded PDFs with status
// =============================================================================

interface PDFManagerProps {
  classId?: string
  assignmentId?: string
}

export function PDFManager({ classId, assignmentId }: PDFManagerProps) {
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = useState(true)

  const { data: pdfsData, isLoading } = useQuery({
    queryKey: ['pdfs', classId, assignmentId],
    queryFn: () =>
      pdfApi.list({
        class_id: classId,
        assignment_id: assignmentId,
      }),
  })
  const pdfs = pdfsData?.pdfs || []

  const deleteMutation = useMutation({
    mutationFn: (id: string) => pdfApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pdfs'] })
    },
  })

  const retryMutation = useMutation({
    mutationFn: (id: string) => pdfApi.processPdf(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pdfs'] })
    },
  })

  if (isLoading) {
    return (
      <div className="glass-card p-3">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            pdfs
          </span>
        </div>
        <div className="mt-2 flex justify-center py-3">
          <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
        </div>
      </div>
    )
  }

  if (pdfs.length === 0) return null

  return (
    <div className="glass-card p-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2"
      >
        {expanded ? (
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-3 h-3 text-muted-foreground" />
        )}
        <FileText className="w-4 h-4 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex-1 text-left">
          pdfs
        </span>
        <span className="text-[10px] text-muted-foreground/60">
          {pdfs.length}
        </span>
      </button>

      {expanded && (
        <div className="mt-2 space-y-1">
          {pdfs.map((pdf) => (
            <PDFStatusRow
              key={pdf.id}
              pdf={pdf}
              onDelete={() => deleteMutation.mutate(pdf.id)}
              onRetry={() => retryMutation.mutate(pdf.id)}
              isRetrying={retryMutation.isPending}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// =============================================================================
// PDF Status Row — detailed status per PDF
// =============================================================================

function PDFStatusRow({
  pdf,
  onDelete,
  onRetry,
  isRetrying,
}: {
  pdf: PDF
  onDelete: () => void
  onRetry: () => void
  isRetrying: boolean
}) {
  const statusConfig = {
    success: {
      icon: CheckCircle2,
      color: 'text-green-500',
      bg: '',
      label: `${pdf.page_count || 0} pages extracted`,
    },
    pending: {
      icon: Loader2,
      color: 'text-amber-400 animate-spin',
      bg: '',
      label: 'processing...',
    },
    failed: {
      icon: AlertCircle,
      color: 'text-destructive',
      bg: 'bg-destructive/5',
      label: 'extraction failed',
    },
  }[pdf.extraction_status] || {
    icon: AlertCircle,
    color: 'text-muted-foreground',
    bg: '',
    label: pdf.extraction_status,
  }

  const StatusIcon = statusConfig.icon

  return (
    <div className={`flex items-start gap-2 p-2 rounded-md ${statusConfig.bg}`}>
      <StatusIcon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${statusConfig.color}`} />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-foreground truncate lowercase">{pdf.filename}</p>
        <p className={`text-[10px] lowercase ${
          pdf.extraction_status === 'failed' ? 'text-destructive/70' : 'text-muted-foreground/60'
        }`}>
          {statusConfig.label}
        </p>
        {pdf.file_size_bytes && (
          <p className="text-[10px] text-muted-foreground/40 lowercase">
            {(pdf.file_size_bytes / 1024).toFixed(0)}kb
            {pdf.created_at && ` · ${formatDistanceToNow(new Date(pdf.created_at), { addSuffix: true })}`}
          </p>
        )}
      </div>
      <div className="flex items-center gap-0.5 flex-shrink-0">
        {pdf.extraction_status === 'failed' && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-primary"
            onClick={onRetry}
            disabled={isRetrying}
            title="retry extraction"
            aria-label={`retry extraction for ${pdf.filename}`}
          >
            <RefreshCw className={`w-3 h-3 ${isRetrying ? 'animate-spin' : ''}`} />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-destructive"
          onClick={onDelete}
          title="delete pdf"
          aria-label={`delete ${pdf.filename}`}
        >
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
    </div>
  )
}

// =============================================================================
// Simple PDF List Item (for use in other contexts)
// =============================================================================

interface PDFListItemProps {
  pdf: { id: string; filename: string; extraction_status: string; page_count: number | null }
  onDelete?: (id: string) => void
  onClick?: (id: string) => void
}

export function PDFListItem({ pdf, onDelete, onClick }: PDFListItemProps) {
  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-lg glass hover:bg-muted/30 transition-colors ${
        onClick ? 'cursor-pointer' : ''
      }`}
      onClick={() => onClick?.(pdf.id)}
    >
      <FileText className="w-5 h-5 text-muted-foreground flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground truncate lowercase">{pdf.filename}</p>
        <p className="text-xs text-muted-foreground lowercase">
          {pdf.extraction_status === 'success'
            ? `${pdf.page_count || 0} pages`
            : pdf.extraction_status === 'pending'
              ? 'processing...'
              : 'extraction failed'}
        </p>
      </div>
      {pdf.extraction_status === 'pending' && (
        <Loader2 className="w-4 h-4 text-muted-foreground animate-spin flex-shrink-0" />
      )}
      {onDelete && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-destructive flex-shrink-0"
          onClick={(e) => {
            e.stopPropagation()
            onDelete(pdf.id)
          }}
          aria-label={`delete ${pdf.filename}`}
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      )}
    </div>
  )
}
