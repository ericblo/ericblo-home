'use client'

import { Canvas, useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

// Continent polygons in [longitude, latitude] (-180..180, -90..90)
const CONTINENTS: [number, number][][] = [
  // North America
  [
    [-168, 65], [-160, 70], [-140, 70], [-125, 70], [-110, 73], [-95, 75],
    [-80, 73], [-65, 60], [-55, 52], [-60, 45], [-70, 42], [-75, 35],
    [-82, 28], [-88, 30], [-97, 26], [-106, 23], [-115, 32], [-122, 37],
    [-125, 48], [-130, 54], [-140, 58], [-155, 58], [-165, 55], [-168, 65],
  ],
  // Central America
  [
    [-97, 26], [-92, 18], [-85, 13], [-80, 9], [-77, 8], [-82, 15],
    [-88, 18], [-97, 26],
  ],
  // South America
  [
    [-80, 10], [-72, 12], [-62, 10], [-52, 5], [-45, -1], [-38, -8],
    [-38, -15], [-42, -23], [-48, -28], [-55, -35], [-62, -40], [-70, -52],
    [-73, -54], [-72, -45], [-70, -35], [-72, -25], [-75, -15], [-79, -5],
    [-80, 2], [-80, 10],
  ],
  // Greenland
  [
    [-52, 82], [-25, 83], [-20, 78], [-22, 70], [-35, 62], [-48, 60],
    [-55, 65], [-60, 72], [-58, 78], [-52, 82],
  ],
  // Africa
  [
    [-17, 21], [-10, 28], [0, 32], [10, 34], [20, 32], [30, 31],
    [35, 22], [42, 12], [51, 11], [50, 0], [42, -12], [40, -22],
    [32, -30], [25, -34], [18, -34], [12, -20], [8, -5], [0, 4],
    [-8, 6], [-15, 12], [-17, 21],
  ],
  // Europe
  [
    [-10, 36], [-5, 43], [0, 44], [8, 44], [15, 40], [20, 40],
    [28, 40], [35, 45], [40, 50], [30, 55], [20, 58], [10, 58],
    [0, 60], [-8, 58], [-10, 50], [-10, 36],
  ],
  // Scandinavia
  [
    [5, 58], [10, 64], [18, 68], [25, 70], [30, 68], [28, 62],
    [20, 60], [10, 58], [5, 58],
  ],
  // Asia
  [
    [35, 45], [40, 50], [50, 55], [60, 60], [75, 68], [90, 72],
    [105, 75], [130, 72], [145, 68], [160, 68], [175, 65], [180, 68],
    [180, 60], [165, 58], [155, 55], [145, 48], [140, 38], [135, 33],
    [125, 30], [122, 22], [115, 20], [108, 18], [100, 12], [95, 18],
    [88, 22], [80, 22], [72, 18], [68, 22], [62, 25], [55, 30],
    [48, 38], [40, 40], [35, 45],
  ],
  // Southeast Asia
  [
    [95, -2], [105, -5], [115, -8], [125, -8], [135, -5], [140, -2],
    [138, 2], [130, 5], [120, 8], [110, 4], [100, 2], [95, -2],
  ],
  // Japan
  [
    [131, 31], [136, 35], [141, 41], [145, 44], [142, 42], [138, 36],
    [133, 33], [131, 31],
  ],
  // Australia
  [
    [115, -20], [122, -17], [130, -12], [138, -13], [145, -15], [153, -24],
    [152, -32], [148, -38], [140, -38], [130, -33], [118, -34], [114, -28],
    [115, -20],
  ],
  // New Zealand
  [
    [170, -35], [175, -38], [178, -42], [172, -46], [167, -45], [170, -40],
    [170, -35],
  ],
  // Antarctica
  [
    [-180, -72], [-140, -75], [-100, -78], [-60, -78], [-20, -72], [20, -70],
    [60, -68], [100, -72], [140, -75], [180, -72], [180, -90], [-180, -90],
    [-180, -72],
  ],
]

function Earth() {
  const meshRef = useRef<THREE.Mesh>(null)

  const texture = useMemo(() => {
    const width = 4096
    const height = 2048
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')!

    // --- Ocean base ---
    const oceanGrad = ctx.createLinearGradient(0, 0, 0, height)
    oceanGrad.addColorStop(0, '#0b2a4a')
    oceanGrad.addColorStop(0.5, '#155190')
    oceanGrad.addColorStop(1, '#0b2a4a')
    ctx.fillStyle = oceanGrad
    ctx.fillRect(0, 0, width, height)

    // Ocean noise
    const oceanImg = ctx.getImageData(0, 0, width, height)
    for (let i = 0; i < oceanImg.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 10
      oceanImg.data[i] = Math.max(0, Math.min(255, oceanImg.data[i] + n))
      oceanImg.data[i + 1] = Math.max(0, Math.min(255, oceanImg.data[i + 1] + n))
      oceanImg.data[i + 2] = Math.max(0, Math.min(255, oceanImg.data[i + 2] + n))
    }
    ctx.putImageData(oceanImg, 0, 0)

    const toPx = (lon: number, lat: number): [number, number] => [
      ((lon + 180) / 360) * width,
      ((90 - lat) / 180) * height,
    ]

    // Build a Path2D for each continent and track bounding boxes
    type Shape = { path: Path2D; bbox: [number, number, number, number] }
    const shapes: Shape[] = CONTINENTS.map((coords) => {
      const path = new Path2D()
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity
      coords.forEach(([lon, lat], i) => {
        const [px, py] = toPx(lon, lat)
        if (i === 0) path.moveTo(px, py)
        else path.lineTo(px, py)
        minX = Math.min(minX, px)
        minY = Math.min(minY, py)
        maxX = Math.max(maxX, px)
        maxY = Math.max(maxY, py)
      })
      path.closePath()
      return { path, bbox: [minX, minY, maxX, maxY] }
    })

    // --- Fill each continent with a deep broccoli-green base ---
    shapes.forEach(({ path }) => {
      ctx.fillStyle = '#1f3d1a'
      ctx.fill(path)
    })

    // --- Broccoli florets: draw thousands of small radial-gradient blobs
    //     clipped to the continent shapes, layered for depth ---
    const drawFlorets = (
      shape: Shape,
      density: number,
      radiusRange: [number, number],
      palette: string[],
    ) => {
      const [minX, minY, maxX, maxY] = shape.bbox
      const area = (maxX - minX) * (maxY - minY)
      const count = Math.floor((area / 1000) * density)

      ctx.save()
      ctx.clip(shape.path)

      for (let i = 0; i < count; i++) {
        const x = minX + Math.random() * (maxX - minX)
        const y = minY + Math.random() * (maxY - minY)
        if (!ctx.isPointInPath(shape.path, x, y)) continue

        const r = radiusRange[0] + Math.random() * (radiusRange[1] - radiusRange[0])
        const color = palette[Math.floor(Math.random() * palette.length)]

        // Shadow side (bottom-right of floret)
        ctx.fillStyle = 'rgba(10, 25, 8, 0.55)'
        ctx.beginPath()
        ctx.arc(x + r * 0.25, y + r * 0.3, r, 0, Math.PI * 2)
        ctx.fill()

        // Main floret with radial gradient (bright top-left highlight)
        const grad = ctx.createRadialGradient(
          x - r * 0.3,
          y - r * 0.35,
          r * 0.05,
          x,
          y,
          r,
        )
        grad.addColorStop(0, '#b7e68a')
        grad.addColorStop(0.25, '#6fbf4a')
        grad.addColorStop(0.7, color)
        grad.addColorStop(1, '#0f2a0c')
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()

        // Tiny bud highlights on top to sell the broccoli bumps
        const buds = 3 + Math.floor(Math.random() * 4)
        for (let b = 0; b < buds; b++) {
          const ba = Math.random() * Math.PI * 2
          const bd = Math.random() * r * 0.55
          const bx = x + Math.cos(ba) * bd
          const by = y + Math.sin(ba) * bd
          const br = r * (0.12 + Math.random() * 0.18)
          ctx.fillStyle = 'rgba(175, 220, 120, 0.9)'
          ctx.beginPath()
          ctx.arc(bx - br * 0.25, by - br * 0.3, br, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      ctx.restore()
    }

    // Layer 1: larger base florets (forest canopy)
    const baseGreens = ['#2e5a22', '#3a6f2b', '#264d1a', '#427a33']
    shapes.forEach((s) => drawFlorets(s, 1.6, [8, 16], baseGreens))

    // Layer 2: medium florets with variety (hills)
    const midGreens = ['#4d8a38', '#5fa043', '#396f28', '#6aad4a']
    shapes.forEach((s) => drawFlorets(s, 2.4, [4, 9], midGreens))

    // Layer 3: small tight florets (dense broccoli crowns)
    const topGreens = ['#7cc257', '#8fd166', '#66a847', '#9ad972']
    shapes.forEach((s) => drawFlorets(s, 3.0, [2, 5], topGreens))

    // --- Polar ice overlay (soft) ---
    const iceTop = ctx.createLinearGradient(0, 0, 0, height * 0.1)
    iceTop.addColorStop(0, 'rgba(240,245,250,1)')
    iceTop.addColorStop(1, 'rgba(240,245,250,0)')
    ctx.fillStyle = iceTop
    ctx.fillRect(0, 0, width, height * 0.1)

    const iceBot = ctx.createLinearGradient(0, height * 0.9, 0, height)
    iceBot.addColorStop(0, 'rgba(240,245,250,0)')
    iceBot.addColorStop(1, 'rgba(240,245,250,1)')
    ctx.fillStyle = iceBot
    ctx.fillRect(0, height * 0.9, width, height * 0.1)

    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.wrapS = THREE.RepeatWrapping
    tex.anisotropy = 16
    return tex
  }, [])

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.15
    }
  })

  return (
    <mesh ref={meshRef} rotation={[0.25, 0, 0.15]}>
      <sphereGeometry args={[2, 256, 256]} />
      <meshStandardMaterial map={texture} roughness={0.85} metalness={0.05} />
    </mesh>
  )
}

export default function Home() {
  return (
    <div className="w-full h-screen relative bg-gradient-to-b from-slate-900 to-black">
      <div className="w-full h-full">
        <Canvas camera={{ position: [0, 0, 5], fov: 75 }}>
          <ambientLight intensity={0.9} />
          <directionalLight position={[5, 3, 5]} intensity={1.3} />
          <Earth />
        </Canvas>
      </div>
      <a
        href="/thebestpeople"
        target="_blank"
        rel="noopener noreferrer"
        className="absolute right-8 top-1/2 -translate-y-1/2 text-2xl font-bold text-white hover:text-blue-400 transition-colors duration-300"
      >
        thebestpeople
      </a>
      <a
        href="/balticway"
        target="_blank"
        rel="noopener noreferrer"
        className="absolute right-16 top-1/2 translate-y-8 text-2xl font-bold text-white hover:text-blue-400 transition-colors duration-300"
      >
        balticway
      </a>
      <a
        href="/thetiltedtimes"
        target="_blank"
        rel="noopener noreferrer"
        className="absolute right-24 top-1/2 translate-y-20 text-2xl font-bold text-white hover:text-blue-400 transition-colors duration-300"
      >
        thetiltedtimes
      </a>
      <a
        href="/underthecanopy"
        target="_blank"
        rel="noopener noreferrer"
        className="absolute right-32 top-1/2 translate-y-32 text-2xl font-bold text-white hover:text-blue-400 transition-colors duration-300"
      >
        underthecanopy
      </a>
    </div>
  )
}
