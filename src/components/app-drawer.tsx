'use client';

import { Drawer, type DrawerProps } from 'antd';
import { useLayoutEffect, useRef } from 'react';

/** Close the panel and release its body scroll lock in the same render cycle. */
export function AppDrawer(props: DrawerProps) {
  const { open = false, afterOpenChange, focusable } = props;
  const wasOpen = useRef(false);
  const trigger = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (open && !wasOpen.current) {
      trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    } else if (!open && wasOpen.current) {
      if (focusable?.focusTriggerAfterClose !== false && trigger.current?.isConnected) {
        trigger.current.focus({ preventScroll: true });
      }
      afterOpenChange?.(false);
    }
    wasOpen.current = open;
  }, [open, afterOpenChange, focusable?.focusTriggerAfterClose]);

  // Unmounting cleans up Ant Design's body lock before the next paint. Merely
  // disabling motion still leaves an effect-delayed interval without scrollbars.
  // The normal opening animation and body portal are owned by Drawer.
  return open ? <Drawer {...props} /> : null;
}
