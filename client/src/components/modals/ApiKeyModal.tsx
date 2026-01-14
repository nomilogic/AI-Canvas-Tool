import React from 'react';
import AIModelSelector from '@/components/AIModelSelector';

// Deprecated wrapper kept for compatibility - use the unified AIModelSelector.
export const ApiKeyModal: React.FC<any> = () => {
  return <AIModelSelector />;
};
