import React, { useRef, useState } from 'react';

import { Link } from '@tanstack/react-router';

import { useCreation, useDebounceEffect, useLatest, useThrottleEffect } from 'ahooks';
import { AnimatePresence } from 'framer-motion';
import { keyBy, map } from 'lodash';
import { CircleSlash, Plus, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useSWRConfig } from 'swr';

import { useUpdateGroupPages, useWorkspacePages } from '@/apis/pages';
import { IPinPage } from '@/apis/pages/typings.ts';
import { VirtuaWorkbenchViewGroupList } from '@/components/layout/workbench/sidebar/mode/normal/group-virua';
import { VirtuaWorkbenchViewList } from '@/components/layout/workbench/sidebar/mode/normal/virtua';
import { IWorkbenchViewItemPage } from '@/components/layout/workbench/sidebar/mode/normal/virtua/item.tsx';
import { useVinesTeam } from '@/components/router/guard/team.tsx';
import { Button } from '@/components/ui/button';
import { VinesFullLoading } from '@/components/ui/loading';
import { Separator } from '@/components/ui/separator.tsx';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useLocalStorage } from '@/hooks/use-local-storage';
import { useElementSize } from '@/hooks/use-resize-observer';
import useUrlState from '@/hooks/use-url-state.ts';
import { cloneDeep, cn } from '@/utils';

interface IWorkbenchNormalModeSidebarProps extends React.ComponentPropsWithoutRef<'div'> {
  showGroup?: boolean;
}

export const WorkbenchNormalModeSidebar: React.FC<IWorkbenchNormalModeSidebarProps> = ({ showGroup = true }) => {
  const { t } = useTranslation();
  const { teamId } = useVinesTeam();
  const { data, isLoading } = useWorkspacePages();
  const [groupId, setGroupId] = useState<string>('default');
  const { trigger } = useUpdateGroupPages(groupId);
  const { mutate } = useSWRConfig();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const originalPages = data?.pages ?? [];
  const originalGroups = useCreation(() => {
    return (
      data?.groups
        ?.map((group) => ({
          ...group,
          pageIds: group.pageIds.filter((pageId) => originalPages.some((it) => it.id === pageId)),
        }))
        ?.filter((group) => group.pageIds.length) ?? []
    );
  }, [data?.groups, originalPages]);

  const pagesMap = keyBy(originalPages, 'id');
  const lists = map(originalGroups, ({ pageIds, ...attr }) => ({
    ...attr,
    pages: map(pageIds, (pageId) => pagesMap[pageId]).filter(Boolean),
  }))
    .filter((it) => it.pages?.length)
    .sort((a, b) => {
      if (a.isBuiltIn !== b.isBuiltIn) {
        return a.isBuiltIn ? -1 : 1;
      }
      return a.displayName.localeCompare(b.displayName, undefined, { numeric: true });
    });

  const [{ activePage }] = useUrlState<{ activePage: string }>({ activePage: '' });
  const toggleToActivePageRef = useRef(activePage ? false : null);

  const [currentPage, setCurrentPage] = useLocalStorage<Partial<IWorkbenchViewItemPage>>('vines-ui-workbench-page', {});
  const [localOrder, setLocalOrder] = useLocalStorage<string[]>(`vines-ui-workbench-order-${groupId}`, []);

  const latestOriginalPages = useLatest(originalPages);
  const latestOriginalGroups = useLatest(originalGroups);
  useDebounceEffect(
    () => {
      if (!teamId) return;

      const pagesLength = latestOriginalPages.current.length;
      const groupsLength = latestOriginalGroups.current.length;
      if (!pagesLength) return;

      const currentTeamPage = currentPage?.[teamId] ?? {};
      const currentPageId = currentTeamPage?.id;

      if (toggleToActivePageRef.current === false) {
        const page = latestOriginalPages.current.find((it) => it.workflowId === activePage);
        const groupWithPageId = latestOriginalGroups.current.find((it) => it.pageIds.includes(page?.id ?? ''));
        if (page && groupWithPageId) {
          setCurrentPage((prev) => ({ ...prev, [teamId]: page }));
          setGroupId(groupWithPageId.id);
          toggleToActivePageRef.current = true;
          return;
        }
      }

      const setEmptyOrFirstPage = () => {
        if (pagesLength && groupsLength) {
          const sortedGroups = cloneDeep(latestOriginalGroups.current).sort((a) => (a.isBuiltIn ? 1 : -1));
          sortedGroups.forEach(({ id, pageIds }) => {
            if (pageIds.length) {
              const firstPage = latestOriginalPages.current.find((it) => it.id === pageIds[0]);
              if (firstPage) {
                setCurrentPage((prev) => ({ ...prev, [teamId]: firstPage }));
                setGroupId(id);
                return;
              }
            }
          });
          return;
        }

        setCurrentPage((prev) => ({ ...prev, [teamId]: {} }));
      };

      if (currentPageId) {
        const page = latestOriginalPages.current.find((it) => it.id === currentPageId);
        if (page) {
          const groupIdWithPage = latestOriginalGroups.current.find(
            (it) => it.id === (currentTeamPage?.groupId || currentPageId),
          );
          if (groupIdWithPage) {
            setGroupId(groupIdWithPage.id);
          } else {
            setEmptyOrFirstPage();
          }
        } else {
          setEmptyOrFirstPage();
        }
      } else {
        setEmptyOrFirstPage();
      }
    },
    [currentPage?.[teamId], data, teamId],
    { wait: 210 },
  );

  const { ref, height: wrapperHeight } = useElementSize();
  const [height, setHeight] = useState(500);
  useThrottleEffect(
    () => {
      if (!wrapperHeight) return;
      setHeight(wrapperHeight - 74);
    },
    [wrapperHeight],
    { wait: 64 },
  );

  const hasGroups = lists.length && !isLoading;

  const handleImportWorkflow = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.vines') && !file.name.endsWith('.zip')) {
      toast.error(t('workflow.import.invalid-file-type'));
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
      toast.promise(
        fetch('/api/workflow/metadata/import-from-file', {
          method: 'POST',
          body: formData,
          headers: {
            // 不设置 Content-Type，让浏览器自动处理 multipart/form-data
          },
          credentials: 'include'  // 确保发送凭证
        })
          .then(async res => {
            console.log('导入响应状态:', res.status);
            if (!res.ok) {
              const errorText = await res.text();
              console.error('导入错误详情:', errorText);
              throw new Error(`导入失败: ${res.status} ${errorText}`);
            }
            return res.json();
          })
          .catch(err => {
            console.error('导入过程中出错:', err);
            throw err;
          }),
        {
          loading: t('workflow.import.loading'),
          success: (data) => {
            console.log('导入成功，结果:', data);
            mutate('/api/workflow/pages/pinned');
            if (fileInputRef.current) fileInputRef.current.value = '';
            return t('workflow.import.success');
          },
          error: (err) => {
            console.error('导入工作流失败:', err);
            return `${t('workflow.import.error')}: ${err.message}`;
          },
        }
      );
    } catch (error) {
      console.error('导入工作流过程中发生异常:', error);
      toast.error(`${t('workflow.import.error')}: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  return (
    <div
      className={cn(
        'relative mr-4 flex h-full items-center justify-center rounded-xl border border-input bg-slate-1 shadow-sm',
        showGroup ? 'w-96' : 'w-64',
      )}
      ref={ref}
    >
      {isLoading ? (
        <AnimatePresence>
          <VinesFullLoading disableCard />
        </AnimatePresence>
      ) : (
        <>
          {hasGroups ? (
            showGroup ? (
              <>
                <VirtuaWorkbenchViewGroupList data={lists} groupId={groupId} setGroupId={setGroupId} />
                <Separator orientation="vertical" />
              </>
            ) : (
              <></>
            )
          ) : (
            <div className="vines-center absolute flex-col gap-4">
              <CircleSlash size={64} />
              <div className="flex flex-col text-center">
                <h2 className="font-bold">{t('workbench.view.no-starred-view')}</h2>
              </div>
            </div>
          )}
          <div className="grid w-full overflow-hidden p-4 [&_h1]:line-clamp-1 [&_span]:line-clamp-1">
            <VirtuaWorkbenchViewList
              height={height}
              data={(lists?.find((it) => it.id === groupId)?.pages ?? []) as IPinPage[]}
              currentPageId={currentPage?.[teamId]?.id}
              currentGroupId={groupId}
              onChildClick={(page) => {
                setCurrentPage((prev) => ({ ...prev, [teamId]: { ...page, groupId } }));
              }}
              onReorder={async (newData) => {
                if (!groupId) return;
                const pageIds = newData.map((it) => it.id);
                setLocalOrder(pageIds);
                await trigger({
                  pageId: pageIds[0],
                  mode: 'add',
                });
              }}
            />
            <div className="flex w-full gap-2 mt-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link to="/$teamId/workflows/" params={{ teamId }}>
                    <Button icon={<Plus />} className="w-full" variant="outline" />
                  </Link>
                </TooltipTrigger>
                <TooltipContent>{t('workbench.sidebar.add')}</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    icon={<Upload />}
                    className="w-full"
                    variant="outline"
                    onClick={handleImportWorkflow}
                  />
                </TooltipTrigger>
                <TooltipContent>{t('workbench.sidebar.import')}</TooltipContent>
              </Tooltip>
            </div>

            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept=".zip,.vines"
              onChange={handleFileChange}
            />
          </div>
        </>
      )}
    </div>
  );
};
