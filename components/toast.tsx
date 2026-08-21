"use client";

import { useState, useCallback, useRef } from "react";

export function useToast() {
  const [message, setMessage] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setMessage(msg);
    setVisible(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(false), 2200);
  }, []);

  const Toast = (
    <div
      className={`fixed bottom-6 right-6 z-[100] glass-panel border border-outline-variant px-5 py-3 font-code-sm text-code-sm text-primary max-w-xs transition-all duration-300 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none"
      }`}
      role="status"
    >
      {message}
    </div>
  );

  return { showToast, Toast };
}
