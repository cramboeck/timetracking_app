import { useRef, useState } from 'react';
import { Trash2, Edit2 } from 'lucide-react';
import { haptics } from '../utils/haptics';

interface SwipeableRowProps {
  children: React.ReactNode;
  onDelete?: () => void;
  onEdit?: () => void;
  deleteLabel?: string;
  editLabel?: string;
}

export const SwipeableRow = ({
  children,
  onDelete,
  onEdit,
  deleteLabel = 'Löschen',
  editLabel = 'Bearbeiten',
}: SwipeableRowProps) => {
  const [translateX, setTranslateX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const isHorizontalSwipe = useRef<boolean | null>(null);

  const actionWidth = onDelete && onEdit ? 160 : 80;
  const threshold = actionWidth * 0.5;

  const handleTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    isHorizontalSwipe.current = null;
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;

    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const deltaX = currentX - startX.current;
    const deltaY = currentY - startY.current;

    // Determine swipe direction on first significant move
    if (isHorizontalSwipe.current === null) {
      if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
        isHorizontalSwipe.current = Math.abs(deltaX) > Math.abs(deltaY);
      }
    }

    // Only handle horizontal swipes
    if (!isHorizontalSwipe.current) return;

    // Prevent vertical scrolling during horizontal swipe
    e.preventDefault();

    // Only allow left swipe (negative deltaX) and limit the swipe distance
    const newTranslateX = Math.max(-actionWidth, Math.min(0, deltaX + translateX));
    setTranslateX(newTranslateX);
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    isHorizontalSwipe.current = null;

    // Snap to open or closed position
    if (translateX < -threshold) {
      setTranslateX(-actionWidth);
      haptics.light();
    } else {
      setTranslateX(0);
    }
  };

  const handleClose = () => {
    setTranslateX(0);
  };

  const handleDelete = () => {
    haptics.medium();
    handleClose();
    onDelete?.();
  };

  const handleEdit = () => {
    haptics.light();
    handleClose();
    onEdit?.();
  };

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* Action buttons (behind the content) */}
      <div className="absolute inset-y-0 right-0 flex">
        {onEdit && (
          <button
            onClick={handleEdit}
            className="w-20 flex flex-col items-center justify-center bg-blue-500 text-white"
          >
            <Edit2 size={20} />
            <span className="text-xs mt-1">{editLabel}</span>
          </button>
        )}
        {onDelete && (
          <button
            onClick={handleDelete}
            className="w-20 flex flex-col items-center justify-center bg-red-500 text-white"
          >
            <Trash2 size={20} />
            <span className="text-xs mt-1">{deleteLabel}</span>
          </button>
        )}
      </div>

      {/* Main content (swipeable) */}
      <div
        className={`relative bg-white dark:bg-gray-800 ${
          isDragging ? '' : 'transition-transform duration-200'
        }`}
        style={{ transform: `translateX(${translateX}px)` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {children}
      </div>
    </div>
  );
};
