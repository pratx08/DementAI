import { useEffect, useMemo, useState } from 'react'
import {
  CircleMarker,
  MapContainer,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

type RoutePoint = [number, number]

type DirectionsMapProps = {
  origin: GeolocationCoordinates | null
  destination: {
    label: string
    address: string
    latitude: number
    longitude: number
  }
  onStatusChange: (status: string) => void
}

type OsrmRoute = {
  routes?: Array<{
    geometry?: {
      coordinates?: [number, number][]
    }
    distance?: number
    duration?: number
  }>
}

function RouteBounds({ points }: { points: RoutePoint[] }) {
  const map = useMap()

  useEffect(() => {
    if (points.length > 1) {
      map.fitBounds(points, { padding: [26, 26], maxZoom: 16 })
    }
  }, [map, points])

  return null
}

export function DirectionsMap({
  origin,
  destination,
  onStatusChange,
}: DirectionsMapProps) {
  const [routePoints, setRoutePoints] = useState<RoutePoint[]>([])

  const destinationPoint = useMemo<RoutePoint>(
    () => [destination.latitude, destination.longitude],
    [destination.latitude, destination.longitude],
  )

  const originPoint = useMemo<RoutePoint | null>(() => {
    if (!origin) {
      return null
    }

    return [origin.latitude, origin.longitude]
  }, [origin])

  useEffect(() => {
    let isCancelled = false

    async function loadRoute() {
      if (!origin) {
        setRoutePoints([])
        return
      }

      onStatusChange('Finding route to Clark University')

      try {
        const coordinates = [
          `${origin.longitude},${origin.latitude}`,
          `${destination.longitude},${destination.latitude}`,
        ].join(';')
        let response = await fetch(
          `https://router.project-osrm.org/route/v1/foot/${coordinates}?overview=full&geometries=geojson`,
        )

        if (!response.ok) {
          response = await fetch(
            `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson`,
          )
        }

        const data = (await response.json()) as OsrmRoute
        const route = data.routes?.[0]
        const points: RoutePoint[] =
          route?.geometry?.coordinates?.map(([longitude, latitude]) => [
            latitude,
            longitude,
          ]) ?? []

        if (isCancelled) {
          return
        }

        setRoutePoints(points)

        if (route?.duration && route.distance) {
          const minutes = Math.max(1, Math.round(route.duration / 60))
          const miles = (route.distance / 1609.34).toFixed(1)
          onStatusChange(`${minutes} min walk, ${miles} mi`)
        } else {
          onStatusChange('Route ready')
        }
      } catch {
        if (!isCancelled) {
          setRoutePoints([])
          onStatusChange('Route unavailable')
        }
      }
    }

    loadRoute()

    return () => {
      isCancelled = true
    }
  }, [destination.latitude, destination.longitude, onStatusChange, origin])

  const visibleRoute: RoutePoint[] =
    routePoints.length > 0
      ? routePoints
      : originPoint
        ? [originPoint, destinationPoint]
        : [destinationPoint]

  return (
    <MapContainer
      center={destinationPoint}
      zoom={15}
      zoomControl={false}
      attributionControl={false}
      className="directions-map"
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

      {originPoint && (
        <CircleMarker
          center={originPoint}
          radius={6}
          pathOptions={{ color: '#ffffff', fillColor: '#4ad47f', fillOpacity: 1 }}
        >
          <Popup>Current location</Popup>
        </CircleMarker>
      )}

      <CircleMarker
        center={destinationPoint}
        radius={7}
        pathOptions={{ color: '#ffffff', fillColor: '#ff4f5e', fillOpacity: 1 }}
      >
        <Popup>{destination.label}</Popup>
      </CircleMarker>

      {visibleRoute.length > 1 && (
        <>
          <Polyline
            positions={visibleRoute}
            pathOptions={{ color: '#95f2b6', weight: 5, opacity: 0.88 }}
          />
          <RouteBounds points={visibleRoute} />
        </>
      )}
    </MapContainer>
  )
}
