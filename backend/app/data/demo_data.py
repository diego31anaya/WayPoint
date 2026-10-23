import math
from app.schemas import Business


def distance_m(lat1, lon1, lat2, lon2):
    a, b = math.radians(lat1), math.radians(lat2)
    h = math.sin((b-a)/2)**2 + math.cos(a)*math.cos(b)*math.sin(math.radians(lon2-lon1)/2)**2
    return 6371008.8 * 2 * math.asin(min(1, math.sqrt(h)))


def demo_businesses(request):
    # Fixed synthetic Pomona neighborhood, never relocated to imply real coverage.
    rows = [('Demo Coffee A', 'coffee_shop', 34.0555, -117.7500),
            ('Demo Coffee B', 'cafe', 34.0580, -117.7480),
            ('Demo Library', 'library', 34.0560, -117.7520),
            ('Demo School', 'school', 34.0520, -117.7500),
            ('Demo Bakery', 'bakery', 34.0540, -117.7470),
            ('Demo Books', 'bookstore', 34.0530, -117.7520),
            ('Demo Restaurant', 'restaurant', 34.0570, -117.7510)]
    result = []
    for i, (name, category, lat, lon) in enumerate(rows):
        distance = distance_m(request.location.latitude, request.location.longitude, lat, lon)
        if distance <= request.radius_m:
            result.append(Business(business_id=f'synthetic-{i}', name=name, category=category,
                                   latitude=lat, longitude=lon, distance_m=distance))
    return sorted(result, key=lambda b: b.distance_m)
