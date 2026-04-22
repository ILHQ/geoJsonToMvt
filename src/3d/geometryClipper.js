const EPSILON = 1e-9;

/**
 * 复制坐标，避免裁剪逻辑改写原始输入。
 */
function clonePosition(position) {
    return position.slice(0, position.length);
}

/**
 * 判断两个坐标是否足够接近。
 */
function positionsEqual(left, right) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
        return false;
    }

    return left.every((value, index) => Math.abs(value - right[index]) <= EPSILON);
}

/**
 * 仅在存在差异时追加坐标，避免产生重复顶点。
 */
function appendDistinctPosition(positions, position) {
    if (positions.length === 0 || !positionsEqual(positions[positions.length - 1], position)) {
        positions.push(clonePosition(position));
    }
}

/**
 * 删除连续重复坐标。
 */
function removeSequentialDuplicatePositions(positions) {
    const result = [];

    positions.forEach(position => {
        appendDistinctPosition(result, position);
    });

    return result;
}

/**
 * 判断坐标是否位于边界框内。
 */
function isPointInsideBounds(position, bounds) {
    return (
        position[0] >= bounds.minLng - EPSILON &&
        position[0] <= bounds.maxLng + EPSILON &&
        position[1] >= bounds.minLat - EPSILON &&
        position[1] <= bounds.maxLat + EPSILON
    );
}

/**
 * 按线性插值生成裁剪后的坐标，第三维高度跟随插值。
 */
function interpolatePosition(start, end, ratio) {
    const position = [
        start[0] + (end[0] - start[0]) * ratio,
        start[1] + (end[1] - start[1]) * ratio
    ];

    if (start.length === 3 && end.length === 3) {
        position.push(start[2] + (end[2] - start[2]) * ratio);
    }

    return position;
}

/**
 * 使用 Liang-Barsky 算法裁剪线段。
 */
function clipSegment(start, end, bounds) {
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    let from = 0;
    let to = 1;

    function updateRange(p, q) {
        if (Math.abs(p) <= EPSILON) {
            return q >= -EPSILON;
        }

        const ratio = q / p;

        if (p < 0) {
            if (ratio > to) {
                return false;
            }

            if (ratio > from) {
                from = ratio;
            }

            return true;
        }

        if (ratio < from) {
            return false;
        }

        if (ratio < to) {
            to = ratio;
        }

        return true;
    }

    if (
        !updateRange(-dx, start[0] - bounds.minLng) ||
        !updateRange(dx, bounds.maxLng - start[0]) ||
        !updateRange(-dy, start[1] - bounds.minLat) ||
        !updateRange(dy, bounds.maxLat - start[1])
    ) {
        return null;
    }

    const clippedStart = interpolatePosition(start, end, from);
    const clippedEnd = interpolatePosition(start, end, to);

    if (positionsEqual(clippedStart, clippedEnd)) {
        return null;
    }

    return {
        start: clippedStart,
        end: clippedEnd
    };
}

/**
 * 裁剪单条线串，并在必要时拆分为多个可见线段。
 */
function clipLineStringCoordinates(coordinates, bounds) {
    const clippedLines = [];
    let currentLine = [];

    function flushCurrentLine() {
        if (currentLine.length < 2) {
            currentLine = [];
            return;
        }

        const deduped = removeSequentialDuplicatePositions(currentLine);
        if (deduped.length >= 2) {
            clippedLines.push(deduped);
        }

        currentLine = [];
    }

    for (let index = 0; index < coordinates.length - 1; index += 1) {
        const clippedSegment = clipSegment(coordinates[index], coordinates[index + 1], bounds);

        if (!clippedSegment) {
            flushCurrentLine();
            continue;
        }

        if (currentLine.length === 0) {
            currentLine = [clippedSegment.start, clippedSegment.end];
            continue;
        }

        if (positionsEqual(currentLine[currentLine.length - 1], clippedSegment.start)) {
            appendDistinctPosition(currentLine, clippedSegment.end);
            continue;
        }

        flushCurrentLine();
        currentLine = [clippedSegment.start, clippedSegment.end];
    }

    flushCurrentLine();
    return clippedLines;
}

/**
 * 取出未闭合的环。
 */
function openRing(ring) {
    if (ring.length > 1 && positionsEqual(ring[0], ring[ring.length - 1])) {
        return ring.slice(0, ring.length - 1).map(clonePosition);
    }

    return ring.map(clonePosition);
}

/**
 * 将环重新闭合。
 */
function closeRing(ring) {
    const deduped = removeSequentialDuplicatePositions(ring);

    if (deduped.length < 3) {
        return null;
    }

    const closed = deduped.map(clonePosition);
    if (!positionsEqual(closed[0], closed[closed.length - 1])) {
        closed.push(clonePosition(closed[0]));
    }

    if (closed.length < 4) {
        return null;
    }

    return closed;
}

/**
 * 计算线段与垂直裁剪边的交点。
 */
function intersectWithVerticalEdge(start, end, lng) {
    const denominator = end[0] - start[0];
    const ratio = Math.abs(denominator) <= EPSILON ? 0 : (lng - start[0]) / denominator;
    return interpolatePosition(start, end, Math.max(0, Math.min(1, ratio)));
}

/**
 * 计算线段与水平裁剪边的交点。
 */
function intersectWithHorizontalEdge(start, end, lat) {
    const denominator = end[1] - start[1];
    const ratio = Math.abs(denominator) <= EPSILON ? 0 : (lat - start[1]) / denominator;
    return interpolatePosition(start, end, Math.max(0, Math.min(1, ratio)));
}

/**
 * 将环按单条边做裁剪。
 */
function clipRingAgainstEdge(ring, isInside, getIntersection) {
    if (ring.length === 0) {
        return [];
    }

    const output = [];
    let previous = ring[ring.length - 1];
    let previousInside = isInside(previous);

    ring.forEach(current => {
        const currentInside = isInside(current);

        if (currentInside) {
            if (!previousInside) {
                appendDistinctPosition(output, getIntersection(previous, current));
            }

            appendDistinctPosition(output, current);
        } else if (previousInside) {
            appendDistinctPosition(output, getIntersection(previous, current));
        }

        previous = current;
        previousInside = currentInside;
    });

    return output;
}

/**
 * 使用 Sutherland-Hodgman 算法裁剪单个环。
 */
function clipRing(ring, bounds) {
    let clippedRing = openRing(ring);

    clippedRing = clipRingAgainstEdge(
        clippedRing,
        position => position[0] >= bounds.minLng - EPSILON,
        (start, end) => intersectWithVerticalEdge(start, end, bounds.minLng)
    );
    clippedRing = clipRingAgainstEdge(
        clippedRing,
        position => position[0] <= bounds.maxLng + EPSILON,
        (start, end) => intersectWithVerticalEdge(start, end, bounds.maxLng)
    );
    clippedRing = clipRingAgainstEdge(
        clippedRing,
        position => position[1] >= bounds.minLat - EPSILON,
        (start, end) => intersectWithHorizontalEdge(start, end, bounds.minLat)
    );
    clippedRing = clipRingAgainstEdge(
        clippedRing,
        position => position[1] <= bounds.maxLat + EPSILON,
        (start, end) => intersectWithHorizontalEdge(start, end, bounds.maxLat)
    );

    return closeRing(clippedRing);
}

/**
 * 裁剪 Polygon 坐标。
 */
function clipPolygonCoordinates(coordinates, bounds) {
    if (coordinates.length === 0) {
        return null;
    }

    const clippedOuterRing = clipRing(coordinates[0], bounds);
    if (!clippedOuterRing) {
        return null;
    }

    const clippedRings = [clippedOuterRing];

    coordinates.slice(1).forEach(ring => {
        const clippedHole = clipRing(ring, bounds);
        if (clippedHole) {
            clippedRings.push(clippedHole);
        }
    });

    return clippedRings;
}

/**
 * 将几何按瓦片边界裁剪为可写出的局部几何。
 */
export function clipGeometry(geometry, bounds) {
    switch (geometry.type) {
    case 'Point':
        return isPointInsideBounds(geometry.coordinates, bounds)
            ? {
                type: 'Point',
                coordinates: clonePosition(geometry.coordinates)
            }
            : null;

    case 'MultiPoint': {
        const visiblePoints = geometry.coordinates
            .filter(point => isPointInsideBounds(point, bounds))
            .map(clonePosition);

        if (visiblePoints.length === 0) {
            return null;
        }

        return {
            type: 'MultiPoint',
            coordinates: visiblePoints
        };
    }

    case 'LineString': {
        const clippedLines = clipLineStringCoordinates(geometry.coordinates, bounds);

        if (clippedLines.length === 0) {
            return null;
        }

        if (clippedLines.length === 1) {
            return {
                type: 'LineString',
                coordinates: clippedLines[0]
            };
        }

        return {
            type: 'MultiLineString',
            coordinates: clippedLines
        };
    }

    case 'MultiLineString': {
        const clippedLines = geometry.coordinates.flatMap(line => {
            return clipLineStringCoordinates(line, bounds);
        });

        if (clippedLines.length === 0) {
            return null;
        }

        return {
            type: 'MultiLineString',
            coordinates: clippedLines
        };
    }

    case 'Polygon': {
        const clippedPolygon = clipPolygonCoordinates(geometry.coordinates, bounds);

        if (!clippedPolygon) {
            return null;
        }

        return {
            type: 'Polygon',
            coordinates: clippedPolygon
        };
    }

    case 'MultiPolygon': {
        const clippedPolygons = geometry.coordinates
            .map(polygon => clipPolygonCoordinates(polygon, bounds))
            .filter(Boolean);

        if (clippedPolygons.length === 0) {
            return null;
        }

        return {
            type: 'MultiPolygon',
            coordinates: clippedPolygons
        };
    }

    default:
        throw new Error(`不支持的几何类型：${geometry.type}`);
    }
}
