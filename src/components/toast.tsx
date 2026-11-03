'use client';

import { App, Button, Space } from 'antd';
import { useCallback, useMemo, useRef, useId } from 'react';

export type ToastType = 'error' | 'success' | 'info' | 'warning';
export interface ToastAction {
  label: string;
  onClick: () => void;
}
export interface ToastOptions {
  action?: ToastAction;
  duration?: number;
}

/** Business notification API; rendering, timers and stacking belong to Ant Design. */
export function useToast() {
  const { message } = App.useApp();
  const counter = useRef(0);
  const prefix = useId();
  const toast = useCallback(
    (text: string, type: ToastType = 'info', options?: ToastOptions) => {
      const key = `${prefix}-${++counter.current}`;
      void message.open({
        key,
        type,
        duration: (options?.duration ?? (options?.action ? 6000 : 3000)) / 1000,
        content: (
          <Space wrap>
            {text}
            {options?.action && (
              <Button
                type="link"
                size="small"
                onClick={() => {
                  message.destroy(key);
                  options.action?.onClick();
                }}
              >
                {options.action.label}
              </Button>
            )}
          </Space>
        ),
      });
    },
    [message, prefix],
  );
  return useMemo(() => ({ toast }), [toast]);
}
