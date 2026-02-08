import { useState, useMemo } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus,
  MessageSquare,
  Trash2,
  ChevronLeft,
  ChevronRight,
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

export const Route = createFileRoute('/dashboard/chat')({
  component: ChatPage,
})

// =============================================================================
// Main Component
// =============================================================================

function ChatPage() {
  const queryClient = useQueryClient()
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [setupDialogOpen, setSetupDialogOpen] = useState(false)

  // Fetch conversations
  const { data: conversationsData, isLoading } = useQuery({
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

  // Get the active conversation's primary class for brain viewer
  const activeConv = conversations.find((c) => c.id === activeConversationId)
  const primaryClassId =
    activeConv && activeConv.context_class_ids?.length === 1
      ? activeConv.context_class_ids[0]
      : undefined

  return (
    <div className="flex h-[calc(100vh-120px)] gap-4">
      {/* Sidebar */}
      {sidebarOpen && (
        <div className="w-72 flex-shrink-0 flex flex-col gap-3 overflow-hidden">
          {/* New chat button */}
          <Button
            onClick={() => setSetupDialogOpen(true)}
            className="w-full gap-2 lowercase"
          >
            <Plus className="w-4 h-4" />
            new chat
          </Button>

          {/* Conversation list */}
          <div className="glass-card flex-1 overflow-y-auto">
            <div className="p-2 space-y-0.5">
              {isLoading ? (
                <div className="space-y-2 p-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-12 w-full rounded-lg" />
                  ))}
                </div>
              ) : conversations.length === 0 ? (
                <div className="p-4 text-center">
                  <MessageSquare className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground/50 lowercase">
                    no conversations yet
                  </p>
                </div>
              ) : (
                conversations.map((conv) => (
                  <ConversationItem
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
          </div>

          {/* Brain viewer */}
          {primaryClassId && <BrainViewer classId={primaryClassId} />}
        </div>
      )}

      {/* Sidebar toggle */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="hidden lg:flex flex-shrink-0 w-6 items-center justify-center hover:bg-muted/30 rounded transition-colors"
        title={sidebarOpen ? 'hide sidebar' : 'show sidebar'}
      >
        {sidebarOpen ? (
          <ChevronLeft className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {/* Chat area */}
      <div className="flex-1 glass-card overflow-hidden flex flex-col">
        {activeConversationId ? (
          <ChatInterface conversationId={activeConversationId} />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-4">
              <MessageSquare className="w-12 h-12 text-muted-foreground/30 mx-auto" />
              <div>
                <h2 className="text-lg font-semibold text-foreground lowercase">
                  helm chat
                </h2>
                <p className="text-sm text-muted-foreground lowercase mt-1">
                  select a conversation or start a new one
                </p>
              </div>
              <Button
                onClick={() => setSetupDialogOpen(true)}
                className="gap-2 lowercase"
              >
                <Plus className="w-4 h-4" />
                new chat
              </Button>
            </div>
          </div>
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
// Conversation Item
// =============================================================================

function ConversationItem({
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
          ? 'bg-primary/10 text-foreground'
          : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground'
      }`}
      onClick={onClick}
    >
      <MessageSquare className="w-4 h-4 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate lowercase">{conversation.title}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          {primaryClass && (
            <span className="inline-flex items-center gap-1 text-[9px] text-muted-foreground/70">
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
            <span className="text-[9px] text-muted-foreground/50">
              {contextCount} items
            </span>
          )}
          <span className="text-[9px] text-muted-foreground/40">
            {formatDistanceToNow(new Date(conversation.updated_at), { addSuffix: true })}
          </span>
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        className="hidden group-hover:flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-destructive transition-colors"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  )
}
