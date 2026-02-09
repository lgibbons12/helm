import { useState, useMemo } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus,
  Eye,
  MessageSquare,
  Trash2,
  Brain,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

import { chatApi, classesApi, type Conversation } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { ChatInterface } from '@/components/chat-interface'
import { BrainViewer } from '@/components/brain-viewer'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ConversationSetupDialog,
  type ConversationSetupResult,
} from '@/components/conversation-setup'

// =============================================================================
// Route
// =============================================================================

export const Route = createFileRoute('/dashboard/odin')({
  component: OdinPage,
})

// =============================================================================
// Full-Screen Odin Experience
// =============================================================================

function OdinPage() {
  const queryClient = useQueryClient()
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [setupDialogOpen, setSetupDialogOpen] = useState(false)
  const [showBrain, setShowBrain] = useState(false)

  // Fetch conversations
  const { data: conversationsData, isLoading, isError: isConversationsError, refetch: refetchConversations } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => chatApi.listConversations(),
  })
  const conversations = conversationsData?.conversations || []

  // Fetch classes for context chips
  const { data: classes = [] } = useQuery({
    queryKey: ['classes'],
    queryFn: () => classesApi.list(),
  })
  const classMap = useMemo(() => {
    const map: Record<string, { name: string; color?: string }> = {}
    for (const cls of classes) {
      map[cls.id] = { name: cls.code || cls.name, color: cls.color || undefined }
    }
    return map
  }, [classes])

  // Create conversation
  const createConversation = useMutation({
    mutationFn: (setup: ConversationSetupResult) =>
      chatApi.createConversation({
        title: setup.title,
        context_class_ids: setup.classIds,
        context_assignment_ids: setup.assignmentIds,
        context_pdf_ids: setup.pdfIds,
        context_note_ids: setup.noteIds,
      }),
    onSuccess: (conv) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
      setActiveConversationId(conv.id)
      setSetupDialogOpen(false)
    },
  })

  // Delete conversation
  const deleteConversation = useMutation({
    mutationFn: (id: string) => chatApi.deleteConversation(id),
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
      if (activeConversationId === deletedId) {
        setActiveConversationId(null)
      }
    },
  })

  // Active conversation's primary class for brain viewer
  const activeConv = conversations.find((c) => c.id === activeConversationId)
  const primaryClassId =
    activeConv && activeConv.context_class_ids?.length === 1
      ? activeConv.context_class_ids[0]
      : undefined

  return (
    <div className="-m-6 lg:-m-8 flex h-[calc(100vh-0px)] lg:h-screen">
      {/* ================================================================
          Left rail — conversation list
          ================================================================ */}
      <div className="w-64 lg:w-72 flex-shrink-0 border-r border-border/30 bg-background/50 flex flex-col">
        {/* Odin header */}
        <div className="px-4 pt-5 pb-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-foreground text-background flex items-center justify-center flex-shrink-0">
            <Eye className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold text-foreground lowercase tracking-wide">
              odin
            </h1>
            <p className="text-[10px] text-muted-foreground/70 lowercase">
              strategic advisor
            </p>
          </div>
        </div>

        {/* New session button */}
        <div className="px-3 pb-3">
          <Button
            onClick={() => setSetupDialogOpen(true)}
            className="w-full gap-2 lowercase"
            size="sm"
          >
            <Plus className="w-3.5 h-3.5" />
            new session
          </Button>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
          {isConversationsError ? (
            <div className="px-3 py-8 text-center space-y-2">
              <p className="text-[10px] text-destructive lowercase">
                failed to load sessions
              </p>
              <button
                onClick={() => refetchConversations()}
                className="text-[10px] text-muted-foreground hover:text-foreground lowercase underline"
              >
                retry
              </button>
            </div>
          ) : isLoading ? (
            <div className="space-y-2 px-2 pt-1">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          ) : conversations.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <MessageSquare className="w-6 h-6 text-muted-foreground/20 mx-auto mb-2" />
              <p className="text-[10px] text-muted-foreground/40 lowercase">
                no sessions yet
              </p>
            </div>
          ) : (
            conversations.map((conv) => (
              <ConversationRow
                key={conv.id}
                conversation={conv}
                classMap={classMap}
                isActive={activeConversationId === conv.id}
                onClick={() => setActiveConversationId(conv.id)}
                onDelete={() => deleteConversation.mutate(conv.id)}
              />
            ))
          )}
        </div>

        {/* Brain toggle */}
        {primaryClassId && (
          <div className="flex-shrink-0 border-t border-border/20">
            <button
              onClick={() => setShowBrain(!showBrain)}
              className={`w-full flex items-center gap-2 px-4 py-2.5 text-xs lowercase transition-colors ${
                showBrain
                  ? 'text-foreground bg-muted/30'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/20'
              }`}
            >
              <Brain className="w-3.5 h-3.5" />
              <span>brain memory</span>
            </button>
            {showBrain && (
              <div className="px-3 pb-3 max-h-[200px] overflow-y-auto">
                <BrainViewer classId={primaryClassId} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* ================================================================
          Main area — chat or landing
          ================================================================ */}
      <div className="flex-1 flex flex-col overflow-hidden bg-background">
        {activeConversationId ? (
          <ChatInterface conversationId={activeConversationId} />
        ) : (
          <OdinLanding
            conversationCount={conversations.length}
            onNewSession={() => setSetupDialogOpen(true)}
          />
        )}
      </div>

      {/* Setup wizard dialog */}
      <ConversationSetupDialog
        open={setupDialogOpen}
        onOpenChange={setSetupDialogOpen}
        onStart={(setup) => createConversation.mutate(setup)}
        isPending={createConversation.isPending}
      />
    </div>
  )
}

// =============================================================================
// Landing — shown when no conversation is active
// =============================================================================

function OdinLanding({
  conversationCount,
  onNewSession,
}: {
  conversationCount: number
  onNewSession: () => void
}) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center space-y-6 max-w-sm px-6">
        {/* Icon */}
        <div className="mx-auto w-20 h-20 rounded-full bg-foreground/[0.03] border border-border/20 flex items-center justify-center">
          <Eye className="w-10 h-10 text-muted-foreground/30" />
        </div>

        {/* Copy */}
        <div className="space-y-2">
          <h2 className="text-lg font-bold text-foreground lowercase tracking-wide">
            counsel awaits
          </h2>
          <p className="text-sm text-muted-foreground/60 lowercase leading-relaxed">
            choose your context — classes, deadlines, notes, documents.
            odin sees the full picture and speaks with clarity.
          </p>
        </div>

        {/* CTA */}
        <Button onClick={onNewSession} className="gap-2 lowercase">
          <Plus className="w-4 h-4" />
          begin session
        </Button>

        {conversationCount > 0 && (
          <p className="text-[10px] text-muted-foreground/40 lowercase">
            or select a past session from the left
          </p>
        )}
      </div>
    </div>
  )
}

// =============================================================================
// Conversation Row
// =============================================================================

function ConversationRow({
  conversation,
  classMap,
  isActive,
  onClick,
  onDelete,
}: {
  conversation: Conversation
  classMap: Record<string, { name: string; color?: string }>
  isActive: boolean
  onClick: () => void
  onDelete: () => void
}) {
  const contextCount =
    (conversation.context_pdf_ids?.length || 0) +
    (conversation.context_note_ids?.length || 0)
  const primaryClass = conversation.context_class_ids?.[0]
    ? classMap[conversation.context_class_ids[0]]
    : null

  return (
    <div
      className={`group flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
        isActive
          ? 'bg-foreground/5 text-foreground'
          : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground'
      }`}
      onClick={onClick}
    >
      <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 opacity-50" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate lowercase">{conversation.title}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          {primaryClass && (
            <span className="inline-flex items-center gap-1 text-[9px] text-muted-foreground/60">
              {primaryClass.color && (
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: primaryClass.color }}
                />
              )}
              {primaryClass.name}
            </span>
          )}
          {contextCount > 0 && (
            <span className="text-[9px] text-muted-foreground/40">
              {contextCount} items
            </span>
          )}
          <span className="text-[9px] text-muted-foreground/30">
            {formatDistanceToNow(new Date(conversation.updated_at), { addSuffix: true })}
          </span>
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        className="hidden group-hover:flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-destructive transition-colors"
        aria-label={`delete conversation ${conversation.title}`}
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  )
}
