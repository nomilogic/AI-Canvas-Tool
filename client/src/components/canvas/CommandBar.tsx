import React, { useState } from 'react';
import { Send, Sparkles, Command } from 'lucide-react';

interface CommandBarProps {
  onSubmit: (prompt: string) => void;
  isLoading: boolean;
}

export const CommandBar: React.FC<CommandBarProps> = ({ onSubmit, isLoading }) => {
  const [prompt, setPrompt] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (prompt.trim()) {
      onSubmit(prompt);
      setPrompt('');
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
            placeholder="Describe an element... (e.g., 'Create a blue box in the top right')"
            className="flex-1 bg-transparent border-none outline-none text-white placeholder-white/40 px-2 py-2 font-medium"
            autoFocus
          />
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
