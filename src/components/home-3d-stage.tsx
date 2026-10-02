"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

export function Home3DStage() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 1. Scene & Camera setup
    const scene = new THREE.Scene();
    const width = container.clientWidth || 400;
    const height = container.clientHeight || 300;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 0, 8);

    // 2. WebGL Renderer with alpha transparency
    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // 3. Lighting (LiveStream Stage Neon Lighting)
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);

    const cyanLight = new THREE.PointLight(0x00f2fe, 3, 20);
    cyanLight.position.set(4, 3, 4);
    scene.add(cyanLight);

    const goldLight = new THREE.PointLight(0xf59e0b, 2.5, 20);
    goldLight.position.set(-4, -2, 3);
    scene.add(goldLight);

    const blueLight = new THREE.PointLight(0x38bdf8, 2, 20);
    blueLight.position.set(0, -3, 2);
    scene.add(blueLight);

    // 4. Central 3D Faceted Diamond
    const diamondGroup = new THREE.Group();
    scene.add(diamondGroup);

    // Main diamond body (Octahedron for gemstone facets)
    const diamondGeo = new THREE.OctahedronGeometry(1.5, 0);
    const diamondMat = new THREE.MeshPhongMaterial({
      color: 0x0284c7,
      emissive: 0x0369a1,
      emissiveIntensity: 0.4,
      specular: 0x38bdf8,
      shininess: 120,
      transparent: true,
      opacity: 0.88,
      flatShading: true,
    });
    const diamondMesh = new THREE.Mesh(diamondGeo, diamondMat);
    diamondGroup.add(diamondMesh);

    // Outer wireframe glowing edges
    const wireGeo = new THREE.OctahedronGeometry(1.52, 0);
    const wireMat = new THREE.MeshBasicMaterial({
      color: 0x7dd3fc,
      wireframe: true,
      transparent: true,
      opacity: 0.75,
    });
    const wireMesh = new THREE.Mesh(wireGeo, wireMat);
    diamondGroup.add(wireMesh);

    // Inner glowing core
    const coreGeo = new THREE.IcosahedronGeometry(0.75, 0);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      wireframe: true,
      transparent: true,
      opacity: 0.9,
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    diamondGroup.add(coreMesh);

    // 5. Orbital Energy Rings (Live Stream Broadcast Rings)
    const ring1Geo = new THREE.TorusGeometry(2.3, 0.035, 16, 100);
    const ring1Mat = new THREE.MeshBasicMaterial({
      color: 0x00f2fe,
      transparent: true,
      opacity: 0.65,
    });
    const ring1 = new THREE.Mesh(ring1Geo, ring1Mat);
    ring1.rotation.x = Math.PI / 3;
    ring1.rotation.y = Math.PI / 6;
    scene.add(ring1);

    const ring2Geo = new THREE.TorusGeometry(2.7, 0.025, 16, 100);
    const ring2Mat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.5,
    });
    const ring2 = new THREE.Mesh(ring2Geo, ring2Mat);
    ring2.rotation.x = -Math.PI / 4;
    ring2.rotation.y = Math.PI / 4;
    scene.add(ring2);

    // 6. Sparkling Star Particle Cloud
    const particleCount = 200;
    const particleGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    const cyanColor = new THREE.Color(0x38bdf8);
    const goldColor = new THREE.Color(0xfbbf24);

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 12;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 8;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 8;

      const chosenColor = Math.random() > 0.4 ? cyanColor : goldColor;
      colors[i * 3] = chosenColor.r;
      colors[i * 3 + 1] = chosenColor.g;
      colors[i * 3 + 2] = chosenColor.b;
    }

    particleGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    particleGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const particleMat = new THREE.PointsMaterial({
      size: 0.09,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
    });

    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    // 7. Mouse Parallax Interaction
    let mouseX = 0;
    let mouseY = 0;
    let targetX = 0;
    let targetY = 0;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      mouseX = x * 1.5;
      mouseY = y * 1.5;
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });

    // 8. Animation Loop
    let animId: number;
    const timer = new THREE.Timer();
    timer.connect(document);

    const animate = () => {
      animId = requestAnimationFrame(animate);

      // Skip rendering if container is hidden or offscreen
      if (document.hidden) return;

      timer.update();
      const elapsedTime = timer.getElapsed();

      // Diamond float and rotation
      diamondGroup.rotation.y = elapsedTime * 0.4;
      diamondGroup.rotation.x = Math.sin(elapsedTime * 0.3) * 0.2;
      diamondGroup.position.y = Math.sin(elapsedTime * 0.8) * 0.15;

      // Orbitals rotation
      ring1.rotation.z = elapsedTime * 0.25;
      ring2.rotation.z = -elapsedTime * 0.2;

      // Particle floating drift
      particles.rotation.y = elapsedTime * 0.05;

      // Mouse parallax smooth lerp
      targetX += (mouseX - targetX) * 0.05;
      targetY += (mouseY - targetY) * 0.05;
      camera.position.x = targetX * 1.2;
      camera.position.y = -targetY * 1.2;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    };

    animate();

    // 9. Resize Handling
    const handleResize = () => {
      if (!container) return;
      const newWidth = container.clientWidth || 400;
      const newHeight = container.clientHeight || 300;
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    // 10. Clean up on unmount
    return () => {
      cancelAnimationFrame(animId);
      timer.dispose();
      window.removeEventListener("mousemove", handleMouseMove);
      resizeObserver.disconnect();

      diamondGeo.dispose();
      diamondMat.dispose();
      wireGeo.dispose();
      wireMat.dispose();
      coreGeo.dispose();
      coreMat.dispose();
      ring1Geo.dispose();
      ring1Mat.dispose();
      ring2Geo.dispose();
      ring2Mat.dispose();
      particleGeo.dispose();
      particleMat.dispose();
      renderer.dispose();

      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="home-3d-canvas-wrap"
      aria-hidden="true"
      suppressHydrationWarning
    />
  );
}
