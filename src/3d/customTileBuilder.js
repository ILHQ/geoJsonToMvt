import { clipGeometry } from './geometryClipper.js';
import {
    boundsIntersect,
    calculateFeatureBounds,
    createTileKey,
    getTileBounds,
    latToTileY,
    lngToTileX
} from './tileMath.js';

/**
 * 解析稳定的数值型 feature id。
 */
function resolveFeatureId(feature, featureIndex) {
    if (
        typeof feature.id === 'number' &&
        Number.isInteger(feature.id) &&
        feature.id >= 0
    ) {
        return feature.id;
    }

    return featureIndex + 1;
}

/**
 * 将裁剪后的几何包装为 tile feature。
 */
function createTileFeature(feature, featureIndex, geometry) {
    return {
        type: 'Feature',
        id: resolveFeatureId(feature, featureIndex),
        properties: feature.properties || {},
        geometry
    };
}

/**
 * 为 FeatureCollection 生成自定义 tile 数据。
 */
export function buildTiles(featureCollection, minZoom, maxZoom) {
    const tiles = new Map();

    featureCollection.features.forEach((feature, featureIndex) => {
        const featureBounds = calculateFeatureBounds(feature);

        if (!featureBounds) {
            return;
        }

        for (let z = minZoom; z <= maxZoom; z += 1) {
            const minX = lngToTileX(featureBounds.minLng, z);
            const maxX = lngToTileX(featureBounds.maxLng, z);
            const minY = latToTileY(featureBounds.maxLat, z);
            const maxY = latToTileY(featureBounds.minLat, z);

            for (let x = minX; x <= maxX; x += 1) {
                for (let y = minY; y <= maxY; y += 1) {
                    const tileBounds = getTileBounds(z, x, y);

                    if (!boundsIntersect(featureBounds, tileBounds)) {
                        continue;
                    }

                    const clippedGeometry = clipGeometry(feature.geometry, tileBounds);
                    if (!clippedGeometry) {
                        continue;
                    }

                    const tileKey = createTileKey(z, x, y);
                    if (!tiles.has(tileKey)) {
                        tiles.set(tileKey, {
                            version: 1,
                            z,
                            x,
                            y,
                            features: []
                        });
                    }

                    tiles.get(tileKey).features.push(
                        createTileFeature(feature, featureIndex, clippedGeometry)
                    );
                }
            }
        }
    });

    return Array.from(tiles.values()).sort((left, right) => {
        if (left.z !== right.z) {
            return left.z - right.z;
        }

        if (left.x !== right.x) {
            return left.x - right.x;
        }

        return left.y - right.y;
    });
}
