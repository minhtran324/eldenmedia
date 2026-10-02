"use client";
import { useEffect, useRef } from "react";
import type { BufferGeometry } from "three";

// All objects are procedural geometry; no icon pack, external model or texture.
export function DeskScene({ variant, paused }: { variant: "operator" | "idol"; paused: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let dispose: (() => void) | undefined;
    async function mount() {
      const THREE = await import("three");
      if (cancelled || !host) return;
      let renderer: InstanceType<typeof THREE.WebGLRenderer>;
      try { renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" }); }
      catch { return; } // CSS sculpture remains visible when WebGL is unavailable.
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(38, 1, .1, 50);
      camera.position.set(0, 1.7, 8);
      camera.lookAt(0, 0, 0);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.setClearColor(0x000000, 0);
      host.appendChild(renderer.domElement);
      host.dataset.ready = "true";
      scene.add(new THREE.AmbientLight(0xffffff, 2.2));
      const light = new THREE.DirectionalLight(0xb7fff4, 5);
      light.position.set(3, 5, 4); scene.add(light);
      const rim = new THREE.PointLight(0x47bfff, 35);
      rim.position.set(-3, 1, 2); scene.add(rim);
      const root = new THREE.Group(); scene.add(root);
      const mint = new THREE.MeshStandardMaterial({ color: 0x80f5d2, metalness: .55, roughness: .18 });
      const blue = new THREE.MeshStandardMaterial({ color: 0x2285bc, metalness: .5, roughness: .25 });
      const pale = new THREE.MeshStandardMaterial({ color: 0xeafff8, metalness: .35, roughness: .22 });
      const navy = new THREE.MeshStandardMaterial({ color: 0x194b61, metalness: .65, roughness: .3 });
      const floating: { mesh: InstanceType<typeof THREE.Mesh>; y: number; phase: number }[] = [];
      function mesh(geometry: BufferGeometry, material: InstanceType<typeof THREE.Material>, x=0, y=0, z=0) {
        const object = new THREE.Mesh(geometry, material); object.position.set(x,y,z); root.add(object); return object;
      }
      if (variant === "operator") {
        const platform = mesh(new THREE.CylinderGeometry(2.1,2.35,.24,6),navy,0,-1,0);
        platform.rotation.y=.5;
        [-1,0,1].forEach((x,i) => {
          const h=[1.1,2,1.5][i];
          mesh(new THREE.BoxGeometry(.67,h,.67),i===1?mint:blue,x,-.85+h/2,0);
          const gem=mesh(new THREE.OctahedronGeometry(.34),pale,x,h-.25,0);
          floating.push({mesh:gem,y:gem.position.y,phase:i*1.4});
        });
      } else {
        const gemGeometry=new THREE.OctahedronGeometry(1.35,0);
        const gem=mesh(gemGeometry,mint,0,.15,0);
        gem.rotation.z=.15; floating.push({mesh:gem,y:.15,phase:0});
        const edges=new THREE.LineSegments(new THREE.EdgesGeometry(gemGeometry),new THREE.LineBasicMaterial({color:0xe5fff6,transparent:true,opacity:.55}));
        gem.add(edges);
        const base=mesh(new THREE.CylinderGeometry(1.25,1.5,.18,48),navy,0,-1.65,0); base.rotation.y=.3;
      }
      const ring=mesh(new THREE.TorusGeometry(2.15,.018,8,100),pale);
      ring.rotation.set(1.1,.3,.2);
      const orbit=mesh(new THREE.TorusGeometry(2.6,.009,6,100),blue);
      orbit.rotation.set(.8,-.65,0);
      for(let i=0;i<6;i++){
        const angle=i*Math.PI/3;
        const satellite=mesh(new THREE.IcosahedronGeometry(.07+(i%2)*.04),i%2?mint:pale,Math.cos(angle)*2.7,Math.sin(angle)*1.9,Math.sin(angle)*.8);
        floating.push({mesh:satellite,y:satellite.position.y,phase:i});
      }
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
      const timer=new THREE.Timer(); timer.connect(document);
      let visible=true, frame=0, lastPaint=0, pointerX=0, pointerY=0;
      function render(time: number) {
        root.rotation.y=Math.sin(time*.22)*.2+pointerX*.15;
        root.rotation.x=pointerY*.08;
        floating.forEach(({mesh,y,phase}) => {mesh.position.y=y+Math.sin(time*.8+phase)*.12;mesh.rotation.y=time*.25+phase;});
        ring.rotation.z=time*.12; orbit.rotation.z=-time*.07;
        renderer.render(scene,camera);
      }
      function animate(timestamp: number) {
        frame=0;
        if(cancelled || paused || reduced.matches || document.hidden || !visible) return;
        frame=requestAnimationFrame(animate);
        if(timestamp-lastPaint<1000/30) return;
        lastPaint=timestamp; timer.update(timestamp); render(timer.getElapsed());
      }
      function syncAnimation() {
        cancelAnimationFrame(frame); frame=0; timer.reset();
        if(!paused && !reduced.matches && !document.hidden && visible) frame=requestAnimationFrame(animate);
      }
      function resize() {
        if(!host) return;
        const width=Math.max(host.clientWidth,1),height=Math.max(host.clientHeight,1);
        renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();render(timer.getElapsed());
      }
      function pointer(event: PointerEvent) {
        if(paused || reduced.matches || event.pointerType!=="mouse" || !host) return;
        const rect=host.getBoundingClientRect();pointerX=(event.clientX-rect.left)/rect.width-.5;pointerY=(event.clientY-rect.top)/rect.height-.5;
      }
      const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(host);
      const intersection=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;syncAnimation();});intersection.observe(host);
      host.addEventListener("pointermove",pointer);
      document.addEventListener("visibilitychange",syncAnimation);
      reduced.addEventListener("change",syncAnimation);
      resize();syncAnimation();
      dispose=()=>{
        cancelAnimationFrame(frame);timer.dispose();resizeObserver.disconnect();intersection.disconnect();
        host.removeEventListener("pointermove",pointer);document.removeEventListener("visibilitychange",syncAnimation);reduced.removeEventListener("change",syncAnimation);
        const geometries=new Set<InstanceType<typeof THREE.BufferGeometry>>(), materials=new Set<InstanceType<typeof THREE.Material>>();
        scene.traverse(object=>{if(object instanceof THREE.Mesh || object instanceof THREE.LineSegments){geometries.add(object.geometry);(Array.isArray(object.material)?object.material:[object.material]).forEach(m=>materials.add(m));}});
        geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
        // Materials unused in one scene variant still need cleanup.
        [mint,blue,pale,navy].forEach(m=>{if(!materials.has(m))m.dispose();});
        renderer.dispose();renderer.domElement.remove();delete host.dataset.ready;
      };
    }
    void mount().catch(()=>{dispose?.();});
    return ()=>{cancelled=true;dispose?.();};
  }, [variant, paused]);
  return <div className="desk-scene" ref={hostRef} aria-hidden="true"><div className="desk-scene-fallback"><i /><i /><i /></div></div>;
}
