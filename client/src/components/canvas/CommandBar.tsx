import React, { useState } from 'react';
import { Send, Sparkles, Command } from 'lucide-react';

interface CommandBarProps {
  onSubmit: (prompt: string, attachedFile?: { dataUrl: string; name: string; type: string } | null) => void;
  isLoading: boolean;
}

export const CommandBar: React.FC<CommandBarProps> = ({ onSubmit, isLoading }) => {
  const [prompt, setPrompt] = useState('');
  const [attachedFile, setAttachedFile] = useState<{ dataUrl: string; name: string; type: string } | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const handleAttachClick = () => fileInputRef.current?.click();
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setAttachedFile({ dataUrl: reader.result as string, name: file.name, type: file.type });
    reader.readAsDataURL(file);
    e.currentTarget.value = '';
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const file = item.getAsFile?.();
      if (file) {
        const reader = new FileReader();
        reader.onload = () => setAttachedFile({ dataUrl: reader.result as string, name: file.name, type: file.type });
        reader.readAsDataURL(file);
        e.preventDefault();
        return;
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (prompt.trim() || attachedFile) {
      onSubmit(prompt, attachedFile);
      setPrompt('');
      setAttachedFile(null);
    }
  };

  return (
    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 z-50">
      <form onSubmit={handleSubmit} className="relative group">
        <div className="absolute -inset-0.5 bg-gradient-to-r from-pink-500 to-violet-600 rounded-xl blur opacity-30 group-hover:opacity-75 transition duration-500"></div>
        <div className="relative flex items-center bg-[#1a1a1a]/90 backdrop-blur-xl border border-white/10 rounded-xl p-2 shadow-2xl">
          <div className="p-3 text-violet-400">
            {isLoading ? (
              <div className="animate-spin h-5 w-5 border-2 border-violet-500 border-t-transparent rounded-full" />
            ) : (
              <Sparkles className="w-5 h-5" />
            )}
          </div>
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onPaste={handlePaste}
            placeholder="Describe an element... (e.g., 'Create a blue box in the top right')"
            className="flex-1 bg-transparent border-none outline-none text-white placeholder-white/40 px-2 py-2 font-medium"
            autoFocus
          />
          <input ref={fileInputRef} type="file" accept="*/*" style={{ display: 'none' }} onChange={handleFileChange} />
          <button
            type="button"
            onClick={handleAttachClick}
            title="Attach file"
            className="p-3 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M21.44 11.05l-9.19 9.19a5.5 5.5 0 0 1-7.78-7.78l9.19-9.19a3.5 3.5 0 0 1 4.95 4.95l-9.19 9.19a1.5 1.5 0 0 1-2.12-2.12l7.07-7.07"/></svg>
          </button>

          {attachedFile && (
            <div className="flex items-center gap-2 ml-2">
              {attachedFile.type.startsWith('image/') ? (
                <div className="w-8 h-8 rounded-md overflow-hidden border border-white/10">
                  <img src={attachedFile.dataUrl} alt="attached" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="px-2 py-1 rounded-md border border-white/10 text-white/70">{attachedFile.name}</div>
              )}
              <button type="button" onClick={() => setAttachedFile(null)} className="p-2 text-white/50 hover:text-white">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M3 6h18"/><path d="M8 6v14a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
              </button>
            </div>
          )}
          <button 
            type="submit"
            disabled={!prompt.trim() || isLoading}
            className="p-3 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        
        {/* Helper Text */}
        <div className="absolute -bottom-8 left-0 right-0 text-center text-xs text-white/30 opacity-0 group-hover:opacity-100 transition-opacity">
          AI Command Mode • Try "Red circle center" or "Blue box 200px width"
        </div>
      </form>
    </div>
  );
};
