interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
  lines?: number;
}

export const Skeleton = ({
  className = '',
  variant = 'text',
  width,
  height,
  lines = 1,
}: SkeletonProps) => {
  const baseClass = 'animate-pulse bg-gray-200 dark:bg-gray-700';

  const getVariantClass = () => {
    switch (variant) {
      case 'circular':
        return 'rounded-full';
      case 'rectangular':
        return 'rounded-lg';
      case 'text':
      default:
        return 'rounded';
    }
  };

  const style: React.CSSProperties = {
    width: width || (variant === 'text' ? '100%' : undefined),
    height: height || (variant === 'text' ? '1rem' : undefined),
  };

  if (lines > 1) {
    return (
      <div className={`space-y-2 ${className}`}>
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={`${baseClass} ${getVariantClass()}`}
            style={{
              ...style,
              width: i === lines - 1 ? '75%' : style.width, // Last line shorter
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={`${baseClass} ${getVariantClass()} ${className}`}
      style={style}
    />
  );
};

// Pre-built skeleton patterns
export const SkeletonCard = () => (
  <div className="bg-white dark:bg-gray-800 rounded-xl p-4 space-y-3">
    <div className="flex items-center gap-3">
      <Skeleton variant="circular" width={40} height={40} />
      <div className="flex-1">
        <Skeleton height="0.875rem" width="60%" />
        <Skeleton height="0.75rem" width="40%" className="mt-2" />
      </div>
    </div>
    <Skeleton lines={2} />
  </div>
);

export const SkeletonListItem = () => (
  <div className="flex items-center gap-3 p-4 bg-white dark:bg-gray-800 rounded-xl">
    <Skeleton variant="rectangular" width={48} height={48} />
    <div className="flex-1">
      <Skeleton height="1rem" width="70%" />
      <Skeleton height="0.75rem" width="50%" className="mt-2" />
    </div>
    <Skeleton variant="rectangular" width={60} height={24} />
  </div>
);

export const SkeletonTimeEntry = () => (
  <div className="flex items-center gap-3 p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700">
    <div className="w-1 h-12 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse" />
    <div className="flex-1">
      <Skeleton height="1rem" width="60%" />
      <Skeleton height="0.75rem" width="40%" className="mt-2" />
    </div>
    <div className="text-right">
      <Skeleton height="1rem" width={60} />
      <Skeleton height="0.75rem" width={40} className="mt-2" />
    </div>
  </div>
);

export const SkeletonDashboardStats = () => (
  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
    {[1, 2, 3].map((i) => (
      <div key={i} className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-3 mb-3">
          <Skeleton variant="rectangular" width={40} height={40} />
          <Skeleton height="0.875rem" width="50%" />
        </div>
        <Skeleton height="2rem" width="40%" />
        <Skeleton height="0.75rem" width="60%" className="mt-2" />
      </div>
    ))}
  </div>
);
