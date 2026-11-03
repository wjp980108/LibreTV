'use client';

import { CloseOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { useMemo, useState, type ReactNode } from 'react';
import { Button, Divider, Space, Typography, Flex } from 'antd';
import { useQuery } from '@tanstack/react-query';
import {
  addSearchHistory,
  clearSearchHistory,
  db,
  removeSearchHistory,
  restoreSearchHistory,
} from '@/lib/db';
import { useToast } from './toast';

/** Data and actions only; AutoComplete owns focus, popup placement and keyboard selection. */
export function useSearchHistory(input: string) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const history = useQuery({
    queryKey: ['searchHistory'],
    queryFn: () => db.searchHistory.orderBy('timestamp').reverse().limit(10).toArray(),
  });
  const matches = useMemo(() => {
    const keyword = input.trim().toLowerCase();
    return (history.data ?? []).filter(
      (item) => !keyword || item.text.toLowerCase().includes(keyword),
    );
  }, [history.data, input]);
  const close = () => setOpen(false);
  const record = (text: string) => {
    addSearchHistory(text)
      .then(() => history.refetch())
      .catch(() => {});
  };
  const remove = (text: string) => {
    void removeSearchHistory(text).then(() => history.refetch());
  };
  const clearAll = async () => {
    const snapshot = history.data ?? [];
    if (!snapshot.length) return;
    close();
    await clearSearchHistory();
    await history.refetch();
    toast('已清空搜索记录', 'info', {
      action: {
        label: '撤销',
        onClick: () => {
          void restoreSearchHistory(snapshot).then(() => history.refetch());
        },
      },
    });
  };
  return {
    open: open && matches.length > 0 && !(matches.length === 1 && matches[0].text === input.trim()),
    onOpenChange: (next: boolean) => {
      setOpen(next);
      if (next) void history.refetch();
    },
    options: matches.map((item) => ({
      value: item.text,
      label: (
        <Flex align="center" justify="space-between" gap={8}>
          <Typography.Text ellipsis style={{ minWidth: 0 }}>
            {item.text}
          </Typography.Text>
          <Button
            type="text"
            size="small"
            aria-label={`删除搜索记录 ${item.text}`}
            icon={<CloseOutlined style={{ fontSize: 12 }} aria-hidden />}
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => {
              event.stopPropagation();
              remove(item.text);
            }}
          />
        </Flex>
      ),
    })),
    popupRender: (menu: ReactNode) => (
      <>
        <Flex style={{ paddingInline: 12, paddingBlock: 4 }} align="center" justify="space-between">
          <Space size="small">
            <ClockCircleOutlined style={{ fontSize: 14 }} aria-hidden />
            <Typography.Text type="secondary">最近搜索</Typography.Text>
          </Space>
          <Button
            type="text"
            size="small"
            danger
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => void clearAll()}
          >
            清空
          </Button>
        </Flex>
        <Divider style={{ marginBlock: 4 }} />
        {menu}
      </>
    ),
    close,
    record,
  };
}
