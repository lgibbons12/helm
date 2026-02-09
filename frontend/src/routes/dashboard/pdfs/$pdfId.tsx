import { useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Trash2,
  RefreshCw,
  FileText,
  GraduationCap,
  BookOpen,
  CheckCircle2,
  XCircle,
  Clock,
} from 'lucide-react'
import { format } from 'date-fns'

import { pdfApi, classesApi, assignmentsApi } from '../../../lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

export const Route = createFileRoute('/dashboard/pdfs/$pdfId')({
  component: PdfDetailPage,
})

function PdfDetailPage() {
  const { pdfId } = Route.useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  // Fetch PDF with extracted text
  const {
    data: pdf,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['pdfs', pdfId],
    queryFn: () => pdfApi.get(pdfId),
  })

  // Fetch classes and assignments for badge display
  const { data: classes = [] } = useQuery({
    queryKey: ['classes'],
    queryFn: () => classesApi.list(),
  })

  const { data: assignments = [] } = useQuery({
    queryKey: ['assignments'],
    queryFn: () => assignmentsApi.list(),
  })

  // Delete mutation
  const deletePdf = useMutation({
    mutationFn: (id: string) => pdfApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pdfs'] })
      navigate({ to: '/dashboard/pdfs' })
    },
  })

  // Re-extract mutation
  const reExtract = useMutation({
    mutationFn: (id: string) => pdfApi.processPdf(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pdfs', pdfId] })
    },
  })

  const formatSize = (bytes: number | null) => {
    if (!bytes) return '-'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-40" />
        <div className="glass-card p-6 space-y-4">
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    )
  }

  if (error || !pdf) {
    return (
      <div className="glass-card p-12 text-center">
        <h3 className="text-lg font-semibold text-destructive mb-2 lowercase">
          failed to load pdf
        </h3>
        <Link to="/dashboard/pdfs">
          <Button variant="outline" className="lowercase">
            back to pdfs
          </Button>
        </Link>
      </div>
    )
  }

  const className_ = pdf.class_id ? classes.find((c) => c.id === pdf.class_id) : null
  const assignment = pdf.assignment_id ? assignments.find((a) => a.id === pdf.assignment_id) : null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Link to="/dashboard/pdfs">
          <Button variant="ghost" size="sm" className="gap-1 lowercase">
            <ArrowLeft className="w-4 h-4" />
            back to pdfs
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          {pdf.extraction_status === 'failed' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => reExtract.mutate(pdf.id)}
              disabled={reExtract.isPending}
              className="gap-1 lowercase"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${reExtract.isPending ? 'animate-spin' : ''}`} />
              retry extraction
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDeleteDialogOpen(true)}
            className="gap-1 text-xs text-destructive hover:text-destructive lowercase"
          >
            <Trash2 className="w-3 h-3" />
            delete
          </Button>
        </div>
      </div>

      {/* Metadata card */}
      <div className="glass-card p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <FileText className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-foreground lowercase truncate">
              {pdf.filename}
            </h1>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              {/* Status */}
              {pdf.extraction_status === 'success' && (
                <Badge variant="outline" className="gap-1 text-xs text-emerald-500 border-emerald-500/30 lowercase">
                  <CheckCircle2 className="w-3 h-3" />
                  extracted
                </Badge>
              )}
              {pdf.extraction_status === 'failed' && (
                <Badge variant="outline" className="gap-1 text-xs text-destructive border-destructive/30 lowercase">
                  <XCircle className="w-3 h-3" />
                  extraction failed
                </Badge>
              )}
              {pdf.extraction_status === 'pending' && (
                <Badge variant="outline" className="gap-1 text-xs text-amber-500 border-amber-500/30 lowercase">
                  <Clock className="w-3 h-3" />
                  pending
                </Badge>
              )}
              {/* Class */}
              {className_ && (
                <Badge variant="outline" className="gap-1 text-xs lowercase">
                  <GraduationCap className="w-3 h-3" />
                  {className_.code || className_.name}
                </Badge>
              )}
              {/* Assignment */}
              {assignment && (
                <Badge variant="outline" className="gap-1 text-xs lowercase">
                  <BookOpen className="w-3 h-3" />
                  {assignment.title}
                </Badge>
              )}
            </div>
            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 text-sm">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">size</p>
                <p className="text-foreground lowercase">{formatSize(pdf.file_size_bytes)}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">pages</p>
                <p className="text-foreground lowercase">{pdf.page_count ?? '-'}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">uploaded</p>
                <p className="text-foreground lowercase">
                  {format(new Date(pdf.created_at), 'MMM d, yyyy')}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">text length</p>
                <p className="text-foreground lowercase">
                  {pdf.extracted_text ? `${pdf.extracted_text.length.toLocaleString()} chars` : '-'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Extracted text */}
      <div className="glass-card p-6">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
          extracted text
        </h2>
        {pdf.extracted_text ? (
          <div className="max-h-[60vh] overflow-y-auto rounded-lg bg-muted/20 p-4">
            <pre className="text-sm text-foreground whitespace-pre-wrap font-mono leading-relaxed">
              {pdf.extracted_text}
            </pre>
          </div>
        ) : (
          <div className="text-center py-8">
            <FileText className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground lowercase">
              {pdf.extraction_status === 'pending'
                ? 'text extraction is pending...'
                : pdf.extraction_status === 'failed'
                  ? 'text extraction failed. try re-extracting.'
                  : 'no extracted text available'}
            </p>
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="glass-strong border-0">
          <DialogHeader>
            <DialogTitle className="lowercase">delete pdf</DialogTitle>
            <DialogDescription className="lowercase">
              are you sure you want to delete "{pdf.filename}"? this action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              className="lowercase"
            >
              cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deletePdf.mutate(pdf.id)}
              disabled={deletePdf.isPending}
              className="lowercase"
            >
              {deletePdf.isPending ? 'deleting...' : 'delete'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
