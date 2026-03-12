# GeoJSON to MVT + MapLibre Style

将 GeoJSON 数据转换为 MVT（Mapbox Vector Tiles）瓦片，并自动生成兼容 MapLibre/Mapbox 的样式配置文件。

## 功能特性

- ✅ 将 GeoJSON 转换为 MVT 瓦片（.pbf 格式）
- ✅ 自动分析 GeoJSON 数据结构
- ✅ 生成 MapLibre Style Specification 配置文件
- ✅ 兼容 Mapbox GL JS 和 MapLibre GL JS
- ✅ 自动识别几何类型并配置图层
- ✅ 自动提取颜色属性并应用
- ✅ 自动计算地图中心点
- ✅ 包含预览页面

## 安装依赖

```bash
pnpm install
```

## 快速开始

### 一键生成（瓦片 + 样式）

```bash
npm run generate-all
```

### 分别生成

```bash
# 仅生成 MVT 瓦片
npm run generate-tiles

# 仅生成样式文件
npm run generate-style
```

## 使用方式

### 1. 准备 GeoJSON 数据

将你的 GeoJSON 文件放在 `input/` 目录下，例如：

```bash
input/
└── airspaceData.json
```

### 2. 生成瓦片和样式

```bash
npm run generate-all
```

输出结构：

```
output/
├── tiles/          # MVT 瓦片文件
│   ├── 0/
│   ├── 1/
│   └── ...
├── style.json      # MapLibre 样式配置
└── preview.html    # 预览页面
```

### 3. 预览地图

在浏览器中打开 `output/preview.html`：

```bash
open output/preview.html
```

或在项目目录下启动一个简单的 HTTP 服务器：

```bash
# 使用 Python
python -m http.server 8080

# 使用 Node.js (需要先安装 http-server)
npx http-server output -p 8080
```

然后访问：http://localhost:8080/preview.html

## 高级用法

### 自定义样式生成

```bash
node generate-style.js [选项]
```

#### 可用选项

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `-i, --input <path>` | 输入 GeoJSON 文件路径 | `./input/airspaceData.json` |
| `-o, --output <path>` | 输出样式文件路径 | `./output/style.json` |
| `-t, --tiles-path <path>` | PBF 瓦片路径模板 | `./tiles/{z}/{x}/{y}.pbf` |
| `-n, --name <name>` | 地图样式名称 | `GeoJSON Tiles` |
| `--min-zoom <level>` | 最小缩放级别 | `0` |
| `--max-zoom <level>` | 最大缩放级别 | `14` |
| `--center <lng,lat>` | 地图中心点 [经度,纬度] | 自动计算 |
| `--zoom <level>` | 初始缩放级别 | `2` |
| `--source-layer <name>` | 数据源图层名称 | `data` |
| `-h, --help` | 显示帮助信息 | - |

#### 示例

```bash
# 基本用法
node generate-style.js

# 指定输入输出
node generate-style.js -i ./data/mydata.json -o ./style.json

# 自定义瓦片路径（支持 HTTP URL）
node generate-style.js --tiles-path "http://localhost:8080/tiles/{z}/{x}/{y}.pbf"

# 设置地图中心点和初始缩放
node generate-style.js --center "114.222,22.687" --zoom 10

# 自定义缩放级别范围
node generate-style.js --min-zoom 0 --max-zoom 18
```

## 在项目中使用样式

### MapLibre GL JS

```html
<script src="https://unpkg.com/maplibre-gl@4.1.0/dist/maplibre-gl.js"></script>
<link href="https://unpkg.com/maplibre-gl@4.1.0/dist/maplibre-gl.css" rel="stylesheet" />

<div id="map" style="width: 100%; height: 100vh;"></div>

<script>
const map = new maplibregl.Map({
    container: 'map',
    style: './output/style.json'
});
</script>
```

### Mapbox GL JS

```html
<script src="https://api.mapbox.com/mapbox-gl-js/v3.0.0/mapbox-gl.js"></script>
<link href="https://api.mapbox.com/mapbox-gl-js/v3.0.0/mapbox-gl.css" rel="stylesheet" />

<div id="map" style="width: 100%; height: 100vh;"></div>

<script>
const map = new mapboxgl.Map({
    container: 'map',
    style: './output/style.json'
});
</script>
```

### React 集成示例

```jsx
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef } from 'react';

function Map() {
    const mapContainer = useRef(null);

    useEffect(() => {
        const map = new maplibregl.Map({
            container: mapContainer.current,
            style: './output/style.json'
        });

        return () => map.remove();
    }, []);

    return <div ref={mapContainer} style={{ width: '100%', height: '100vh' }} />;
}

export default Map;
```

## 样式配置说明

### 自动识别的功能

生成器会自动分析 GeoJSON 数据并：

1. **识别几何类型**：Point、LineString、Polygon 等
2. **提取属性字段**：分析所有可用的属性
3. **应用颜色属性**：如果要素包含 `color` 属性，会自动应用
4. **计算中心点**：基于所有要素的边界框计算地图中心
5. **配置图层**：根据几何类型生成对应的图层配置

### 样式文件结构

```json
{
  "version": 8,
  "name": "GeoJSON Tiles",
  "metadata": {
    "maplibre:composer": "geoJsonToMvt",
    "geojson:featureCount": 201048,
    "geojson:geometryTypes": ["Point"]
  },
  "center": [114.222, 22.696],
  "zoom": 2,
  "sources": {
    "vector-tiles": {
      "type": "vector",
      "tiles": ["./tiles/{z}/{x}/{y}.pbf"],
      "minzoom": 0,
      "maxzoom": 14
    }
  },
  "layers": [
    {
      "id": "background",
      "type": "background",
      "paint": {
        "background-color": "#f8fafc"
      }
    },
    {
      "id": "point-layer",
      "type": "circle",
      "source": "vector-tiles",
      "source-layer": "data",
      "paint": {
        "circle-radius": 6,
        "circle-color": ["get", "color"],
        "circle-opacity": 0.8
      }
    }
  ]
}
```

## 自定义样式

### 方法 1：编辑生成的 style.json

直接编辑 `output/style.json` 文件，参考 [MapLibre Style Specification](https://maplibre.org/maplibre-style-spec/)。

### 方法 2：使用 Maputnik

[Maputnik](https://maplibre.org/maputnik/) 是一个开源的 Mapbox 样式编辑器：

```bash
docker run -p 8080:8080 maputnik/editor
```

1. 打开 http://localhost:8080
2. 加载你的 `style.json`
3. 可视化编辑样式
4. 导出修改后的样式

## 常见问题

### Q: 如何支持多种几何类型？

A: 生成器会自动识别 GeoJSON 中的所有几何类型，并为每种类型创建对应的图层。

### Q: 如何自定义颜色？

A: 在 GeoJSON 的要素属性中添加 `color` 字段：

```json
{
  "type": "Feature",
  "properties": {
    "color": "#ff0000"
  },
  "geometry": {...}
}
```

### Q: 瓦片路径支持相对路径吗？

A: 支持。你可以使用相对路径（`./tiles/{z}/{x}/{y}.pbf`）或绝对 URL（`http://localhost:8080/tiles/{z}/{x}/{y}.pbf`）。

### Q: 如何优化大文件性能？

A:
- 调整 `maxZoom` 参数（降低最大缩放级别）
- 使用 `--min-zoom` 和 `--max-zoom` 控制瓦片生成范围
- 考虑使用数据简化工具预处理 GeoJSON

## 技术栈

- **geojson-vt**: GeoJSON 切片库
- **vt-pbf**: MVT 编码库
- **MapLibre GL JS**: 地图渲染引擎

## 许可证

ISC

## 相关资源

- [MapLibre Style Specification](https://maplibre.org/maplibre-style-spec/)
- [Mapbox GL JS](https://docs.mapbox.com/mapbox-gl-js/)
- [Maputnik Editor](https://maplibre.org/maputnik/)
- [geojson-vt 文档](https://github.com/mapbox/geojson-vt)
