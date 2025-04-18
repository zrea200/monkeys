import React, { useEffect, useRef, useState } from 'react';

import { useLocalStorage } from '@/hooks/use-local-storage';
import {
  closestCenter,
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { restrictToFirstScrollableAncestor, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Virtualizer, VListHandle } from 'virtua';

import { IPinPage } from '@/apis/pages/typings.ts';
import {
  IWorkbenchViewItemPage,
  IWorkbenchViewItemProps,
  ViewItem,
  WorkbenchViewItemCurrentData,
} from '@/components/layout/workbench/sidebar/mode/normal/virtua/item.tsx';
import { ScrollArea } from '@/components/ui/scroll-area.tsx';

interface IVirtuaWorkbenchViewListProps {
  height: number;
  data: IPinPage[];

  currentPageId?: string;
  currentGroupId?: string;

  onChildClick?: IWorkbenchViewItemProps['onClick'];
  onReorder?: (newData: IPinPage[]) => void;
}

export const VirtuaWorkbenchViewList: React.FC<IVirtuaWorkbenchViewListProps> = ({
  height,
  data,
  currentPageId,
  currentGroupId,
  onChildClick,
  onReorder,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const ref = useRef<VListHandle>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 10,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const [localOrder, setLocalOrder] = useLocalStorage<string[]>(`vines-ui-workbench-order-${currentGroupId}`, []);
  const [orderedData, setOrderedData] = useState<IPinPage[]>(data);

  useEffect(() => {
    if (localOrder.length && data.length) {
      const sortedData = [...data].sort((a, b) => {
        const aIndex = localOrder.indexOf(a.id);
        const bIndex = localOrder.indexOf(b.id);
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
      });
      setOrderedData(sortedData);
    } else {
      setOrderedData(data);
    }
  }, [localOrder, data]);

  const pageIds = orderedData?.map(({ id }) => id) ?? [];

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || !orderedData || !onReorder) return;

    if (active.id !== over.id) {
      const oldIndex = pageIds.indexOf(active.id as string);
      const newIndex = pageIds.indexOf(over.id as string);
      const newData = arrayMove(orderedData, oldIndex, newIndex) as IPinPage[];
      setLocalOrder(newData.map((it) => it.id));
      setOrderedData(newData);
      onReorder(newData);
    }
  };
  useEffect(() => {
    if (!currentPageId || !currentGroupId || !ref.current) return;

    const index = orderedData.findIndex((it) => it?.id === currentPageId);
    if (index === -1) return;

    requestIdleCallback(() => ref.current?.scrollToIndex(index, { smooth: true, offset: -40 }));
  }, [currentGroupId, currentPageId, orderedData]);

  return (
    <WorkbenchViewItemCurrentData.Provider value={{ pageId: currentPageId, groupId: currentGroupId }}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis, restrictToFirstScrollableAncestor]}
        onDragEnd={handleDragEnd}
      >
        <ScrollArea className="-mr-3 pr-3" ref={scrollRef} style={{ height }} disabledOverflowMask>
          <Virtualizer ref={ref} scrollRef={scrollRef}>
            <SortableContext items={pageIds} strategy={verticalListSortingStrategy}>
              {orderedData.map((it, i) => (
                <ViewItem key={it.id} page={it as IWorkbenchViewItemPage} onClick={onChildClick} />
              ))}
            </SortableContext>
            <div />
          </Virtualizer>
        </ScrollArea>
      </DndContext>
    </WorkbenchViewItemCurrentData.Provider>
  );
};
