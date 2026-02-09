  ---
  Implementation Plan: PDF Context & AI Chat with Brain Memory

  Overview

  You'll build a system where:
  - Users upload PDFs to assignments/classes (stored in S3)
  - PDFs are extracted to text using PyMuPDF
  - Chat interface lets users select classes/assignments as context
  - Claude Sonnet 4.5 powers conversations with streaming responses
  - Brain memory system maintains:
    - Global brain (GLOBAL_BRAIN.md) - cross-class learning patterns, general preferences
    - Per-class brains ({class_id}_BRAIN.md) - class-specific concepts, preferences, recurring questions
  - Brains auto-update after conversations, on manual trigger, and when patterns emerge

  ---
  Phase 1: Backend - PDF Upload & Storage Setup

  Step 1.1: Install Dependencies

  Add to backend/pyproject.toml:
  dependencies = [
      # ... existing dependencies ...

      # AWS S3
      "boto3>=1.35.0",

      # PDF Processing
      "pymupdf>=1.24.0",  # Fast, great for academic PDFs

      # LLM
      "anthropic>=0.40.0",

      # Streaming
      "sse-starlette>=2.2.0",  # Server-Sent Events for streaming
  ]

  Step 1.2: Environment Variables

  Add to backend/.env:
  # AWS S3
  AWS_ACCESS_KEY_ID=your_access_key
  AWS_SECRET_ACCESS_KEY=your_secret_key
  AWS_S3_BUCKET=your-bucket-name
  AWS_S3_REGION=us-east-1

  # Anthropic
  ANTHROPIC_API_KEY=your_anthropic_key

  # Brain Storage
  BRAIN_STORAGE_PATH=/app/brains  # or S3 path

  Step 1.3: Create S3 Service

  Create backend/app/services/s3.py:
  import boto3
  from botocore.exceptions import ClientError
  from app.core.config import settings

  class S3Service:
      def __init__(self):
          self.s3_client = boto3.client(
              's3',
              aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
              aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
              region_name=settings.AWS_S3_REGION
          )
          self.bucket = settings.AWS_S3_BUCKET

      async def generate_presigned_upload_url(
          self,
          file_key: str,
          content_type: str = "application/pdf",
          expiration: int = 300
      ) -> dict:
          """Generate presigned URL for direct S3 upload"""
          return self.s3_client.generate_presigned_post(
              self.bucket,
              file_key,
              Fields={"Content-Type": content_type},
              Conditions=[
                  {"Content-Type": content_type},
                  ["content-length-range", 1, 10485760]  # 1 byte to 10MB
              ],
              ExpiresIn=expiration
          )

      async def download_pdf(self, file_key: str) -> bytes:
          """Download PDF from S3"""
          response = self.s3_client.get_object(Bucket=self.bucket, Key=file_key)
          return response['Body'].read()

      async def delete_pdf(self, file_key: str):
          """Delete PDF from S3"""
          self.s3_client.delete_object(Bucket=self.bucket, Key=file_key)

  s3_service = S3Service()

  ---
  Phase 2: Database Models

  Step 2.1: Create PDF Model

  Create Alembic migration 007_add_pdfs_table.py:
  from alembic import op
  import sqlalchemy as sa
  from sqlalchemy.dialects.postgresql import UUID, ARRAY

  def upgrade():
      op.create_table(
          'pdfs',
          sa.Column('id', UUID(), primary_key=True),
          sa.Column('user_id', UUID(), sa.ForeignKey('users.id', ondelete='CASCADE')),
          sa.Column('class_id', UUID(), sa.ForeignKey('classes.id', ondelete='SET NULL'), nullable=True),
          sa.Column('assignment_id', UUID(), sa.ForeignKey('assignments.id', ondelete='SET NULL'), nullable=True),

          sa.Column('filename', sa.String(), nullable=False),
          sa.Column('s3_key', sa.String(), nullable=False, unique=True),
          sa.Column('content_type', sa.String(), default='application/pdf'),
          sa.Column('file_size_bytes', sa.Integer()),

          # Extracted content for LLM context
          sa.Column('extracted_text', sa.Text(), nullable=True),
          sa.Column('extraction_status', sa.String(), default='pending'),  # pending, success, failed
          sa.Column('page_count', sa.Integer(), nullable=True),

          sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
          sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now()),

          # Indexes
          sa.Index('idx_pdfs_user_id', 'user_id'),
          sa.Index('idx_pdfs_class_id', 'class_id'),
          sa.Index('idx_pdfs_assignment_id', 'assignment_id'),
      )

  Step 2.2: Create Chat Models

  Continue migration:
  def upgrade():
      # ... previous PDF table ...

      op.create_table(
          'chat_conversations',
          sa.Column('id', UUID(), primary_key=True),
          sa.Column('user_id', UUID(), sa.ForeignKey('users.id', ondelete='CASCADE')),
          sa.Column('title', sa.String(), default='New Conversation'),

          # Context - what PDFs/classes/assignments are in scope
          sa.Column('context_class_ids', ARRAY(UUID()), default=[]),
          sa.Column('context_assignment_ids', ARRAY(UUID()), default=[]),
          sa.Column('context_pdf_ids', ARRAY(UUID()), default=[]),

          sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
          sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now()),
      )

      op.create_table(
          'chat_messages',
          sa.Column('id', UUID(), primary_key=True),
          sa.Column('conversation_id', UUID(), sa.ForeignKey('chat_conversations.id', ondelete='CASCADE')),
          sa.Column('role', sa.String(), nullable=False),  # 'user' or 'assistant'
          sa.Column('content', sa.Text(), nullable=False),
          sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),

          sa.Index('idx_messages_conversation', 'conversation_id'),
      )

  Step 2.3: Create Brain Memory Model

  Continue migration:
  def upgrade():
      # ... previous tables ...

      op.create_table(
          'brain_memories',
          sa.Column('id', UUID(), primary_key=True),
          sa.Column('user_id', UUID(), sa.ForeignKey('users.id', ondelete='CASCADE')),
          sa.Column('class_id', UUID(), sa.ForeignKey('classes.id', ondelete='CASCADE'), nullable=True),

          # If class_id is NULL, this is the global brain
          sa.Column('brain_type', sa.String(), default='class'),  # 'global' or 'class'

          # The actual brain content (Markdown)
          sa.Column('content', sa.Text(), default=''),

          # Metadata
          sa.Column('last_updated_by_conversation_id', UUID(), nullable=True),
          sa.Column('update_count', sa.Integer(), default=0),
          sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
          sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now()),

          # Unique constraint: one global brain per user, one class brain per (user, class)
          sa.UniqueConstraint('user_id', 'class_id', 'brain_type'),
      )

  ---
  Phase 3: PDF Processing Service

  Step 3.1: Create PDF Extraction Service

  Create backend/app/services/pdf_processor.py:
  import pymupdf  # PyMuPDF
  from io import BytesIO

  class PDFProcessor:
      @staticmethod
      async def extract_text(pdf_bytes: bytes) -> dict:
          """Extract text from PDF bytes"""
          try:
              doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")

              text_pages = []
              for page_num in range(len(doc)):
                  page = doc[page_num]
                  text = page.get_text()
                  text_pages.append(text)

              full_text = "\n\n".join(text_pages)

              return {
                  "text": full_text,
                  "page_count": len(doc),
                  "status": "success"
              }
          except Exception as e:
              return {
                  "text": "",
                  "page_count": 0,
                  "status": "failed",
                  "error": str(e)
              }

  pdf_processor = PDFProcessor()

  ---
  Phase 4: LLM Chat Service with Brain Memory

  Step 4.1: Create Brain Manager

  Create backend/app/services/brain_manager.py:
  from anthropic import AsyncAnthropic
  from app.db.models import BrainMemory, ChatConversation

  class BrainManager:
      def __init__(self):
          self.client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

      async def get_or_create_brain(
          self,
          user_id: UUID,
          class_id: UUID | None = None
      ) -> BrainMemory:
          """Get existing brain or create new one"""
          # Implementation to fetch/create brain from DB
          pass

      async def update_brain_after_conversation(
          self,
          brain: BrainMemory,
          conversation_history: list[dict],
          user_id: UUID
      ):
          """Analyze conversation and update brain with Claude"""

          # Prepare prompt for Claude to analyze and update brain
          system_prompt = f"""You are a memory system for a student assistant.

  Current brain content:
  {brain.content}

  Analyze the conversation and update the brain with:
  1. New concepts or topics learned
  2. Preferences or patterns (study habits, question types)
  3. Recurring questions or difficulties
  4. Important insights

  Return ONLY the updated brain content as Markdown. Be concise."""

          # Call Claude to analyze
          message = await self.client.messages.create(
              model="claude-sonnet-4-5-20250515",
              max_tokens=2000,
              system=system_prompt,
              messages=conversation_history[-10:]  # Last 10 messages for context
          )

          updated_content = message.content[0].text

          # Save updated brain
          brain.content = updated_content
          brain.update_count += 1
          # Save to DB...

      async def detect_pattern_update(
          self,
          conversation_history: list[dict],
          brain: BrainMemory
      ) -> bool:
          """Detect if a pattern has emerged that warrants brain update"""
          # Simple heuristic: update every 5 messages, or on explicit keywords
          message_count = len(conversation_history)

          # Check for explicit memory triggers
          last_message = conversation_history[-1]["content"].lower()
          if any(keyword in last_message for keyword in ["remember", "important", "always", "prefer"]):
              return True

          # Update every 5 user messages
          return message_count % 10 == 0

  brain_manager = BrainManager()

  Step 4.2: Create Chat Service with Streaming

  Create backend/app/services/chat_service.py:
  from anthropic import AsyncAnthropic
  import anthropic

  class ChatService:
      def __init__(self):
          self.client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

      async def build_context(
          self,
          class_ids: list[UUID],
          assignment_ids: list[UUID],
          pdf_ids: list[UUID],
          user_id: UUID
      ) -> str:
          """Build context from PDFs and brains"""
          context_parts = []

          # 1. Load global brain
          global_brain = await brain_manager.get_or_create_brain(user_id, None)
          if global_brain.content:
              context_parts.append(f"# Global Knowledge\n{global_brain.content}\n")

          # 2. Load class brains
          for class_id in class_ids:
              class_brain = await brain_manager.get_or_create_brain(user_id, class_id)
              if class_brain.content:
                  context_parts.append(f"# Class Brain\n{class_brain.content}\n")

          # 3. Load PDF content
          pdfs = await get_pdfs_by_ids(pdf_ids)  # Fetch from DB
          for pdf in pdfs:
              if pdf.extracted_text:
                  context_parts.append(f"# {pdf.filename}\n{pdf.extracted_text}\n")

          return "\n\n".join(context_parts)

      async def stream_response(
          self,
          user_message: str,
          conversation_history: list[dict],
          context: str
      ):
          """Stream Claude response using SSE"""

          system_prompt = f"""You are a helpful AI tutor assistant.

  Context for this conversation:
  {context}

  Use the context to answer questions accurately. Reference specific materials when relevant."""

          # Build messages
          messages = conversation_history + [{"role": "user", "content": user_message}]

          # Stream response
          async with self.client.messages.stream(
              model="claude-sonnet-4-5-20250515",
              max_tokens=4000,
              system=system_prompt,
              messages=messages
          ) as stream:
              async for text in stream.text_stream:
                  yield text

  chat_service = ChatService()

  ---
  Phase 5: Backend API Endpoints

  Step 5.1: PDF Upload Endpoints

  Create backend/app/api/routes/pdfs.py:
  from fastapi import APIRouter, Depends, UploadFile
  from app.services.s3 import s3_service
  from app.services.pdf_processor import pdf_processor

  router = APIRouter(prefix="/pdfs", tags=["pdfs"])

  @router.post("/upload-url")
  async def get_upload_url(
      filename: str,
      class_id: UUID | None = None,
      assignment_id: UUID | None = None,
      user: User = Depends(get_current_user)
  ):
      """Generate presigned URL for PDF upload"""

      # Generate unique S3 key
      file_key = f"users/{user.id}/pdfs/{uuid4()}_{filename}"

      # Get presigned URL
      presigned = await s3_service.generate_presigned_upload_url(file_key)

      # Create PDF record in DB (status='pending')
      pdf = await create_pdf_record(
          user_id=user.id,
          filename=filename,
          s3_key=file_key,
          class_id=class_id,
          assignment_id=assignment_id
      )

      return {
          "upload_url": presigned["url"],
          "fields": presigned["fields"],
          "pdf_id": pdf.id
      }

  @router.post("/{pdf_id}/process")
  async def process_pdf(
      pdf_id: UUID,
      user: User = Depends(get_current_user)
  ):
      """Extract text from uploaded PDF"""

      pdf = await get_pdf_by_id(pdf_id)

      # Download from S3
      pdf_bytes = await s3_service.download_pdf(pdf.s3_key)

      # Extract text
      result = await pdf_processor.extract_text(pdf_bytes)

      # Update PDF record
      await update_pdf_extraction(
          pdf_id,
          text=result["text"],
          page_count=result["page_count"],
          status=result["status"]
      )

      return {"status": "success", "page_count": result["page_count"]}

  @router.get("/")
  async def list_pdfs(
      class_id: UUID | None = None,
      assignment_id: UUID | None = None,
      user: User = Depends(get_current_user)
  ):
      """List user's PDFs"""
      # Implementation...
      pass

  @router.delete("/{pdf_id}")
  async def delete_pdf(
      pdf_id: UUID,
      user: User = Depends(get_current_user)
  ):
      """Delete PDF"""
      # Delete from S3 and DB...
      pass

  Step 5.2: Chat Endpoints with Streaming

  Create backend/app/api/routes/chat.py:
  from fastapi import APIRouter, Depends
  from sse_starlette.sse import EventSourceResponse
  from app.services.chat_service import chat_service

  router = APIRouter(prefix="/chat", tags=["chat"])

  @router.post("/conversations")
  async def create_conversation(
      context_class_ids: list[UUID] = [],
      context_assignment_ids: list[UUID] = [],
      context_pdf_ids: list[UUID] = [],
      user: User = Depends(get_current_user)
  ):
      """Create new chat conversation"""
      conversation = await create_chat_conversation(
          user_id=user.id,
          context_class_ids=context_class_ids,
          context_assignment_ids=context_assignment_ids,
          context_pdf_ids=context_pdf_ids
      )
      return conversation

  @router.post("/conversations/{conversation_id}/messages/stream")
  async def stream_chat_message(
      conversation_id: UUID,
      message: str,
      user: User = Depends(get_current_user)
  ):
      """Stream chat response using SSE"""

      conversation = await get_conversation(conversation_id)

      # Build context
      context = await chat_service.build_context(
          conversation.context_class_ids,
          conversation.context_assignment_ids,
          conversation.context_pdf_ids,
          user.id
      )

      # Get conversation history
      history = await get_conversation_messages(conversation_id)

      # Save user message
      await save_message(conversation_id, "user", message)

      async def event_generator():
          full_response = ""

          async for chunk in chat_service.stream_response(message, history, context):
              full_response += chunk
              yield {
                  "event": "message",
                  "data": chunk
              }

          # Save assistant response
          await save_message(conversation_id, "assistant", full_response)

          # Update brain after conversation
          updated_history = history + [
              {"role": "user", "content": message},
              {"role": "assistant", "content": full_response}
          ]

          # Update class brains
          for class_id in conversation.context_class_ids:
              brain = await brain_manager.get_or_create_brain(user.id, class_id)

              # Check if pattern emerged
              should_update = await brain_manager.detect_pattern_update(updated_history, brain)
              if should_update:
                  await brain_manager.update_brain_after_conversation(brain, updated_history, user.id)

          # Update global brain
          global_brain = await brain_manager.get_or_create_brain(user.id, None)
          should_update = await brain_manager.detect_pattern_update(updated_history, global_brain)
          if should_update:
              await brain_manager.update_brain_after_conversation(global_brain, updated_history, user.id)

          yield {"event": "done", "data": ""}

      return EventSourceResponse(event_generator())

  @router.post("/conversations/{conversation_id}/update-brain")
  async def manually_update_brain(
      conversation_id: UUID,
      user: User = Depends(get_current_user)
  ):
      """Manually trigger brain update"""
      conversation = await get_conversation(conversation_id)
      history = await get_conversation_messages(conversation_id)

      # Update brains
      for class_id in conversation.context_class_ids:
          brain = await brain_manager.get_or_create_brain(user.id, class_id)
          await brain_manager.update_brain_after_conversation(brain, history, user.id)

      return {"status": "updated"}

  @router.get("/brains/{class_id}")
  async def get_brain_content(
      class_id: UUID | None = None,  # None = global brain
      user: User = Depends(get_current_user)
  ):
      """View brain content"""
      brain = await brain_manager.get_or_create_brain(user.id, class_id)
      return {"content": brain.content, "update_count": brain.update_count}

  ---
  Phase 6: Frontend - React Components

  Step 6.1: PDF Upload Component

  Create frontend/src/components/pdf-upload.tsx:
  import { useMutation, useQueryClient } from '@tanstack/react-query'
  import { pdfApi } from '@/lib/api'

  export function PDFUpload({ classId, assignmentId }: { classId?: string, assignmentId?: string }) {
    const queryClient = useQueryClient()

    const uploadMutation = useMutation({
      mutationFn: async (file: File) => {
        // 1. Get presigned URL
        const { upload_url, fields, pdf_id } = await pdfApi.getUploadUrl(
          file.name, classId, assignmentId
        )

        // 2. Upload directly to S3
        const formData = new FormData()
        Object.entries(fields).forEach(([key, value]) => {
          formData.append(key, value)
        })
        formData.append('file', file)

        await fetch(upload_url, { method: 'POST', body: formData })

        // 3. Trigger text extraction
        await pdfApi.processPdf(pdf_id)

        return pdf_id
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['pdfs'] })
      }
    })

    return (
      <div>
        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) uploadMutation.mutate(file)
          }}
        />
        {uploadMutation.isPending && <p>Uploading and processing...</p>}
      </div>
    )
  }

  Step 6.2: Chat Interface with Streaming

  Create frontend/src/components/chat-interface.tsx:
  import { useState, useEffect } from 'react'
  import { chatApi } from '@/lib/api'

  export function ChatInterface({ conversationId }: { conversationId: string }) {
    const [messages, setMessages] = useState<Array<{role: string, content: string}>>([])
    const [input, setInput] = useState('')
    const [isStreaming, setIsStreaming] = useState(false)

    const sendMessage = async () => {
      if (!input.trim()) return

      // Add user message optimistically
      const userMessage = { role: 'user', content: input }
      setMessages(prev => [...prev, userMessage])
      setInput('')
      setIsStreaming(true)

      // Start streaming response
      const eventSource = new EventSource(
        `/api/chat/conversations/${conversationId}/messages/stream?message=${encodeURIComponent(input)}`
      )

      let assistantMessage = { role: 'assistant', content: '' }
      setMessages(prev => [...prev, assistantMessage])

      eventSource.addEventListener('message', (event) => {
        const chunk = event.data
        assistantMessage.content += chunk
        setMessages(prev => [...prev.slice(0, -1), { ...assistantMessage }])
      })

      eventSource.addEventListener('done', () => {
        eventSource.close()
        setIsStreaming(false)
      })

      eventSource.onerror = () => {
        eventSource.close()
        setIsStreaming(false)
      }
    }

    return (
      <div className="chat-container">
        <div className="messages">
          {messages.map((msg, i) => (
            <div key={i} className={`message ${msg.role}`}>
              {msg.content}
            </div>
          ))}
        </div>

        <div className="input-area">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
            disabled={isStreaming}
            placeholder="Ask about your materials..."
          />
          <button onClick={sendMessage} disabled={isStreaming}>
            {isStreaming ? 'Thinking...' : 'Send'}
          </button>
        </div>
      </div>
    )
  }

  Step 6.3: Context Selector

  Create frontend/src/components/context-selector.tsx:
  import { useQuery } from '@tanstack/react-query'
  import { classesApi, assignmentsApi, pdfApi } from '@/lib/api'

  export function ContextSelector({
    onContextChange
  }: {
    onContextChange: (context: {classIds: string[], assignmentIds: string[], pdfIds: string[]}) => void
  }) {
    const [selectedClasses, setSelectedClasses] = useState<string[]>([])
    const [selectedAssignments, setSelectedAssignments] = useState<string[]>([])
    const [selectedPdfs, setSelectedPdfs] = useState<string[]>([])

    const { data: classes } = useQuery({
      queryKey: ['classes'],
      queryFn: () => classesApi.list()
    })

    useEffect(() => {
      onContextChange({
        classIds: selectedClasses,
        assignmentIds: selectedAssignments,
        pdfIds: selectedPdfs
      })
    }, [selectedClasses, selectedAssignments, selectedPdfs])

    return (
      <div className="context-selector">
        <h3>Select Context</h3>

        <div className="classes">
          {classes?.map(cls => (
            <label key={cls.id}>
              <input
                type="checkbox"
                checked={selectedClasses.includes(cls.id)}
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedClasses([...selectedClasses, cls.id])
                  } else {
                    setSelectedClasses(selectedClasses.filter(id => id !== cls.id))
                  }
                }}
              />
              {cls.name}
            </label>
          ))}
        </div>

        {/* Similar for assignments and PDFs */}
      </div>
    )
  }

  Step 6.4: Brain Viewer

  Create frontend/src/components/brain-viewer.tsx:
  import { useQuery } from '@tanstack/react-query'
  import { chatApi } from '@/lib/api'
  import ReactMarkdown from 'react-markdown'

  export function BrainViewer({ classId }: { classId?: string }) {
    const { data: brain } = useQuery({
      queryKey: ['brain', classId],
      queryFn: () => chatApi.getBrain(classId)
    })

    return (
      <div className="brain-viewer glass-card p-6">
        <h2 className="text-xl font-bold lowercase mb-4">
          {classId ? 'class brain' : 'global brain'}
        </h2>

        <div className="mb-2 text-sm text-muted-foreground">
          Updated {brain?.update_count || 0} times
        </div>

        <div className="prose prose-sm">
          <ReactMarkdown>
            {brain?.content || '*No memories yet. Start chatting to build your brain!*'}
          </ReactMarkdown>
        </div>
      </div>
    )
  }

  ---
  Phase 7: Integration & Polish

  Step 7.1: Add Chat Route

  Create frontend/src/routes/dashboard/chat.tsx:
  export const Route = createFileRoute('/dashboard/chat')({
    component: ChatPage,
  })

  function ChatPage() {
    const [conversationId, setConversationId] = useState<string>()
    const [context, setContext] = useState({})

    const createConversation = async () => {
      const conv = await chatApi.createConversation(context)
      setConversationId(conv.id)
    }

    return (
      <div className="chat-page">
        <div className="sidebar">
          <ContextSelector onContextChange={setContext} />
          <button onClick={createConversation}>New Chat</button>
          <BrainViewer />
        </div>

        <div className="main">
          {conversationId && <ChatInterface conversationId={conversationId} />}
        </div>
      </div>
    )
  }

  Step 7.2: Add PDF Management to Classes/Assignments

  Update class/assignment detail pages to show PDF upload and list.

  ---
  Summary of Implementation Order

  1. ✅ Backend Setup (Phase 1-2): S3, PDF models, Chat models, Brain models
  2. ✅ PDF Processing (Phase 3): PyMuPDF extraction service
  3. ✅ LLM Integration (Phase 4): Claude API, Brain manager, Streaming chat
  4. ✅ API Endpoints (Phase 5): PDF upload, Chat with SSE, Brain viewing
  5. ✅ Frontend (Phase 6): Upload component, Chat UI, Context selector
  6. ✅ Polish (Phase 7): Routes, integration, testing

  ---
  Key Technical Decisions
  Component: PDF Storage
  Choice: S3 with presigned URLs
  Reason: https://dev.to/copubah/how-i-built-a-secure-file-upload-api-using-fastapi-and-aws-s3-presigned-urls-7eg
  ────────────────────────────────────────
  Component: PDF Extraction
  Choice: PyMuPDF
  Reason: https://onlyoneaman.medium.com/i-tested-7-python-pdf-extractors-so-you-dont-have-to-2025-edition-c88013922257
  ────────────────────────────────────────
  Component: LLM
  Choice: Claude Sonnet 4.5
  Reason: https://platform.claude.com/docs/en/about-claude/models/overview
  ────────────────────────────────────────
  Component: Brain System
  Choice: Markdown files in DB
  Reason: https://manthanguptaa.in/posts/clawdbot_memory/, human-readable
  ────────────────────────────────────────
  Component: Streaming
  Choice: SSE with EventSourceResponse
  Reason: https://github.com/assistant-ui/assistant-ui
  ────────────────────────────────────────
  Component: Context Strategy
  Choice: Full text extraction
  Reason: Best for lecture notes/psets under 100 pages
  ---
  Estimated Implementation Time

  - Phase 1-2: 4-6 hours (Backend setup, models)
  - Phase 3: 2-3 hours (PDF processing)
  - Phase 4: 4-5 hours (LLM + Brain logic)
  - Phase 5: 4-5 hours (API endpoints)
  - Phase 6: 6-8 hours (Frontend components)
  - Phase 7: 2-3 hours (Integration)

  Total: ~25-30 hours of focused development

  ---
  Ready to start implementation! Any questions or clarifications needed? 🚀




To get online we need:
- setup AWS
- add environment variables
- migrate the database