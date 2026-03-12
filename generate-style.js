#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateStyleFile } from './src/generateStyle.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 解析命令行参数
 */
function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        input: './input/airspaceData.json',
        output: './output/style.json',
        tilesPath: './tiles/{z}/{x}/{y}.pbf',
        name: 'GeoJSON Tiles',
        minZoom: 0,
        maxZoom: 14,
        center: null,
        zoom: 2,
        sourceLayer: 'data'
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        const nextArg = args[i + 1];

        switch (arg) {
            case '-i':
            case '--input':
                options.input = nextArg;
                i++;
                break;
            case '-o':
            case '--output':
                options.output = nextArg;
                i++;
                break;
            case '-t':
            case '--tiles-path':
                options.tilesPath = nextArg;
                i++;
                break;
            case '-n':
            case '--name':
                options.name = nextArg;
                i++;
                break;
            case '--min-zoom':
                options.minZoom = parseInt(nextArg);
                i++;
                break;
            case '--max-zoom':
                options.maxZoom = parseInt(nextArg);
                i++;
                break;
            case '--center':
                const coords = nextArg.split(',').map(Number);
                if (coords.length === 2) {
                    options.center = coords;
                }
                i++;
                break;
            case '--zoom':
                options.zoom = parseFloat(nextArg);
                i++;
                break;
            case '--source-layer':
                options.sourceLayer = nextArg;
                i++;
                break;
            case '-h':
            case '--help':
                printHelp();
                process.exit(0);
        }
    }

    return options;
}

/**
 * 打印帮助信息
 */
function printHelp() {
    console.log(`
🎨 GeoJSON to MapLibre Style Generator

用法:
  node generate-style.js [选项]

选项:
  -i, --input <path>        输入的 GeoJSON 文件路径 (默认: ./input/airspaceData.json)
  -o, --output <path>       输出的样式文件路径 (默认: ./output/style.json)
  -t, --tiles-path <path>   PBF 瓦片路径模板 (默认: ./tiles/{z}/{x}/{y}.pbf)
  -n, --name <name>         地图样式名称 (默认: "GeoJSON Tiles")
  --min-zoom <level>        最小缩放级别 (默认: 0)
  --max-zoom <level>        最大缩放级别 (默认: 14)
  --center <lng,lat>        地图中心点 [经度,纬度] (默认: 自动计算)
  --zoom <level>            初始缩放级别 (默认: 2)
  --source-layer <name>     数据源图层名称 (默认: "data")
  -h, --help                显示帮助信息

示例:
  # 基本用法
  node generate-style.js

  # 指定输入输出
  node generate-style.js -i ./data/mydata.json -o ./style.json

  # 自定义瓦片路径和缩放级别
  node generate-style.js --tiles-path "http://localhost:8080/tiles/{z}/{x}/{y}.pbf" --max-zoom 18

  # 设置地图中心点和初始缩放
  node generate-style.js --center "114.222,22.687" --zoom 10
`);
}

/**
 * 自动计算地图中心点
 * @param {Object} geojson - GeoJSON 对象
 * @returns {Array} [lng, lat]
 */
function calculateCenter(geojson) {
    let minLng = Infinity, maxLng = -Infinity;
    let minLat = Infinity, maxLat = -Infinity;
    let hasCoordinates = false;

    const processCoords = (coords) => {
        if (Array.isArray(coords[0])) {
            coords.forEach(processCoords);
        } else {
            const [lng, lat] = coords;
            minLng = Math.min(minLng, lng);
            maxLng = Math.max(maxLng, lng);
            minLat = Math.min(minLat, lat);
            maxLat = Math.max(maxLat, lat);
            hasCoordinates = true;
        }
    };

    geojson.features?.forEach(feature => {
        if (feature.geometry?.coordinates) {
            processCoords(feature.geometry.coordinates);
        }
    });

    if (!hasCoordinates) {
        return [0, 0];
    }

    return [
        (minLng + maxLng) / 2,
        (minLat + maxLat) / 2
    ];
}

/**
 * 主函数
 */
function main() {
    console.log('\n🎨 MapLibre 样式生成器\n');

    const options = parseArgs();

    // 验证输入文件
    if (!fs.existsSync(options.input)) {
        console.error(`❌ 错误: 输入文件不存在: ${options.input}`);
        process.exit(1);
    }

    // 如果没有指定中心点，自动计算
    if (!options.center) {
        try {
            const geojson = JSON.parse(fs.readFileSync(options.input, 'utf8'));
            options.center = calculateCenter(geojson);
            console.log(`📍 自动计算中心点: [${options.center[0].toFixed(3)}, ${options.center[1].toFixed(3)}]`);
        } catch (error) {
            console.warn('⚠️  无法自动计算中心点，使用默认值 [0, 0]');
            options.center = [0, 0];
        }
    }

    // 生成样式文件
    try {
        generateStyleFile(options.input, options.output, {
            name: options.name,
            tilesPath: options.tilesPath,
            sourceLayer: options.sourceLayer,
            minZoom: options.minZoom,
            maxZoom: options.maxZoom,
            center: options.center,
            zoom: options.zoom
        });

        console.log('\n✨ 完成！\n');
        console.log('💡 使用提示:');
        console.log(`   在 MapLibre GL JS 中使用该样式:`);
        console.log(`   const map = new maplibregl.Map({`);
        console.log(`     container: 'map',`);
        console.log(`     style: '${path.resolve(options.output)}'`);
        console.log(`   });\n`);
    } catch (error) {
        console.error('\n❌ 生成失败:', error.message);
        process.exit(1);
    }
}

main();
