"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { useGLTF } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { MotionValue, useMotionValue } from "framer-motion";
import * as THREE from "three";
import { ScrollObserver } from "@/components/ScrollObserver";
import monitorModelUrl from "../../assets/3D/Monitor/Monitor 2/crt_monitor.glb?url";

function ModeCube({ side, label, progress }: { side: -1 | 1; label: string; progress: MotionValue<number> }) {
  const groupRef = useRef<THREE.Group>(null);
  const { viewport, size: canvasSize } = useThree();
  const panelPadding = THREE.MathUtils.clamp(canvasSize.width * 0.03, 16, 40);
  const panelPixelWidth = Math.min(canvasSize.width - panelPadding * 2, 1200);
  const panelPixelHeight = Math.max(420, panelPixelWidth * (2 / 3));
  const panelWidth = viewport.width * (panelPixelWidth / canvasSize.width);
  const panelHeight = viewport.height * (panelPixelHeight / canvasSize.height);
  const width = panelWidth * 0.34;
  const height = panelHeight * 0.39;
  const targetX = side * panelWidth * 0.16;
  const targetY = -panelHeight * 0.22;
  const { scene } = useGLTF(monitorModelUrl);

  const monitor = useMemo(() => {
    const object = scene.clone(true);
    const bounds = new THREE.Box3().setFromObject(object);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());

    object.position.sub(center);
    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    return { object, size };
  }, [scene]);

  const modelScale = Math.min(width / monitor.size.x, height / monitor.size.y) * 0.92;
  const labelTexture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    if (context) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "#ef2b26";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.font = '700 122px "Redaction 35", Georgia, serif';
      context.fillText(label, canvas.width / 2, canvas.height / 2, canvas.width * 0.94);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    return texture;
  }, [label]);

  useEffect(() => () => labelTexture.dispose(), [labelTexture]);
  const labelOffsetX = (viewport.width / canvasSize.width) * (side === -1 ? -10 : 15);

  useFrame(() => {
    const cube = groupRef.current;
    if (!cube) return;

    const entered = THREE.MathUtils.smootherstep(progress.get(), 0, 1);
    const startX = side * (viewport.width / 2 + width * 0.58);
    cube.position.x = THREE.MathUtils.lerp(startX, targetX, entered);
    cube.position.y = targetY;
    cube.rotation.x = THREE.MathUtils.lerp(0.58, 0.42, entered);
    cube.rotation.y = THREE.MathUtils.lerp(
      side * THREE.MathUtils.degToRad(60),
      side * THREE.MathUtils.degToRad(15),
      entered,
    );
    cube.rotation.z = THREE.MathUtils.lerp(side * 0.06, 0, entered);
  });

  return (
    <group ref={groupRef}>
      <primitive object={monitor.object} scale={modelScale} />
      <mesh position={[labelOffsetX, -height * 0.57, monitor.size.z * modelScale * 0.12]}>
        <planeGeometry args={[width * 0.72, width * 0.18]} />
        <meshBasicMaterial map={labelTexture} transparent depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

useGLTF.preload(monitorModelUrl);

function CubeScene({ progress }: { progress: MotionValue<number> }) {
  return (
    <>
      <ambientLight intensity={2.2} />
      <directionalLight position={[0, 8, 10]} intensity={1.15} color="#ffffff" />
      <directionalLight position={[-7, 1, 6]} intensity={0.4} color="#b6cbe6" />
      <ModeCube side={-1} label="Animatron" progress={progress} />
      <ModeCube side={1} label="Stop motion" progress={progress} />
    </>
  );
}

function FallbackMonitor({ side, progress }: { side: -1 | 1; progress: MotionValue<number> }) {
  const groupRef = useRef<THREE.Group>(null);
  const { viewport, size: canvasSize } = useThree();
  const panelPadding = THREE.MathUtils.clamp(canvasSize.width * 0.03, 16, 40);
  const panelPixelWidth = Math.min(canvasSize.width - panelPadding * 2, 1200);
  const panelPixelHeight = Math.max(420, panelPixelWidth * (2 / 3));
  const panelWidth = viewport.width * (panelPixelWidth / canvasSize.width);
  const panelHeight = viewport.height * (panelPixelHeight / canvasSize.height);
  const width = panelWidth * 0.34;
  const height = panelHeight * 0.39;
  const depth = width * 0.28;
  const targetX = side * panelWidth * 0.16;
  const targetY = -panelHeight * 0.22;

  useFrame(() => {
    const monitor = groupRef.current;
    if (!monitor) return;
    const entered = THREE.MathUtils.smootherstep(progress.get(), 0, 1);
    const startX = side * (viewport.width / 2 + width * 0.58);
    monitor.position.x = THREE.MathUtils.lerp(startX, targetX, entered);
    monitor.position.y = targetY;
    monitor.rotation.x = THREE.MathUtils.lerp(0.58, 0.42, entered);
    monitor.rotation.y = THREE.MathUtils.lerp(
      side * THREE.MathUtils.degToRad(60),
      side * THREE.MathUtils.degToRad(15),
      entered,
    );
    monitor.rotation.z = THREE.MathUtils.lerp(side * 0.06, 0, entered);
  });

  return (
    <group ref={groupRef}>
      <mesh>
        <boxGeometry args={[width * 0.86, height * 0.72, depth]} />
        <meshBasicMaterial color="#dedbd2" />
      </mesh>
      <mesh position={[0, 0, depth / 2 + 0.012]}>
        <planeGeometry args={[width * 0.68, height * 0.5]} />
        <meshBasicMaterial color="#111111" />
      </mesh>
      <mesh position={[0, -height * 0.47, 0]}>
        <boxGeometry args={[width * 0.12, height * 0.2, depth * 0.2]} />
        <meshBasicMaterial color="#cbc8bf" />
      </mesh>
      <mesh position={[0, -height * 0.59, 0]}>
        <boxGeometry args={[width * 0.42, height * 0.05, depth * 0.55]} />
        <meshBasicMaterial color="#cbc8bf" />
      </mesh>
    </group>
  );
}

function MonitorLoadingScene({ progress }: { progress: MotionValue<number> }) {
  return (
    <>
      <FallbackMonitor side={-1} progress={progress} />
      <FallbackMonitor side={1} progress={progress} />
    </>
  );
}

export default function ModeCubeSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const cubeProgress = useMotionValue(0);
  const stepRef = useRef(0);
  const [activeStep, setActiveStep] = useState(0);
  const [isCanvasActive, setIsCanvasActive] = useState(false);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const observer = new IntersectionObserver(
      ([entry]) => setIsCanvasActive(entry.isIntersecting),
      { rootMargin: "100% 0px 100% 0px" },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let frame = 0;
    const trackStickyProgress = () => {
      const section = sectionRef.current;
      if (section) {
        const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
        const rect = section.getBoundingClientRect();
        const stickyTravel = Math.max(1, rect.height - viewportHeight);
        const stickyProgress = THREE.MathUtils.clamp(-rect.top / stickyTravel, 0, 1);
        const nextStep = stickyProgress >= 0.58 ? 3 : stickyProgress >= 0.3 ? 2 : stickyProgress >= 0.08 ? 1 : 0;
        if (nextStep !== stepRef.current) {
          stepRef.current = nextStep;
          setActiveStep(nextStep);
        }
        // The cubes begin only when line two activates.
        cubeProgress.set(THREE.MathUtils.clamp((stickyProgress - 0.3) / 0.58, 0, 1));
      }
      frame = requestAnimationFrame(trackStickyProgress);
    };

    frame = requestAnimationFrame(trackStickyProgress);
    return () => cancelAnimationFrame(frame);
  }, [cubeProgress]);

  return (
    <section ref={sectionRef} id="modes" className="relative z-20 h-[260vh] bg-ink-900">
      <ScrollObserver className="sticky top-0 h-[100dvh] w-full overflow-visible">
        <div className="absolute inset-0 flex items-center justify-center px-[clamp(16px,3vw,40px)]">
          <div className="aspect-[3/2] min-h-[420px] w-full max-w-[1200px] rounded-[40px] bg-[#dddddd]" />
        </div>

        {isCanvasActive && (
          <Canvas
            camera={{ position: [0, 0, 10], fov: 38 }}
            dpr={[1, 1.25]}
            gl={{ alpha: true, antialias: false, powerPreference: "high-performance" }}
            className="pointer-events-none absolute inset-0 z-10 h-full w-full"
            style={{ background: "transparent" }}
          >
            <Suspense fallback={<MonitorLoadingScene progress={cubeProgress} />}>
              <CubeScene progress={cubeProgress} />
            </Suspense>
          </Canvas>
        )}

        <div className="absolute inset-0 z-20 flex items-center justify-center px-[clamp(16px,3vw,40px)]">
          <div className="relative aspect-[3/2] min-h-[420px] w-full max-w-[1200px]">
            <ScrollObserver.TriggerGroup className="pointer-events-none absolute inset-x-0 top-[7.5%] z-10 px-5 text-center text-[#090909]">
              {[
                "Animation should not be complicated",
                "That’s why we made the product",
                "Lao has two modes",
              ].map((line, index) => {
                const isActive = activeStep >= index + 1;
                const isLast = index === 2;
                return (
                  <ScrollObserver.Trigger key={line} className={clsx("relative", isLast && "mt-[clamp(38px,5.6vw,66px)]")}>
                    {() => (
                      <>
                        <p className={clsx({ "opacity-0": !isActive }, "absolute inset-0 m-0 font-display transition duration-700", isLast ? "text-[clamp(29px,3.4vw,42px)] leading-none" : "text-[clamp(32px,4.1vw,48px)] leading-[1.12]")}>
                          {line}
                        </p>
                        <p className={clsx("invisible relative m-0 font-display", isLast ? "text-[clamp(29px,3.4vw,42px)] leading-none" : "text-[clamp(32px,4.1vw,48px)] leading-[1.12]")}>
                          {line}
                        </p>
                      </>
                    )}
                  </ScrollObserver.Trigger>
                );
              })}
            </ScrollObserver.TriggerGroup>
          </div>
        </div>
      </ScrollObserver>
    </section>
  );
}
