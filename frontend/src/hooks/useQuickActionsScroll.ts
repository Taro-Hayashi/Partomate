import { useRef, type Dispatch, type SetStateAction } from 'react';
import type { PointerEvent, MouseEvent, WheelEvent, PointerEvent as ReactPointerEvent } from 'react';

export function useQuickActionsScroll(
  textareaRef: React.RefObject<HTMLTextAreaElement | null>,
  setInput: Dispatch<SetStateAction<string>>
) {
  const quickActionsDragRef = useRef({
    dragging: false,
    moved: false,
    startX: 0,
    scrollLeft: 0,
  });
  const suppressQuickActionClickRef = useRef(false);
  const suppressQuickActionClickTimerRef = useRef<number | undefined>(undefined);

  const handleQuickActionsWheel = (e: WheelEvent<HTMLDivElement>) => {
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    e.currentTarget.scrollLeft += e.deltaY;
    e.preventDefault();
  };

  const handleQuickActionsPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    suppressQuickActionClickRef.current = false;
    if (suppressQuickActionClickTimerRef.current) {
      window.clearTimeout(suppressQuickActionClickTimerRef.current);
    }
    quickActionsDragRef.current = {
      dragging: true,
      moved: false,
      startX: e.clientX,
      scrollLeft: e.currentTarget.scrollLeft,
    };
    e.currentTarget.classList.add('is-dragging');
  };

  const handleQuickActionsPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const drag = quickActionsDragRef.current;
    if (!drag.dragging) return;

    const deltaX = e.clientX - drag.startX;
    if (Math.abs(deltaX) > 4) {
      drag.moved = true;
    }
    e.currentTarget.scrollLeft = drag.scrollLeft - deltaX;
  };

  const handleQuickActionsPointerEnd = (e: PointerEvent<HTMLDivElement>) => {
    const moved = quickActionsDragRef.current.moved;
    quickActionsDragRef.current.dragging = false;
    e.currentTarget.classList.remove('is-dragging');
    if (moved) {
      suppressQuickActionClickRef.current = true;
      suppressQuickActionClickTimerRef.current = window.setTimeout(() => {
        suppressQuickActionClickRef.current = false;
      }, 200);
    }
  };

  const handleQuickActionsClickCapture = (e: MouseEvent<HTMLDivElement>) => {
    if (suppressQuickActionClickRef.current) {
      e.preventDefault();
      e.stopPropagation();
      suppressQuickActionClickRef.current = false;
      if (suppressQuickActionClickTimerRef.current) {
        window.clearTimeout(suppressQuickActionClickTimerRef.current);
      }
    }
  };

  const handleQuickActionButtonPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
  };

  const handleChipClick = (action: string) => {
    setInput((prev) => {
      const newValue = prev ? `${prev} ${action}` : action;
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          const len = newValue.length;
          textareaRef.current.setSelectionRange(len, len);
        }
      }, 50);
      return newValue;
    });
  };

  return {
    suppressQuickActionClickTimerRef,
    handleQuickActionsWheel,
    handleQuickActionsPointerDown,
    handleQuickActionsPointerMove,
    handleQuickActionsPointerEnd,
    handleQuickActionsClickCapture,
    handleQuickActionButtonPointerDown,
    handleChipClick,
  } as const;
}
