import React, { useState, useRef, useEffect } from 'react';
import { callPuterChat } from '../lib/puter-client';
import callClaudeChat from '../lib/claude-client';
import { getStoredProviderKey } from '../lib/ai-config';
import { X, Paperclip, Trash2 } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ClaudeChatBoxProps {
  className?: string;
  style?: React.CSSProperties;
  onClose?: () => void;
  /** Prefill the input with this prompt when the chat opens */
  initialPrompt?: string | undefined;
}

const ClaudeChatBox: React.FC<ClaudeChatBoxProps> = ({ className, style, onClose, initialPrompt }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [attachedFile, setAttachedFile] = useState<{ dataUrl: string; name: string; type: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [chatProvider, setChatProvider] = useState<'puter' | 'claude' | 'gemini' | 'ollama' | 'huggingface' | 'groq'>((localStorage.getItem('chat_provider') as any) || 'puter');
  const [chatModel, setChatModel] = useState<string>((localStorage.getItem('chat_model') as string) || (localStorage.getItem('puter_model') || 'claude-sonnet-4-5'));
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatBoxRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState({ width: 500, height: 600 });
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // When the chat opens with an initial prompt, prefill the input and focus.
  useEffect(() => {
    if (initialPrompt) setInput(initialPrompt);
  }, [initialPrompt]);

  useEffect(() => {
    // Sync persisted chat provider/model
    const p = (localStorage.getItem('chat_provider') as any) || 'puter';
    const m = (localStorage.getItem('chat_model') as string) || (localStorage.getItem('puter_model') || 'claude-sonnet-4-5');
    setChatProvider(p);
    setChatModel(m);
  }, []);

  // Handle dragging
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('drag-handle')) {
      setIsDragging(true);
      const rect = chatBoxRef.current?.getBoundingClientRect();
      if (rect) {
        setDragOffset({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top
        });
      }
    }
  };

  // Handle resizing
  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      width: size.width,
      height: size.height
    });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setPosition({
          x: e.clientX - dragOffset.x,
          y: e.clientY - dragOffset.y
        });
      } else if (isResizing) {
        const newWidth = Math.max(300, resizeStart.width + (e.clientX - resizeStart.x));
        const newHeight = Math.max(400, resizeStart.height + (e.clientY - resizeStart.y));
        setSize({ width: newWidth, height: newHeight });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, dragOffset, resizeStart]);

  const sendMessage = async () => {
    if ((!input.trim() && !attachedFile) || isLoading) return;

    const userMessage: Message = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    // Build the outgoing prompt. If a file is attached, include it inline as
    // a markdown image or link so the model receives the data URL along with text.
    let promptToSend = input.trim();
    if (attachedFile) {
      if (attachedFile.type.startsWith('image/')) {
        promptToSend = `![${attachedFile.name}](${attachedFile.dataUrl})\n\n${promptToSend}`;
      } else {
        promptToSend = `[file: ${attachedFile.name}](${attachedFile.dataUrl})\n\n${promptToSend}`;
      }
    }

    try {
      let content = '';

      if (chatProvider === 'puter') {
        const model = (typeof window !== 'undefined' && localStorage.getItem('puter_model')) || 'claude-sonnet-4-5';
        const response = await callPuterChat(promptToSend, { model, stream: false });
        if (response?.message?.content?.[0]?.text) {
          content = response.message.content[0].text;
        } else if (response?.result?.message?.content?.[0]?.text) {
          content = response.result.message.content[0].text;
        } else {
          content = String(response || 'No response received');
        }
      } else if (chatProvider === 'claude') {
        const apiKey = getStoredProviderKey('claude') || localStorage.getItem('claude_api_key') || '';
        const model = chatModel || (localStorage.getItem('claude_model') as string) || 'claude-3-opus';
        const resp: any = await callClaudeChat(promptToSend, apiKey, { model });
        content = resp?.completion || resp?.output || resp?.completion?.text || String(resp || 'No response');
      } else {
        // Fallback: try Puter when other providers are selected for now
        const model = (typeof window !== 'undefined' && localStorage.getItem('puter_model')) || 'claude-sonnet-4-5';
        const response = await callPuterChat(promptToSend, { model, stream: false });
        content = response?.message?.content?.[0]?.text ?? response?.result?.message?.content?.[0]?.text ?? String(response || 'No response');
      }

      const assistantMessage: Message = {
        role: 'assistant',
        content,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage: Message = {
        role: 'assistant',
        content: 'Sorry, I encountered an error while processing your message. Please try again.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      // Clear attached file after sending
      setAttachedFile(null);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Handle pasted files (images or other files) from clipboard
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const file = item.getAsFile?.();
      if (file) {
        const reader = new FileReader();
        reader.onload = () => {
          setAttachedFile({ dataUrl: reader.result as string, name: file.name, type: file.type });
        };
        reader.readAsDataURL(file);
        // prevent the file blob from being pasted as raw content
        e.preventDefault();
        return;
      }
    }
  };

  // Handle file selection from attach button
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const handleAttachClick = () => fileInputRef.current?.click();
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setAttachedFile({ dataUrl: reader.result as string, name: file.name, type: file.type });
    reader.readAsDataURL(file);
    // clear selection so same file can be re-attached later
    e.currentTarget.value = '';
  };

  const clearChat = () => {
    setMessages([]);
  };

  return (
    <div
      ref={chatBoxRef}
      className={`claude-chat-box ${className || ''}`}
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        width: size.width,
        height: size.height,
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid #2b2b2b',
        borderRadius: '8px',
        backgroundColor: '#151515',
        color: '#ffffff',
        boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5)',
        zIndex: 1000,
        cursor: isDragging ? 'grabbing' : 'default',
        ...style
      }}
    >
      {/* Header - Drag Handle */}
      <div
        className="drag-handle"
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid #2b2b2b',
          backgroundColor: '#1a1a1a',
          borderRadius: '8px 8px 0 0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'grab'
        }}
        onMouseDown={handleMouseDown}
      >
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#ffffff' }}>
            Chat
          </h3>
          <select
            value={chatProvider}
            onChange={(e) => {
              const v = e.target.value as any;
              setChatProvider(v);
              localStorage.setItem('chat_provider', v);
              // Load provider-specific saved model when switching
              const providerModelKey = v === 'claude' ? 'claude_model' : v === 'puter' ? 'puter_model' : 'chat_model';
              const savedModel = localStorage.getItem(providerModelKey) || localStorage.getItem('chat_model') || '';
              setChatModel(savedModel || '');
              localStorage.setItem('chat_model', savedModel || '');
            }}
            style={{ background: 'transparent', color: '#c7c7c7', border: '1px solid #2b2b2b', borderRadius: 6, padding: '6px' }}
          >
            <option value="puter">Puter</option>
            <option value="claude">Claude</option>
            <option value="gemini">Gemini</option>
            <option value="ollama">Ollama</option>
            <option value="huggingface">HuggingFace</option>
            <option value="groq">Groq</option>
          </select>
          <input
            value={chatModel}
            onChange={(e) => {
              const v = e.target.value;
              setChatModel(v);
              localStorage.setItem('chat_model', v);
              if (chatProvider === 'claude') localStorage.setItem('claude_model', v);
              if (chatProvider === 'puter') localStorage.setItem('puter_model', v);
            }}
            placeholder="model (optional)"
            style={{ background: 'transparent', color: '#c7c7c7', border: '1px solid #2b2b2b', borderRadius: 6, padding: '6px 8px', minWidth: 140 }}
          />
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={clearChat}
            style={{
              background: 'none',
              border: 'none',
              color: '#6b7280',
              cursor: 'pointer',
              fontSize: '14px',
              padding: '4px 8px',
              borderRadius: '4px'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#2b2b2b'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            Clear
          </button>
          {onClose && (
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: '#6b7280',
                cursor: 'pointer',
                fontSize: '16px',
                padding: '4px',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#2b2b2b'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              title="Close chat"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }}>
        {messages.length === 0 ? (
          <div style={{
            textAlign: 'center',
            color: '#6b7280',
            fontSize: '14px',
            marginTop: '40px'
          }}>
            Start a conversation with {chatProvider} AI
          </div>
        ) : (
          messages.map((message, index) => (
            <div
              key={index}
              style={{
                display: 'flex',
                justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start'
              }}
            >
              <div style={{
                maxWidth: '70%',
                padding: '8px 12px',
                borderRadius: '12px',
                backgroundColor: message.role === 'user' ? '#6b21a8' : '#1a1a1a',
                color: '#ffffff',
                fontSize: '14px',
                lineHeight: '1.4',
                wordWrap: 'break-word',
                border: '1px solid #2b2b2b'
              }}>
                {message.content}
              </div>
            </div>
          ))
        )}
        {isLoading && (
          <div style={{
            display: 'flex',
            justifyContent: 'flex-start'
          }}>
            <div style={{
              padding: '8px 12px',
              borderRadius: '12px',
              backgroundColor: '#1a1a1a',
              color: '#6b7280',
              fontSize: '14px',
              border: '1px solid #2b2b2b'
            }}>
              Claude is typing...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{
        padding: '12px 16px',
        borderTop: '1px solid #2b2b2b',
        backgroundColor: '#1a1a1a',
        borderRadius: '0 0 8px 8px'
      }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPaste={handlePaste}
            onKeyPress={handleKeyPress}
            placeholder="Type your message..."
            disabled={isLoading}
            style={{
              flex: 1,
              padding: '8px 12px',
              border: '1px solid #2b2b2b',
              borderRadius: '6px',
              fontSize: '14px',
              backgroundColor: '#151515',
              color: '#ffffff',
              resize: 'vertical',
              minHeight: '36px',
              maxHeight: '120px',
              outline: 'none'
            }}
            rows={1}
          />
            <input ref={fileInputRef} type="file" accept="*/*" style={{ display: 'none' }} onChange={handleFileChange} />
              <button
                onClick={handleAttachClick}
                title="Attach file"
              style={{
                padding: '8px',
                background: 'none',
                border: '1px solid #2b2b2b',
                borderRadius: 6,
                color: '#9ca3af'
              }}
            >
              <Paperclip size={14} />
            </button>
              {attachedFile && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {attachedFile.type.startsWith('image/') ? (
                    <div style={{ width: 48, height: 48, borderRadius: 6, overflow: 'hidden', border: '1px solid #2b2b2b' }}>
                      <img src={attachedFile.dataUrl} alt="attached" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                  ) : (
                    <div style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #2b2b2b', color: '#9ca3af' }}>{attachedFile.name}</div>
                  )}
                  <button
                    onClick={() => setAttachedFile(null)}
                    title="Remove attachment"
                    style={{ padding: '6px', background: 'none', border: 'none', color: '#9ca3af' }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}

              <button
                onClick={sendMessage}
                disabled={((!input.trim() && !attachedFile) || isLoading)}
              style={{
                padding: '8px 16px',
                  backgroundColor: ((!input.trim() && !attachedFile) || isLoading) ? '#2b2b2b' : '#6b21a8',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                  cursor: ((!input.trim() && !attachedFile) || isLoading) ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.2s'
              }}
            >
              {isLoading ? '...' : 'Send'}
            </button>
        </div>
      </div>

      {/* Resize Handle */}
      <div
        onMouseDown={handleResizeMouseDown}
        style={{
          position: 'absolute',
          bottom: 0,
          right: 0,
          width: '20px',
          height: '20px',
          cursor: 'nw-resize',
          backgroundColor: 'transparent'
        }}
      >
        <div style={{
          position: 'absolute',
          bottom: '2px',
          right: '2px',
          width: '0',
          height: '0',
          borderLeft: '8px solid transparent',
          borderBottom: '8px solid #6b7280'
        }} />
      </div>
    </div>
  );
};

export default ClaudeChatBox;