import { Navigate, useParams, useSearchParams } from "react-router-dom"

/**
 * Former standalone Mietparteien page. Mietparteien now live on the WG page
 * (tab „Zimmer & Mietparteien“); old links and bookmarks keep working via this redirect.
 * `?room=<id>` opens the „Mietpartei hinzufügen“ dialog for that room.
 */
export function LeasesPage() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const room = searchParams.get("room")
  const target = `/wohnungen/${id}${room ? `?room=${encodeURIComponent(room)}` : ""}`
  return <Navigate to={target} replace />
}
