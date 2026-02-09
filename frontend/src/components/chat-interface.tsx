import { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Send,
  Loader2,
  Eye,
  RotateCcw,
  X,
  Plus,
  GraduationCap,
  FileUp,
  StickyNote,
  BookOpen,
} from 'lucide-react'
import Markdown from 'react-markdown'

import {
  chatApi,
  classesApi,
  pdfApi,
  notesApi,
  assignmentsApi,
  type ChatMessage,
  type ConversationWithMessages,
  type ConversationUpdateContextRequest,
} from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { ContextSelector, type ChatContext } from '@/components/context-selector'

interface ChatInterfaceProps {
  conversationId: string
}

export function ChatInterface({ conversationId }: ChatInterfaceProps) {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const userInitials = user?.name
    ? user.name.split(' ').map((n) => n[0]).join('').toLowerCase().slice(0, 2)
    : '?'
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([])
  const [error, setError] = useState<string | null>(null)
  const [lastFailedMessage, setLastFailedMessage] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Fetch conversation with messages
  const { data: conversation, isLoading, isError: isConversationError, refetch: refetchConversation } = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: () => chatApi.getConversation(conversationId),
  })

  // Sync server messages into local state
  useEffect(() => {
    if (conversation?.messages) {
      setLocalMessages(conversation.messages)
    }
  }, [conversation?.messages])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [localMessages, streamingContent])

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`
  }

  const sendMessageText = useCallback(async (message: string) => {
    if (!message || isStreaming) return

    setError(null)
    setLastFailedMessage(null)
    setIsStreaming(true)
    setStreamingContent('')

    // Add user message optimistically
    const userMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      conversation_id: conversationId,
      role: 'user',
      content: message,
      created_at: new Date().toISOString(),
    }
    setLocalMessages((prev) => [...prev, userMsg])

    try {
      let fullResponse = ''

      for await (const chunk of chatApi.streamMessage(conversationId, message)) {
        fullResponse += chunk
        setStreamingContent(fullResponse)
      }

      // Add assistant message to local state
      const assistantMsg: ChatMessage = {
        id: `temp-${Date.now()}-assistant`,
        conversation_id: conversationId,
        role: 'assistant',
        content: fullResponse,
        created_at: new Date().toISOString(),
      }
      setLocalMessages((prev) => [...prev, assistantMsg])
      setStreamingContent('')

      // Invalidate to sync with server
      queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] })
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to send message')
      setLastFailedMessage(message)
      setStreamingContent('')
    } finally {
      setIsStreaming(false)
    }
  }, [isStreaming, conversationId, queryClient])

  const sendMessage = useCallback(async () => {
    const message = input.trim()
    if (!message || isStreaming) return

    setInput('')

    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
    }

    await sendMessageText(message)
  }, [input, isStreaming, sendMessageText])

  const retryLastMessage = useCallback(() => {
    if (!lastFailedMessage) return
    // Remove the optimistic user message that failed
    setLocalMessages((prev) => prev.filter((m) => !(m.content === lastFailedMessage && m.role === 'user' && m.id.startsWith('temp-'))))
    setError(null)
    sendMessageText(lastFailedMessage)
  }, [lastFailedMessage, sendMessageText])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  // Context bar state
  const [showContextPopover, setShowContextPopover] = useState(false)

  // Fetch reference data for context chips
  const { data: classes = [] } = useQuery({
    queryKey: ['classes'],
    queryFn: () => classesApi.list(),
  })
  const { data: pdfsData } = useQuery({
    queryKey: ['pdfs'],
    queryFn: () => pdfApi.list(),
  })
  const allPdfs = pdfsData?.pdfs || []
  const { data: allNotes = [] } = useQuery({
    queryKey: ['notes'],
    queryFn: () => notesApi.list(),
  })
  const { data: allAssignments = [] } = useQuery({
    queryKey: ['assignments'],
    queryFn: () => assignmentsApi.list(),
  })

  // Update context mutation
  const updateContext = useMutation({
    mutationFn: (data: ConversationUpdateContextRequest) =>
      chatApi.updateContext(conversationId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] })
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
    },
  })

  // Build context chip data
  const contextChips = useMemo(() => {
    if (!conversation) return []
    const chips: Array<{ id: string; type: 'class' | 'assignment' | 'pdf' | 'note'; label: string; color?: string }> = []

    for (const id of conversation.context_class_ids || []) {
      const cls = classes.find((c) => c.id === id)
      chips.push({ id, type: 'class', label: cls?.code || cls?.name || 'class', color: cls?.color || undefined })
    }
    for (const id of conversation.context_assignment_ids || []) {
      const a = allAssignments.find((a) => a.id === id)
      chips.push({ id, type: 'assignment', label: a?.title || 'assignment' })
    }
    for (const id of conversation.context_pdf_ids || []) {
      const pdf = allPdfs.find((p) => p.id === id)
      chips.push({ id, type: 'pdf', label: pdf?.filename || 'pdf' })
    }
    for (const id of conversation.context_note_ids || []) {
      const note = allNotes.find((n) => n.id === id)
      chips.push({ id, type: 'note', label: note?.title || 'note' })
    }

    return chips
  }, [conversation, classes, allAssignments, allPdfs, allNotes])

  const removeContextItem = useCallback(
    (type: string, id: string) => {
      if (!conversation) return
      const data: ConversationUpdateContextRequest = {}
      if (type === 'class') {
        data.context_class_ids = (conversation.context_class_ids || []).filter((i) => i !== id)
      } else if (type === 'assignment') {
        data.context_assignment_ids = (conversation.context_assignment_ids || []).filter((i) => i !== id)
      } else if (type === 'pdf') {
        data.context_pdf_ids = (conversation.context_pdf_ids || []).filter((i) => i !== id)
      } else if (type === 'note') {
        data.context_note_ids = (conversation.context_note_ids || []).filter((i) => i !== id)
      }
      updateContext.mutate(data)
    },
    [conversation, updateContext]
  )

  const handleContextAdd = useCallback(
    (ctx: ChatContext) => {
      if (!conversation) return
      updateContext.mutate({
        context_class_ids: ctx.classIds,
        context_assignment_ids: ctx.assignmentIds,
        context_pdf_ids: ctx.pdfIds,
        context_note_ids: ctx.noteIds,
      })
      setShowContextPopover(false)
    },
    [conversation, updateContext]
  )

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
      </div>
    )
  }

  if (isConversationError) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-sm text-destructive lowercase">failed to load conversation</p>
          <Button variant="outline" size="sm" className="lowercase" onClick={() => refetchConversation()}>
            <RotateCcw className="w-3 h-3 mr-1.5" />
            retry
          </Button>
        </div>
      </div>
    )
  }

  const allMessages = localMessages

  return (
    <div className="flex flex-col h-full">
      {/* Context bar */}
      <ContextBar
        chips={contextChips}
        onRemove={removeContextItem}
        onAddClick={() => setShowContextPopover(!showContextPopover)}
        showPopover={showContextPopover}
        conversation={conversation}
        onContextChange={handleContextAdd}
        onClosePopover={() => setShowContextPopover(false)}
      />

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {allMessages.length === 0 && !isStreaming && (
          <div className="flex-1 flex items-center justify-center h-full">
            <div className="text-center space-y-2">
              <Eye className="w-10 h-10 text-muted-foreground/40 mx-auto" />
              <p className="text-sm text-muted-foreground lowercase">
                ask about your materials, notes, or assignments
              </p>
            </div>
          </div>
        )}

        {allMessages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} userInitials={userInitials} />
        ))}

        {/* Streaming response */}
        {isStreaming && streamingContent && (
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-7 h-7 rounded-full bg-foreground text-background flex items-center justify-center">
              <Eye className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0 prose prose-sm prose-invert max-w-none">
              <Markdown>{streamingContent}</Markdown>
            </div>
          </div>
        )}

        {/* Streaming indicator */}
        {isStreaming && !streamingContent && (
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-7 h-7 rounded-full bg-foreground text-background flex items-center justify-center">
              <Eye className="w-4 h-4" />
            </div>
            <div className="flex items-center gap-1.5 py-2">
              <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            <span className="lowercase flex-1">{error}</span>
            {lastFailedMessage && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs lowercase"
                onClick={retryLastMessage}
                aria-label="retry last message"
              >
                <RotateCcw className="w-3 h-3" />
                retry
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs lowercase"
              onClick={() => { setError(null); setLastFailedMessage(null) }}
              aria-label="dismiss error"
            >
              <X className="w-3 h-3" />
              dismiss
            </Button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-border/50 p-4">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            disabled={isStreaming}
            placeholder="ask about your materials..."
            rows={1}
            className="flex-1 resize-none rounded-lg border border-border/50 bg-muted/30 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 lowercase"
          />
          <Button
            size="icon"
            onClick={sendMessage}
            disabled={isStreaming || !input.trim()}
            className="h-11 w-11 flex-shrink-0"
            aria-label="send message"
          >
            {isStreaming ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground/50 mt-1.5 lowercase">
          shift+enter for new line
        </p>
      </div>
    </div>
  )
}

// =============================================================================
// Context Bar
// =============================================================================

function ContextBar({
  chips,
  onRemove,
  onAddClick,
  showPopover,
  conversation,
  onContextChange,
  onClosePopover,
}: {
  chips: Array<{ id: string; type: string; label: string; color?: string }>
  onRemove: (type: string, id: string) => void
  onAddClick: () => void
  showPopover: boolean
  conversation: ConversationWithMessages | undefined
  onContextChange: (ctx: ChatContext) => void
  onClosePopover: () => void
}) {
  const chipIcon = (type: string) => {
    switch (type) {
      case 'class':
        return <GraduationCap className="w-3 h-3" />
      case 'assignment':
        return <BookOpen className="w-3 h-3" />
      case 'pdf':
        return <FileUp className="w-3 h-3" />
      case 'note':
        return <StickyNote className="w-3 h-3" />
      default:
        return null
    }
  }

  return (
    <div className="border-b border-border/30 relative">
      <div className="flex items-center gap-1.5 px-4 py-2 overflow-x-auto">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider flex-shrink-0">
          context
        </span>

        {chips.length === 0 && (
          <span className="text-[10px] text-muted-foreground/50 lowercase">none</span>
        )}

        {chips.map((chip) => (
          <span
            key={`${chip.type}-${chip.id}`}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted/40 text-[10px] text-foreground lowercase flex-shrink-0"
          >
            {chip.color && (
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: chip.color }}
              />
            )}
            {!chip.color && chipIcon(chip.type)}
            <span className="max-w-[100px] truncate">{chip.label}</span>
            <button
              onClick={() => onRemove(chip.type, chip.id)}
              className="hover:text-destructive transition-colors"
              aria-label={`remove ${chip.label} from context`}
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </span>
        ))}

        <button
          onClick={onAddClick}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full hover:bg-muted/30 text-[10px] text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
          aria-label="add context item"
        >
          <Plus className="w-3 h-3" />
          add
        </button>
      </div>

      {/* Context selector popover */}
      {showPopover && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 mx-2 sm:mx-4 max-w-[calc(100vw-1rem)] sm:max-w-none">
          <div className="glass-strong rounded-lg p-3 shadow-lg border border-border/30 max-h-[min(300px,50vh)] overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground lowercase">
                add to context
              </span>
              <button
                onClick={onClosePopover}
                className="text-muted-foreground hover:text-foreground"
                aria-label="close context selector"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <ContextSelector
              onContextChange={onContextChange}
              initialContext={
                conversation
                  ? {
                      classIds: conversation.context_class_ids || [],
                      assignmentIds: conversation.context_assignment_ids || [],
                      pdfIds: conversation.context_pdf_ids || [],
                      noteIds: conversation.context_note_ids || [],
                    }
                  : undefined
              }
            />
          </div>
        </div>
      )}
    </div>
  )
}

// =============================================================================
// Message Bubble
// =============================================================================

const MessageBubble = memo(function MessageBubble({ message, userInitials }: { message: ChatMessage; userInitials: string }) {
  const isUser = message.role === 'user'

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      {isUser ? (
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-accent flex items-center justify-center">
          <span className="text-[10px] font-semibold text-accent-foreground leading-none">
            {userInitials}
          </span>
        </div>
      ) : (
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-foreground text-background flex items-center justify-center">
          <Eye className="w-4 h-4" />
        </div>
      )}
      <div
        className={`flex-1 min-w-0 ${
          isUser ? 'text-right' : ''
        }`}
      >
        <div
          className={`inline-block rounded-lg px-4 py-2.5 text-sm max-w-[85%] ${
            isUser
              ? 'bg-primary text-primary-foreground text-left'
              : 'bg-muted/50 text-foreground text-left'
          }`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="prose prose-sm prose-invert max-w-none">
              <Markdown>{message.content}</Markdown>
            </div>
          )}
        </div>
      </div>
    </div>
  )
})
