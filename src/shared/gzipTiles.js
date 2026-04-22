import fs from 'fs';
import zlib from 'zlib';

/**
 * 将字节数格式化为更容易阅读的文本。
 */
function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) {
        return '0 B';
    }

    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let unitIndex = 0;

    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
    }

    return `${value.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}

/**
 * 递归收集目录中的所有 .pbf 文件。
 */
function collectPbfFiles(rootDir) {
    if (!fs.existsSync(rootDir)) {
        return [];
    }

    const entries = fs.readdirSync(rootDir, { withFileTypes: true });
    const files = [];

    entries.forEach(entry => {
        const fullPath = `${rootDir}/${entry.name}`;

        if (entry.isDirectory()) {
            files.push(...collectPbfFiles(fullPath));
            return;
        }

        if (entry.isFile() && entry.name.endsWith('.pbf')) {
            files.push(fullPath);
        }
    });

    return files.sort();
}

/**
 * 递归收集目录中的所有 .pbf.gz 文件。
 */
function collectLegacyGzipFiles(rootDir) {
    if (!fs.existsSync(rootDir)) {
        return [];
    }

    const entries = fs.readdirSync(rootDir, { withFileTypes: true });
    const files = [];

    entries.forEach(entry => {
        const fullPath = `${rootDir}/${entry.name}`;

        if (entry.isDirectory()) {
            files.push(...collectLegacyGzipFiles(fullPath));
            return;
        }

        if (entry.isFile() && entry.name.endsWith('.pbf.gz')) {
            files.push(fullPath);
        }
    });

    return files.sort();
}

/**
 * 将指定目录中的 .pbf 就地压缩为 gzip 内容，并保留 .pbf 扩展名。
 */
export function gzipTileDirectory(rootDir) {
    const pbfFiles = collectPbfFiles(rootDir);
    const legacyGzipFiles = collectLegacyGzipFiles(rootDir);
    let rawBytes = 0;
    let gzipBytes = 0;

    legacyGzipFiles.forEach(filePath => {
        fs.rmSync(filePath, { force: true });
    });

    pbfFiles.forEach(filePath => {
        const rawBuffer = fs.readFileSync(filePath);
        const gzipBuffer = zlib.gzipSync(rawBuffer, { level: 9 });

        rawBytes += rawBuffer.length;
        gzipBytes += gzipBuffer.length;
        fs.writeFileSync(filePath, gzipBuffer);
    });

    const ratio = rawBytes === 0
        ? 0
        : Number((((rawBytes - gzipBytes) / rawBytes) * 100).toFixed(2));

    return {
        fileCount: pbfFiles.length,
        removedLegacyGzipCount: legacyGzipFiles.length,
        rawBytes,
        gzipBytes,
        ratio,
        rawDisplay: formatBytes(rawBytes),
        gzipDisplay: formatBytes(gzipBytes)
    };
}
