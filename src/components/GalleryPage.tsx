import SearchBar from './SearchBar'
import TaskGrid from './TaskGrid'
import { FavoriteCollectionsView } from './FavoriteCollections'

interface GalleryPageProps {
  filterFavorite: boolean
  activeFavoriteCollectionId: string | null
}

export default function GalleryPage({ filterFavorite, activeFavoriteCollectionId }: GalleryPageProps) {
  return (
    <main data-gallery-page data-drag-select-surface className="pb-[calc(var(--input-bar-clearance,12rem)+2rem)] sm:pb-[calc(var(--input-bar-clearance,12rem)+2.75rem)]">
      <div className="safe-area-x max-w-7xl mx-auto">
        <SearchBar />
        {filterFavorite && !activeFavoriteCollectionId ? <FavoriteCollectionsView /> : <TaskGrid />}
      </div>
    </main>
  )
}
