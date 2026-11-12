'use client'

import { Html } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { LAND_DOTS } from '@/lib/land-dots'

export type Project = {
  slug: string
  place: string
  lat: number
  lon: number
}

type GlobeProps = {
  projects: Project[]
  /** Project currently highlighted (hovered on the globe or focused in the list). */
  active: number | null
  onActiveChange: (index: number | null) => void
  /** Project the globe should turn to face (keyboard focus in the list). */
  focus: number | null
  onOpen: (project: Project) => void
  reducedMotion: boolean
}

const RADIUS = 2
const FOV = 35
const CAMERA_Z = 9.4
const MAX_PITCH = 1.05
const AUTO_SPIN = 0.045 // radians per second
const ACCENT = '#ffd9a0'

const DEG = Math.PI / 180

function latLonToVec3(lat: number, lon: number, r: number) {
  const phi = lat * DEG
  const lam = lon * DEG
  return new THREE.Vector3(
    r * Math.cos(phi) * Math.sin(lam),
    r * Math.sin(phi),
    r * Math.cos(phi) * Math.cos(lam),
  )
}

// Rough terrain palette, so the land reads as ice, forest, desert and jungle.
const TERRAIN = {
  ice: [0.86, 0.92, 0.98],
  tundra: [0.52, 0.72, 0.8],
  boreal: [0.27, 0.62, 0.56],
  temperate: [0.5, 0.76, 0.42],
  tropical: [0.16, 0.7, 0.44],
  desert: [0.88, 0.6, 0.36],
} as const

// [latMin, latMax, lonMin, lonMax]
const DESERTS: [number, number, number, number][] = [
  [15, 32, -17, 35], // Sahara
  [13, 33, 35, 60], // Arabia
  [25, 45, 50, 75], // Iran and Central Asia
  [37, 47, 85, 112], // Gobi
  [-31, -19, 115, 142], // Australian interior
  [-30, -18, 12, 26], // Kalahari and Namib
  [23, 37, -118, -102], // Sonoran and Chihuahuan
  [-30, -17, -72, -68], // Atacama
  [-50, -38, -72, -65], // Patagonian steppe
]

function terrainColor(lat: number, lon: number, seed: number) {
  // Jitter the position a little so the bands dissolve into each other.
  const jitter = (n: number) => ((Math.sin(seed * n) * 43758.5453) % 1) * 4
  const la = lat + jitter(12.9898)
  const lo = lon + jitter(78.233)
  const abs = Math.abs(la)
  let c: readonly number[]
  if (la < -60 || la > 74 || (la > 60 && lo > -60 && lo < -15)) c = TERRAIN.ice
  else if (DESERTS.some(([a, b, w, e]) => la > a && la < b && lo > w && lo < e)) c = TERRAIN.desert
  else if (la > 62) c = TERRAIN.tundra
  else if (abs > 48) c = TERRAIN.boreal
  else if (abs > 23) c = TERRAIN.temperate
  else c = TERRAIN.tropical
  const shade = 0.85 + 0.15 * Math.abs(Math.sin(seed * 3.7))
  return [c[0] * shade, c[1] * shade, c[2] * shade]
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

function radialTexture(stops: [number, string][]) {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  stops.forEach(([at, color]) => g.addColorStop(at, color))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/* ---------- The sphere, its rim light and the dotted continents ---------- */

const coreMaterial = {
  vertexShader: /* glsl */ `
    varying vec3 vNormal;
    varying vec3 vView;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vNormal = normalize(normalMatrix * normal);
      vView = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */ `
    varying vec3 vNormal;
    varying vec3 vView;
    void main() {
      float rim = pow(1.0 - max(dot(vNormal, vView), 0.0), 3.5);
      vec3 base = vec3(0.022, 0.03, 0.045);
      vec3 glow = vec3(0.16, 0.27, 0.46);
      gl_FragColor = vec4(base + glow * rim, 1.0);
    }`,
}

const atmosphereMaterial = {
  vertexShader: /* glsl */ `
    varying vec3 vNormal;
    varying vec3 vView;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vNormal = normalize(normalMatrix * normal);
      vView = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */ `
    varying vec3 vNormal;
    varying vec3 vView;
    void main() {
      // Back faces of a slightly larger sphere: brightest where it meets the globe's edge.
      float d = max(dot(-vNormal, vView), 0.0);
      float a = pow(smoothstep(0.0, 0.62, d), 2.2) * 0.55;
      gl_FragColor = vec4(vec3(0.3, 0.5, 0.85) * a, a);
    }`,
}

const landMaterial = {
  vertexShader: /* glsl */ `
    uniform float uSize;
    uniform float uScale;
    attribute vec3 aColor;
    varying float vFacing;
    varying vec3 vColor;
    void main() {
      vColor = aColor;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vec3 n = normalize(normalMatrix * normalize(position));
      vFacing = dot(n, normalize(-mv.xyz));
      gl_PointSize = max(uSize * uScale / -mv.z, 1.0);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */ `
    uniform float uOpacity;
    varying float vFacing;
    varying vec3 vColor;
    void main() {
      float d = length(gl_PointCoord - 0.5);
      float disc = 1.0 - smoothstep(0.32, 0.5, d);
      float a = disc * uOpacity * smoothstep(0.0, 0.45, vFacing);
      if (a < 0.01) discard;
      gl_FragColor = vec4(vColor, a * 0.9);
    }`,
}

/* ------------------------------- The scene ------------------------------- */

function Scene({ projects, active, onActiveChange, focus, onOpen, reducedMotion }: GlobeProps) {
  const { gl, camera, size } = useThree()

  const group = useRef<THREE.Group>(null)
  const landMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        ...landMaterial,
        uniforms: { uSize: { value: 0.024 }, uScale: { value: 1 }, uOpacity: { value: 0 } },
        transparent: true,
        depthWrite: false,
      }),
    [],
  )
  const glowRefs = useRef<(THREE.Sprite | null)[]>([])
  const ringRefs = useRef<(THREE.Sprite | null)[]>([])
  const coreRefs = useRef<(THREE.Sprite | null)[]>([])
  const labelRef = useRef<HTMLDivElement>(null)

  // Rotation state lives in refs so dragging never re-renders React.
  const rot = useRef({ yaw: 52 * DEG, pitch: 30 * DEG, vYaw: 0, vPitch: 0 })
  const target = useRef<{ yaw: number; pitch: number } | null>(null)
  const drag = useRef({ on: false, x: 0, y: 0, moved: 0 })
  const heat = useRef<number[]>(projects.map(() => 0))
  const clock = useRef(0)
  const activeRef = useRef(active)
  activeRef.current = active
  const focusRef = useRef(focus)
  focusRef.current = focus
  const callbacks = useRef({ onActiveChange, onOpen })
  callbacks.current = { onActiveChange, onOpen }

  const landGeometry = useMemo(() => {
    const positions = new Float32Array((LAND_DOTS.length / 2) * 3)
    const colors = new Float32Array((LAND_DOTS.length / 2) * 3)
    for (let i = 0; i < LAND_DOTS.length; i += 2) {
      const v = latLonToVec3(LAND_DOTS[i + 1] / 10, LAND_DOTS[i] / 10, RADIUS)
      positions.set([v.x, v.y, v.z], (i / 2) * 3)
      colors.set(terrainColor(LAND_DOTS[i + 1] / 10, LAND_DOTS[i] / 10, i + 1), (i / 2) * 3)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    g.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))
    return g
  }, [])

  const markers = useMemo(
    () => projects.map((p) => latLonToVec3(p.lat, p.lon, RADIUS * 1.006)),
    [projects],
  )

  const textures = useMemo(
    () => ({
      glow: radialTexture([
        [0, 'rgba(255,255,255,0.9)'],
        [0.25, 'rgba(255,255,255,0.28)'],
        [1, 'rgba(255,255,255,0)'],
      ]),
      ring: radialTexture([
        [0, 'rgba(255,255,255,0)'],
        [0.72, 'rgba(255,255,255,0)'],
        [0.86, 'rgba(255,255,255,1)'],
        [1, 'rgba(255,255,255,0)'],
      ]),
      core: radialTexture([
        [0, 'rgba(255,255,255,1)'],
        [0.7, 'rgba(255,255,255,1)'],
        [1, 'rgba(255,255,255,0)'],
      ]),
    }),
    [],
  )

  // Keep the globe comfortably inside the canvas at any aspect ratio.
  useEffect(() => {
    const aspect = size.width / size.height
    const tan = Math.tan((FOV * DEG) / 2)
    camera.position.set(0, 0, Math.max(CAMERA_Z, RADIUS / (0.78 * tan * aspect)))
    camera.updateProjectionMatrix()
    landMat.uniforms.uScale.value = (size.height * gl.getPixelRatio()) / (2 * tan)
  }, [camera, gl, landMat, size])

  // Turn to face a project when it gets keyboard focus.
  useEffect(() => {
    if (focus == null) {
      target.current = null
      return
    }
    const p = projects[focus]
    target.current = { yaw: -p.lon * DEG, pitch: p.lat * DEG }
  }, [focus, projects])

  // Pointer handling: drag to spin, hover or tap a dot to select it.
  useEffect(() => {
    const el = gl.domElement
    const v = new THREE.Vector3()
    const toCam = new THREE.Vector3()

    const pick = (clientX: number, clientY: number, reach: number) => {
      if (!group.current) return null
      const rect = el.getBoundingClientRect()
      let best: number | null = null
      let bestDist = reach
      markers.forEach((m, i) => {
        v.copy(m).applyMatrix4(group.current!.matrixWorld)
        toCam.copy(camera.position).sub(v).normalize()
        if (v.clone().normalize().dot(toCam) < 0.1) return
        v.project(camera)
        const sx = rect.left + (v.x * 0.5 + 0.5) * rect.width
        const sy = rect.top + (-v.y * 0.5 + 0.5) * rect.height
        const d = Math.hypot(sx - clientX, sy - clientY)
        if (d < bestDist) {
          bestDist = d
          best = i
        }
      })
      return best
    }

    const setActive = (hovered: number | null) => {
      // With nothing under the pointer, keep a keyboard-focused project highlighted.
      const i = hovered ?? focusRef.current
      if (i !== activeRef.current) {
        activeRef.current = i
        callbacks.current.onActiveChange(i)
      }
      el.style.cursor = drag.current.on ? 'grabbing' : i != null ? 'pointer' : 'grab'
    }

    // Radians of rotation per pixel, so the surface tracks the pointer.
    const perPixel = () => {
      const tan = Math.tan((FOV * DEG) / 2)
      const radiusPx = (RADIUS / (camera.position.z * tan)) * (el.clientHeight / 2)
      return 1 / radiusPx
    }

    const down = (e: PointerEvent) => {
      drag.current = { on: true, x: e.clientX, y: e.clientY, moved: 0 }
      target.current = null
      rot.current.vYaw = rot.current.vPitch = 0
      try {
        el.setPointerCapture(e.pointerId)
      } catch {
        // Pointer already gone; dragging still works while it stays over the canvas.
      }
      el.style.cursor = 'grabbing'
    }
    const move = (e: PointerEvent) => {
      const d = drag.current
      if (!d.on) {
        if (e.pointerType === 'mouse') setActive(pick(e.clientX, e.clientY, 26))
        return
      }
      const k = perPixel()
      const dx = (e.clientX - d.x) * k
      const dy = (e.clientY - d.y) * k
      d.moved += Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y)
      d.x = e.clientX
      d.y = e.clientY
      const r = rot.current
      r.yaw += dx
      r.pitch = THREE.MathUtils.clamp(r.pitch + dy, -MAX_PITCH, MAX_PITCH)
      r.vYaw = dx
      r.vPitch = dy
      if (d.moved > 6 && activeRef.current != null) callbacks.current.onActiveChange(null)
    }
    const up = (e: PointerEvent) => {
      const d = drag.current
      if (!d.on) return
      d.on = false
      if (d.moved <= 6) {
        rot.current.vYaw = rot.current.vPitch = 0
        const hit = pick(e.clientX, e.clientY, e.pointerType === 'mouse' ? 26 : 36)
        setActive(hit)
        if (hit != null) {
          const p = projects[hit]
          target.current = { yaw: -p.lon * DEG, pitch: p.lat * DEG }
          callbacks.current.onOpen(p)
        }
      } else {
        el.style.cursor = 'grab'
      }
    }
    const leave = () => {
      if (!drag.current.on) setActive(null)
    }

    el.style.cursor = 'grab'
    el.style.touchAction = 'none'
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    el.addEventListener('pointerleave', leave)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      el.removeEventListener('pointerleave', leave)
    }
  }, [camera, gl, markers, projects])

  const world = useMemo(() => new THREE.Vector3(), [])
  const toCamera = useMemo(() => new THREE.Vector3(), [])

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05)
    clock.current += delta
    const t = reducedMotion ? 100 : clock.current
    const r = rot.current

    if (!drag.current.on) {
      if (target.current) {
        const ease = 1 - Math.exp(-delta * 7)
        const dYaw = THREE.MathUtils.euclideanModulo(target.current.yaw - r.yaw + Math.PI, Math.PI * 2) - Math.PI
        r.yaw += dYaw * ease
        r.pitch += (THREE.MathUtils.clamp(target.current.pitch, -MAX_PITCH, MAX_PITCH) - r.pitch) * ease
      } else {
        // Coast after a drag, then settle back into a slow idle spin.
        const decay = Math.pow(0.94, delta * 60)
        r.yaw += r.vYaw
        r.pitch = THREE.MathUtils.clamp(r.pitch + r.vPitch, -MAX_PITCH, MAX_PITCH)
        r.vYaw *= decay
        r.vPitch *= decay
        if (activeRef.current == null) r.yaw += AUTO_SPIN * delta
      }
    }

    const g = group.current
    if (!g) return
    g.rotation.set(r.pitch, r.yaw, 0)
    g.updateMatrixWorld()

    landMat.uniforms.uOpacity.value = smoothstep(0.15, 1.5, t)

    markers.forEach((m, i) => {
      world.copy(m).applyMatrix4(g.matrixWorld)
      toCamera.copy(camera.position).sub(world).normalize()
      const facing = world.clone().normalize().dot(toCamera)
      const visible = smoothstep(0.04, 0.3, facing)

      // Dots light up one by one after the globe has faded in.
      const intro = smoothstep(0, 0.5, t - (1.3 + i * 0.22))
      const isActive = activeRef.current === i
      heat.current[i] += ((isActive ? 1 : 0) - heat.current[i]) * (1 - Math.exp(-delta * 10))
      const h = heat.current[i]
      const breathe = reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(clock.current * 2 + i * 1.7)

      const core = coreRefs.current[i]
      if (core) {
        core.scale.setScalar((0.05 + 0.022 * h) * intro)
        core.material.opacity = visible
      }
      const glow = glowRefs.current[i]
      if (glow) {
        glow.scale.setScalar((0.26 + 0.05 * breathe + 0.22 * h) * intro)
        glow.material.opacity = visible * (0.55 + 0.2 * breathe + 0.25 * h)
      }
      const ring = ringRefs.current[i]
      if (ring) {
        const phase = reducedMotion ? 0 : (clock.current * 0.4 + i * 0.27) % 1
        ring.scale.setScalar((0.1 + 0.34 * phase) * intro)
        ring.material.opacity = reducedMotion ? 0 : visible * Math.pow(1 - phase, 2) * 0.6
      }

      if (isActive && labelRef.current) {
        labelRef.current.style.opacity = String(visible * h)
      }
    })
  })

  const activeProject = active != null ? projects[active] : null

  return (
    <>
      <mesh scale={1.16}>
        <sphereGeometry args={[RADIUS, 64, 64]} />
        <shaderMaterial
          args={[atmosphereMaterial]}
          side={THREE.BackSide}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      <group ref={group}>
        <mesh>
          <sphereGeometry args={[RADIUS * 0.996, 96, 96]} />
          <shaderMaterial args={[coreMaterial]} />
        </mesh>

        <points geometry={landGeometry} material={landMat} />

        {markers.map((m, i) => (
          <group key={projects[i].slug} position={m}>
            <sprite ref={(s) => void (glowRefs.current[i] = s)} scale={0} renderOrder={2}>
              <spriteMaterial
                map={textures.glow}
                color={ACCENT}
                transparent
                depthTest={false}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
              />
            </sprite>
            <sprite ref={(s) => void (ringRefs.current[i] = s)} scale={0} renderOrder={2}>
              <spriteMaterial
                map={textures.ring}
                color={ACCENT}
                transparent
                depthTest={false}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
              />
            </sprite>
            <sprite ref={(s) => void (coreRefs.current[i] = s)} scale={0} renderOrder={3}>
              <spriteMaterial
                map={textures.core}
                color="#fff6e6"
                transparent
                depthTest={false}
                depthWrite={false}
              />
            </sprite>
          </group>
        ))}

        {activeProject && active != null && (
          <Html position={markers[active]} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
            <div ref={labelRef} className="globe-label" style={{ opacity: 0 }}>
              <span className="globe-label-line" />
              <span className="flex flex-col">
                <span className="text-[15px] font-medium leading-tight tracking-tight text-white">
                  {activeProject.slug}
                </span>
                <span className="mt-1 font-mono text-[10px] uppercase leading-none tracking-[0.18em] text-slate-400">
                  {activeProject.place}
                </span>
              </span>
            </div>
          </Html>
        )}
      </group>
    </>
  )
}

export default function Globe(props: GlobeProps) {
  return (
    <Canvas
      camera={{ position: [0, 0, CAMERA_Z], fov: FOV, near: 0.1, far: 100 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
    >
      <Scene {...props} />
    </Canvas>
  )
}
