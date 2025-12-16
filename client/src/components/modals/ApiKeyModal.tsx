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
import { toast } from 'sonner';

interface ApiKeyModalProps {
  apiKey: string;
  onSave: (key: string) => void;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ apiKey, onSave }) => {
  const [value, setValue] = useState(apiKey);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');

  const handleSave = () => {
    onSave(value);
    setOpen(false);
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
