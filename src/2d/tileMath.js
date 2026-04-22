const WEB_MERCATOR_MAX_LAT = 85.0511287798066;

/**
 * 将纬度限制在 Web Mercator 可表示范围内。
 */
function clampLatitude(latitude) {
    return Math.max(-WEB_MERCATOR_MAX_LAT, Math.min(WEB_MERCATOR_MAX_LAT, latitude));
}

/**
 * 递归更新经纬度边界。
 */
function updateBoundsFromCoordinates(coordinates, bounds) {
    if (!Array.isArray(coordinates)) {
        return;
    }

    if (
        coordinates.length >= 2 &&
        typeof coordinates[0] === 'number' &&
        typeof coordinates[1] === 'number'
    ) {
        bounds.minLng = Math.min(bounds.minLng, coordinates[0]);
        bounds.maxLng = Math.max(bounds.maxLng, coordinates[0]);
        bounds.minLat = Math.min(bounds.minLat, coordinates[1]);
        bounds.maxLat = Math.max(bounds.maxLat, coordinates[1]);
        return;
    }

    coordinates.forEach(child => {
        updateBoundsFromCoordinates(child, bounds);
    });
}

/**
 * 计算整个 FeatureCollection 的二维边界框。
 */
export function calculateFeatureCollectionBounds(featureCollection) {
    const bounds = {
        minLng: Infinity,
        maxLng: -Infinity,
        minLat: Infinity,
        maxLat: -Infinity
    };

    featureCollection.features.forEach(feature => {
        updateBoundsFromCoordinates(feature.geometry?.coordinates, bounds);
    });

    if (
        !Number.isFinite(bounds.minLng) ||
        !Number.isFinite(bounds.maxLng) ||
        !Number.isFinite(bounds.minLat) ||
        !Number.isFinite(bounds.maxLat)
    ) {
        return null;
    }

    return bounds;
}

/**
 * 将经度转换为指定缩放级别的瓦片列号。
 */
export function lngToTileX(lng, zoom) {
    const tileCount = 1 << zoom;
    const raw = ((lng + 180) / 360) * tileCount;
    return Math.min(tileCount - 1, Math.max(0, Math.floor(raw)));
}

/**
 * 将纬度转换为指定缩放级别的瓦片行号。
 */
export function latToTileY(lat, zoom) {
    const clampedLat = clampLatitude(lat);
    const tileCount = 1 << zoom;
    const rad = (clampedLat * Math.PI) / 180;
    const raw = (
        (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2
    ) * tileCount;
    return Math.min(tileCount - 1, Math.max(0, Math.floor(raw)));
}
