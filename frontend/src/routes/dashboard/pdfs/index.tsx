import { useState, useMemo } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus,
  Search,
  FileText,
  CheckCircle2,
  XCircle,
  Clock,
  GraduationCap,
  Trash2,
  RefreshCw,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

import { pdfApi, classesApi, type PDF } from '../../../lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { PDFUpload } from '@/components/pdf-upload'

export const Route = createFileRoute('/dashboard/pdfs/')({
  component: PdfsIndexPage,
})

function PdfsIndexPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState('')
  const [classFilter, setClassFilter] = useState<string>('all')
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<PDF | null>(null)

  // Fetch data
  const { data: pdfsData, isLoading: pdfsLoading } = useQuery({
    queryKey: ['pdfs'],
    queryFn: () => pdfApi.list(),
  })
  const pdfs = pdfsData?.pdfs || []

  const { data: classes = [] } = useQuery({
    queryKey: ['classes'],
    queryFn: () => classesApi.list(),
  })

  // Delete mutation
  const deletePdf = useMutation({
    mutationFn: (id: string) => pdfApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pdfs'] })
      setDeleteTarget(null)
    },
  })

  // Re-extract mutation
  const reExtract = useMutation({
    mutationFn: (id: string) => pdfApi.processPdf(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pdfs'] })
    },
  })

  // Filter and search
  const filteredPdfs = useMemo(() => {
    let result = pdfs
    if (classFilter && classFilter !== 'all') {
      if (classFilter === 'none') {
        result = result.filter((p) => !p.class_id)
      } else {
        result = result.filter((p) => p.class_id === classFilter)
      }
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((p) => p.filename.toLowerCase().includes(q))
    }
    return result
  }, [pdfs, classFilter, searchQuery])

  // Group by class
  const grouped = useMemo(() => {
    const groups: Record<string, { name: string; color?: string; pdfs: PDF[] }> = {}
    groups['general'] = { name: 'general', pdfs: [] }

    for (const cls of classes) {
      groups[cls.id] = { name: cls.code || cls.name, color: cls.color || undefined, pdfs: [] }
    }

    for (const pdf of filteredPdfs) {
      const key = pdf.class_id || 'general'
      if (!groups[key]) {
        groups[key] = { name: 'unknown class', pdfs: [] }
      }
      groups[key].pdfs.push(pdf)
    }

    // Only return non-empty groups
    return Object.entries(groups).filter(([, g]) => g.pdfs.length > 0)
  }, [filteredPdfs, classes])

  const classMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const cls of classes) {
      map[cls.id] = cls.code || cls.name
    }
    return map
  }, [classes])

  const formatSize = (bytes: number | null) => {
    if (!bytes) return '-'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground lowercase">pdfs</h1>
          <p className="text-sm text-muted-foreground lowercase">
            manage uploaded documents and their extracted content
          </p>
        </div>
        <Button
          onClick={() => setUploadDialogOpen(true)}
          className="gap-2 lowercase"
        >
          <Plus className="w-4 h-4" />
          upload pdf
        </Button>
      </div>

      {/* Search + Filter */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="search pdfs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 lowercase"
          />
        </div>
        <Select value={classFilter} onValueChange={setClassFilter}>
          <SelectTrigger className="w-48 lowercase">
            <SelectValue placeholder="filter by class" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="lowercase">all classes</SelectItem>
            <SelectItem value="none" className="lowercase">general (no class)</SelectItem>
            {classes.map((cls) => (
              <SelectItem key={cls.id} value={cls.id} className="lowercase">
                {cls.code || cls.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* PDF List */}
      {pdfsLoading ? (
        <div className="glass-card p-6 space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : filteredPdfs.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <FileText className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-foreground lowercase mb-1">no pdfs found</h3>
          <p className="text-sm text-muted-foreground lowercase mb-4">
            {searchQuery || classFilter !== 'all'
              ? 'try adjusting your filters'
              : 'upload your first pdf to get started'}
          </p>
          {!searchQuery && classFilter === 'all' && (
            <Button onClick={() => setUploadDialogOpen(true)} className="gap-2 lowercase">
              <Plus className="w-4 h-4" />
              upload pdf
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([groupKey, group]) => (
            <div key={groupKey} className="glass-card overflow-hidden">
              {/* Group header */}
              <div className="px-4 py-2.5 border-b border-border/30 flex items-center gap-2">
                {group.color && (
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: group.color }} />
                )}
                {!group.color && groupKey === 'general' && (
                  <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                )}
                {!group.color && groupKey !== 'general' && (
                  <GraduationCap className="w-3.5 h-3.5 text-muted-foreground" />
                )}
                <span className="text-xs font-medium text-muted-foreground lowercase">
                  {group.name}
                </span>
                <span className="text-[10px] text-muted-foreground/50">
                  ({group.pdfs.length})
                </span>
              </div>

              {/* PDF rows */}
              <div className="divide-y divide-border/20">
                {group.pdfs.map((pdf) => (
                  <div
                    key={pdf.id}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 cursor-pointer transition-colors"
                    onClick={() => navigate({ to: '/dashboard/pdfs/$pdfId', params: { pdfId: pdf.id } })}
                  >
                    <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate lowercase">
                        {pdf.filename}
                      </p>
                      <p className="text-[10px] text-muted-foreground lowercase">
                        {formatSize(pdf.file_size_bytes)} &middot;{' '}
                        {pdf.page_count ? `${pdf.page_count} pages` : 'processing'} &middot;{' '}
                        {formatDistanceToNow(new Date(pdf.created_at), { addSuffix: true })}
                      </p>
                    </div>
                    <StatusBadge status={pdf.extraction_status} />
                    <div className="flex items-center gap-1">
                      {pdf.extraction_status === 'failed' && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          onClick={(e) => {
                            e.stopPropagation()
                            reExtract.mutate(pdf.id)
                          }}
                          title="retry extraction"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${reExtract.isPending ? 'animate-spin' : ''}`} />
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation()
                          setDeleteTarget(pdf)
                        }}
                        title="delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="glass-strong border-0">
          <DialogHeader>
            <DialogTitle className="lowercase">upload pdf</DialogTitle>
            <DialogDescription className="lowercase">
              upload a pdf document to extract its text for ai context
            </DialogDescription>
          </DialogHeader>
          <PDFUpload
            onUploadComplete={() => {
              setUploadDialogOpen(false)
              queryClient.invalidateQueries({ queryKey: ['pdfs'] })
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="glass-strong border-0">
          <DialogHeader>
            <DialogTitle className="lowercase">delete pdf</DialogTitle>
            <DialogDescription className="lowercase">
              are you sure you want to delete "{deleteTarget?.filename}"? this action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              className="lowercase"
            >
              cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && deletePdf.mutate(deleteTarget.id)}
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

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'success':
      return (
        <Badge variant="outline" className="gap-1 text-[10px] text-emerald-500 border-emerald-500/30 lowercase">
          <CheckCircle2 className="w-3 h-3" />
          extracted
        </Badge>
      )
    case 'failed':
      return (
        <Badge variant="outline" className="gap-1 text-[10px] text-destructive border-destructive/30 lowercase">
          <XCircle className="w-3 h-3" />
          failed
        </Badge>
      )
    default:
      return (
        <Badge variant="outline" className="gap-1 text-[10px] text-amber-500 border-amber-500/30 lowercase">
          <Clock className="w-3 h-3" />
          pending
        </Badge>
      )
  }
}
