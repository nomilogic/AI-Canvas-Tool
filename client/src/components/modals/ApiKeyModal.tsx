import React, { useState } from 'react';
import { Settings, Key, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { testConnection } from '../../lib/gemini';
import callPuterChat from '../../lib/puter-client';
import { toast } from 'sonner';

interface ApiKeyModalProps {
  apiKey: string;
  onSave: (key: string) => void;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ apiKey, onSave }) => {
  const [value, setValue] = useState(apiKey);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [puterEnabled, setPuterEnabled] = useState<boolean>(() => localStorage.getItem('puter_enabled') === '1');
  const [puterModel, setPuterModel] = useState<string>(() => localStorage.getItem('puter_model') || 'claude-sonnet-4-5');
  const [puterStreaming, setPuterStreaming] = useState<boolean>(() => localStorage.getItem('puter_stream') === '1');
  const [puterStatus, setPuterStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');

  const handleSave = () => {
    onSave(value);
    setOpen(false);
    // Persist Puter settings locally
    if (puterEnabled) {
      localStorage.setItem('puter_enabled', '1');
      localStorage.setItem('puter_model', puterModel);
      localStorage.setItem('puter_stream', puterStreaming ? '1' : '0');
    } else {
      localStorage.removeItem('puter_enabled');
      localStorage.removeItem('puter_model');
      localStorage.removeItem('puter_stream');
    }
  };

  const handleTest = async () => {
    if (!value) return;
    setStatus('testing');
    try {
      const success = await testConnection(value);
      if (success) {
        setStatus('success');
        toast.success("Connection successful!");
      } else {
        setStatus('error');
        toast.error("Connection failed. Check key.");
      }
    } catch (e) {
      setStatus('error');
    }
  };

  const handlePuterTest = async () => {
    if (!puterEnabled) return;
    setPuterStatus('testing');
    try {
      const resp = await callPuterChat('Say hi', { model: puterModel, stream: false });
      // puter response shape: resp.message.content[0].text
      const text = resp?.message?.content?.[0]?.text ?? JSON.stringify(resp);
      setPuterStatus('success');
      toast.success('Puter response received');
      console.log('Puter test response:', text);
    } catch (e) {
      console.error('Puter test failed', e);
      setPuterStatus('error');
      toast.error('Puter test failed — check console for details');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors" title="AI Settings">
          <Settings className="w-5 h-5" />
        </button>
      </DialogTrigger>
      <DialogContent className="bg-[#1a1a1a] border-white/10 text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="w-5 h-5 text-violet-500" />
            Configure AI Model
          </DialogTitle>
          <DialogDescription className="text-white/60">
            To use the real AI capabilities, providing a Google Gemini API Key is required for this prototype.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-4">
          <div className="grid w-full items-center gap-1.5">
            <Label htmlFor="apiKey" className="text-white/80">Gemini API Key</Label>
            <div className="flex gap-2">
                <Input
                id="apiKey"
                type="password"
                placeholder="AIzaSy..."
                value={value}
                onChange={(e) => {
                    setValue(e.target.value);
                    setStatus('idle');
                }}
                className="bg-black/20 border-white/10 text-white placeholder:text-white/20 focus:border-violet-500/50 flex-1"
                />
                <Button 
                    variant="outline" 
                    size="icon" 
                    onClick={handleTest}
                    disabled={!value || status === 'testing'}
                    className={`shrink-0 border-white/10 ${
                        status === 'success' ? 'text-green-400 border-green-400/50 bg-green-400/10' :
                        status === 'error' ? 'text-red-400 border-red-400/50 bg-red-400/10' :
                        'text-white/60 hover:text-white hover:bg-white/5'
                    }`}
                >
                    {status === 'testing' ? <Loader2 className="w-4 h-4 animate-spin" /> :
                     status === 'success' ? <CheckCircle2 className="w-4 h-4" /> :
                     status === 'error' ? <XCircle className="w-4 h-4" /> :
                     <div className="text-xs font-mono">Test</div>
                    }
                </Button>
            </div>
            <p className="text-xs text-white/40">
              {import.meta.env.VITE_GEMINI_API_KEY ? (
                  <span className="text-green-400">✓ Detected from Environment (VITE_GEMINI_API_KEY)</span>
              ) : (
                  <span>
                    If you added a secret, make sure it is named <code className="bg-white/10 px-1 rounded">VITE_GEMINI_API_KEY</code> to be detected automatically.
                  </span>
              )}
            </p>
          </div>

          {/* Puter (Claude Sonnet) options */}
          <div className="grid w-full items-center gap-1.5 pt-2 border-t border-white/6">
            <Label className="text-white/80">Puter / Claude (client-side)</Label>
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={puterEnabled} onChange={(e) => setPuterEnabled(e.target.checked)} className="h-4 w-4" />
                <span className="text-xs">Enable Puter (Claude Sonnet via CDN / client)</span>
              </label>
              <button onClick={handlePuterTest} disabled={!puterEnabled || puterStatus === 'testing'} className={`px-2 py-1 rounded text-xs ${puterStatus === 'success' ? 'bg-green-600 text-white' : 'bg-white/5 text-white/70 hover:bg-white/10'}`}>
                {puterStatus === 'testing' ? 'Testing...' : 'Test'}
              </button>
            </div>

            {puterEnabled && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-xs text-gray-500 block mb-1">Model</span>
                  <select value={puterModel} onChange={(e) => setPuterModel(e.target.value)} className="w-full bg-[#3e3e42] rounded px-2 py-1 text-sm">
                    <option value="claude-sonnet-4-5">claude-sonnet-4-5</option>
                    <option value="claude-opus-4-5">claude-opus-4-5</option>
                    <option value="claude-haiku-4-5">claude-haiku-4-5</option>
                  </select>
                </div>

                <div>
                  <span className="text-xs text-gray-500 block mb-1">Streaming</span>
                  <label className="inline-flex items-center gap-2">
                    <input type="checkbox" checked={puterStreaming} onChange={(e) => setPuterStreaming(e.target.checked)} className="h-4 w-4" />
                    <span className="text-xs text-gray-400">Enable streaming (for long responses)</span>
                  </label>
                </div>
              </div>
            )}

            <p className="text-xs text-white/40">
              Puter is a client-side access layer to Anthropic Claude. It uses a user-pays model (no server API key required). Enabling it will allow the client to call Claude directly via Puter.js — be sure users understand any usage or billing implications.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button 
            onClick={handleSave} 
            className="bg-violet-600 hover:bg-violet-700 text-white border-0"
          >
            Save Configuration
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
