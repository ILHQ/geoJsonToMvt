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
 * 计算几何对象的二维边界框。
 */
export function calculateGeometryBounds(geometry) {
    const bounds = {
        minLng: Infinity,
        maxLng: -Infinity,
        minLat: Infinity,
        maxLat: -Infinity
    };

    updateBoundsFromCoordinates(geometry?.coordinates, bounds);

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
 * 计算单个要素的二维边界框。
 */
export function calculateFeatureBounds(feature) {
    return calculateGeometryBounds(feature?.geometry);
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

/**
 * 将瓦片列号转换为经度。
 */
export function tileXToLng(x, zoom) {
    const tileCount = 1 << zoom;
    return (x / tileCount) * 360 - 180;
}

/**
 * 将瓦片行号转换为纬度。
 */
export function tileYToLat(y, zoom) {
    const tileCount = 1 << zoom;
    const n = Math.PI - (2 * Math.PI * y) / tileCount;
    return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

/**
 * 获取指定瓦片的经纬度边界框。
 */
export function getTileBounds(z, x, y) {
    return {
        minLng: tileXToLng(x, z),
        maxLng: tileXToLng(x + 1, z),
        minLat: tileYToLat(y + 1, z),
        maxLat: tileYToLat(y, z)
    };
}

/**
 * 判断两个边界框是否有交集。
 */
export function boundsIntersect(left, right) {
    return !(
        left.maxLng < right.minLng ||
        left.minLng > right.maxLng ||
        left.maxLat < right.minLat ||
        left.minLat > right.maxLat
    );
}

/**
 * 生成统一的瓦片键。
 */
export function createTileKey(z, x, y) {
    return `${z}/${x}/${y}`;
}
