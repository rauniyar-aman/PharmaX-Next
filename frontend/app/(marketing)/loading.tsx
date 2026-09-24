import PageSkeleton from '@/components/ui/Skeleton'

export default function Loading() {
  return (
    <div className="w-full px-4 sm:px-6 py-6">
      <PageSkeleton shape="detail" />
    </div>
  )
}
