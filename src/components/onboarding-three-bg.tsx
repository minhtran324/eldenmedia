"use client";

import { useEffect, useRef } from "react";

export function OnboardingThreeBg() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Check if user prefers reduced motion or device is low power
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    let isDisposed = false;
    let animId = 0;

    async function initThree() {
      try {
        const THREE = await import("three");
        if (isDisposed || !container) return;

        const width = container.clientWidth || window.innerWidth;
        const height = container.clientHeight || window.innerHeight;

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
        camera.position.z = 24;

        let renderer: InstanceType<typeof THREE.WebGLRenderer>;
        try {
          renderer = new THREE.WebGLRenderer({
            alpha: true,
            antialias: true,
            powerPreference: "low-power",
          });
        } catch {
          return;
        }

        renderer.setSize(width, height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        container.appendChild(renderer.domElement);

        // Ambient & Directional Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
        scene.add(ambientLight);

        const cyanLight = new THREE.PointLight(0x38bdf8, 3.5, 30);
        cyanLight.position.set(-8, 6, 8);
        scene.add(cyanLight);

        const goldLight = new THREE.PointLight(0xfbbf24, 2.8, 30);
        goldLight.position.set(8, -6, 6);
        scene.add(goldLight);

        // Group for rotating decorative gems
        const mainGroup = new THREE.Group();
        scene.add(mainGroup);

        // Floating Diamond / Crystal Wireframe
        const diamondGeo = new THREE.OctahedronGeometry(3.6, 0);
        const diamondMat = new THREE.MeshPhongMaterial({
          color: 0x0284c7,
          emissive: 0x0c4a6e,
          wireframe: true,
          transparent: true,
          opacity: 0.22,
        });
        const diamondMesh = new THREE.Mesh(diamondGeo, diamondMat);
        diamondMesh.position.set(-7, 2, -2);
        mainGroup.add(diamondMesh);

        // Concentric Rings
        const ringGeo = new THREE.TorusGeometry(5.2, 0.04, 16, 90);
        const ringMat = new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          transparent: true,
          opacity: 0.18,
        });
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.position.set(-7, 2, -2);
        ringMesh.rotation.x = Math.PI / 3;
        mainGroup.add(ringMesh);

        // Secondary small gem on opposite side
        const smallGemGeo = new THREE.IcosahedronGeometry(2.0, 0);
        const smallGemMat = new THREE.MeshPhongMaterial({
          color: 0xf59e0b,
          wireframe: true,
          transparent: true,
          opacity: 0.16,
        });
        const smallGem = new THREE.Mesh(smallGemGeo, smallGemMat);
        smallGem.position.set(9, -4, -4);
        mainGroup.add(smallGem);

        // Floating Constellation / Star Dust Particles
        const particleCount = 90;
        const particleGeo = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);

        const colorCyan = new THREE.Color(0x38bdf8);
        const colorAmber = new THREE.Color(0xfbbf24);

        for (let i = 0; i < particleCount; i++) {
          positions[i * 3] = (Math.random() - 0.5) * 36;
          positions[i * 3 + 1] = (Math.random() - 0.5) * 26;
          positions[i * 3 + 2] = (Math.random() - 0.5) * 16;

          const chosen = Math.random() > 0.35 ? colorCyan : colorAmber;
          colors[i * 3] = chosen.r;
          colors[i * 3 + 1] = chosen.g;
          colors[i * 3 + 2] = chosen.b;
        }

        particleGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        particleGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

        const particleMat = new THREE.PointsMaterial({
          size: 0.16,
          vertexColors: true,
          transparent: true,
          opacity: 0.75,
        });

        const particles = new THREE.Points(particleGeo, particleMat);
        scene.add(particles);

        // Resize handler
        function handleResize() {
          if (!container || isDisposed) return;
          const w = container.clientWidth || window.innerWidth;
          const h = container.clientHeight || window.innerHeight;
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
        }

        window.addEventListener("resize", handleResize);

        // Animation Loop
        let clock = 0;
        function animate() {
          if (isDisposed) return;
          clock += 0.007;

          diamondMesh.rotation.y = clock * 0.8;
          diamondMesh.rotation.x = Math.sin(clock * 0.5) * 0.3;
          ringMesh.rotation.z = clock * 0.4;
          smallGem.rotation.y = -clock * 0.6;
          smallGem.rotation.x = clock * 0.3;

          particles.rotation.y = clock * 0.15;
          particles.rotation.x = Math.sin(clock * 0.2) * 0.08;

          renderer.render(scene, camera);
          animId = requestAnimationFrame(animate);
        }

        animate();

        return () => {
          window.removeEventListener("resize", handleResize);
          cancelAnimationFrame(animId);
          diamondGeo.dispose();
          diamondMat.dispose();
          ringGeo.dispose();
          ringMat.dispose();
          smallGemGeo.dispose();
          smallGemMat.dispose();
          particleGeo.dispose();
          particleMat.dispose();
          renderer.dispose();
          if (renderer.domElement.parentNode) {
            renderer.domElement.parentNode.removeChild(renderer.domElement);
          }
        };
      } catch {
        // Fallback gracefully without 3D
      }
    }

    const cleanupPromise = initThree();

    return () => {
      isDisposed = true;
      cancelAnimationFrame(animId);
      cleanupPromise.then((cleanup) => cleanup && cleanup());
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="onboarding-bg-canvas"
      aria-hidden="true"
    />
  );
}
