"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Phase = "menu" | "running" | "paused" | "complete";
type GameUI = { distance: number; speed: number; energy: number; shards: number; mode: number };
type WorldObject = { z: number; lane: number; kind: "obelisk" | "shard"; hit?: boolean };

const TRACK_END = 3600;
const MODE_NAMES = ["LINE", "LIGHT", "PAPER"];
const OBJECTS: WorldObject[] = [
  { z: 350, lane: -.65, kind: "shard" }, { z: 520, lane: .45, kind: "obelisk" },
  { z: 710, lane: -.25, kind: "shard" }, { z: 880, lane: -.72, kind: "obelisk" },
  { z: 1050, lane: .55, kind: "shard" }, { z: 1210, lane: .2, kind: "obelisk" },
  { z: 1380, lane: -.55, kind: "shard" }, { z: 1540, lane: .62, kind: "obelisk" },
  { z: 1710, lane: .12, kind: "shard" }, { z: 1900, lane: -.45, kind: "obelisk" },
  { z: 2090, lane: .62, kind: "shard" }, { z: 2260, lane: .05, kind: "obelisk" },
  { z: 2440, lane: -.62, kind: "shard" }, { z: 2600, lane: .58, kind: "obelisk" },
  { z: 2790, lane: -.15, kind: "shard" }, { z: 2960, lane: -.66, kind: "obelisk" },
  { z: 3150, lane: .55, kind: "shard" }, { z: 3310, lane: .1, kind: "obelisk" },
  { z: 3460, lane: -.5, kind: "shard" },
];

function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function mix(a: number, b: number, t: number) { return a + (b - a) * t; }

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);
  const phaseRef = useRef<Phase>("menu");
  const keysRef = useRef<Record<string, boolean>>({});
  const stateRef = useRef({ distance: 0, speed: 0, lane: 0, energy: 100, shards: 0, time: 0, shake: 0, flash: 0, objects: OBJECTS.map(o => ({ ...o })) });
  const audioRef = useRef<AudioContext | null>(null);
  const engineRef = useRef<OscillatorNode | null>(null);
  const engineGainRef = useRef<GainNode | null>(null);
  const [phase, setPhase] = useState<Phase>("menu");
  const [sound, setSound] = useState(true);
  const [help, setHelp] = useState(false);
  const [ui, setUi] = useState<GameUI>({ distance: 0, speed: 0, energy: 100, shards: 0, mode: 0 });

  useEffect(() => { phaseRef.current = phase; }, [phase]);

  const stopAudio = useCallback(() => {
    try { engineRef.current?.stop(); } catch { /* already stopped */ }
    engineRef.current = null;
    if (audioRef.current) void audioRef.current.close();
    audioRef.current = null;
  }, []);

  const startAudio = useCallback(() => {
    if (!sound || audioRef.current) return;
    const AudioCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;
    const ctx = new AudioCtor();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    osc.type = "sawtooth"; osc.frequency.value = 52;
    filter.type = "lowpass"; filter.frequency.value = 240;
    gain.gain.value = .018;
    osc.connect(filter).connect(gain).connect(ctx.destination); osc.start();
    audioRef.current = ctx; engineRef.current = osc; engineGainRef.current = gain;
  }, [sound]);

  const ping = useCallback((frequency = 540) => {
    const ctx = audioRef.current; if (!ctx || !sound) return;
    const osc = ctx.createOscillator(); const gain = ctx.createGain();
    osc.type = "sine"; osc.frequency.setValueAtTime(frequency, ctx.currentTime); osc.frequency.exponentialRampToValueAtTime(frequency * 1.8, ctx.currentTime + .18);
    gain.gain.setValueAtTime(.08, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .26);
    osc.connect(gain).connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + .28);
  }, [sound]);

  const resetGame = useCallback(() => {
    stateRef.current = { distance: 0, speed: 0, lane: 0, energy: 100, shards: 0, time: 0, shake: 0, flash: 0, objects: OBJECTS.map(o => ({ ...o })) };
    setUi({ distance: 0, speed: 0, energy: 100, shards: 0, mode: 0 });
  }, []);

  const begin = useCallback(() => {
    resetGame(); startAudio(); setHelp(false); setPhase("running");
  }, [resetGame, startAudio]);

  const togglePause = useCallback(() => {
    setPhase(current => current === "running" ? "paused" : current === "paused" ? "running" : current);
  }, []);

  const setControl = useCallback((key: string, active: boolean) => { keysRef.current[key] = active; }, []);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (["arrowleft", "arrowright", "arrowup", "arrowdown", "a", "d", "w", "s", " "].includes(key)) event.preventDefault();
      keysRef.current[key] = true;
      if (key === "escape") togglePause();
      if (key === " " && phaseRef.current === "menu") begin();
    };
    const up = (event: KeyboardEvent) => { keysRef.current[event.key.toLowerCase()] = false; };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [begin, togglePause]);

  useEffect(() => {
    if (!sound) stopAudio(); else if (phase === "running") startAudio();
  }, [sound, phase, startAudio, stopAudio]);
  useEffect(() => () => stopAudio(), [stopAudio]);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    let previous = performance.now(); let lastUI = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr)); canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize(); window.addEventListener("resize", resize);

    const line = (points: [number, number][], color: string, width = 1, alpha = 1) => {
      ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath();
      points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); ctx.restore();
    };
    const polygon = (points: [number, number][], fill: string | CanvasGradient | CanvasPattern, stroke?: string, width = 1) => {
      ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath();
      ctx.fillStyle = fill; ctx.fill(); if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
    };
    const stageFor = (distance: number) => distance < 1200 ? 0 : distance < 2450 ? 1 : 2;
    const chromaFor = (distance: number) => clamp((distance - 650) / 850, 0, 1);

    const drawSky = (w: number, h: number, distance: number, t: number, chroma: number) => {
      const gradient = ctx.createLinearGradient(0, 0, 0, h);
      gradient.addColorStop(0, `rgb(${Math.round(mix(7, 5, chroma))},${Math.round(mix(9, 22, chroma))},${Math.round(mix(13, 48, chroma))})`);
      gradient.addColorStop(.62, `rgb(${Math.round(mix(10, 12, chroma))},${Math.round(mix(12, 44, chroma))},${Math.round(mix(15, 70, chroma))})`);
      gradient.addColorStop(1, "#090a0b"); ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);
      const stars = 54;
      for (let i = 0; i < stars; i++) { const x = ((i * 149 + distance * .015) % (w + 60)) - 30; const y = 25 + ((i * 83) % Math.max(80, h * .5)); const a = .16 + ((i * 19) % 50) / 100; ctx.fillStyle = `rgba(${Math.round(mix(220, 130, chroma))},${Math.round(mix(220, 220, chroma))},255,${a})`; ctx.fillRect(x, y, i % 9 === 0 ? 2 : 1, i % 9 === 0 ? 2 : 1); }
      for (let i = 0; i < 6; i++) {
        const x = (i / 5) * w + Math.sin(t * .00008 + i) * 35; const y = h * (.15 + (i % 3) * .08); const r = 90 + i * 22;
        ctx.strokeStyle = `rgba(${Math.round(mix(190, 55, chroma))},${Math.round(mix(195, 120, chroma))},${Math.round(mix(200, 160, chroma))},.13)`; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, r, Math.PI, Math.PI * 1.94); ctx.stroke();
      }
    };

    const drawArchitecture = (w: number, h: number, distance: number, chroma: number) => {
      const horizon = h * .32;
      for (let side = -1; side <= 1; side += 2) {
        for (let i = 0; i < 6; i++) {
          const progress = ((i * 340 - distance * .55) % 2000 + 2000) % 2000; const z = progress / 2000;
          const scale = .18 + Math.pow(1 - z, 2) * 1.15; const x = w / 2 + side * (w * .18 + (1 - z) * w * .42); const y = horizon + Math.pow(1 - z, 2) * h * .57;
          const aw = 52 * scale, ah = 130 * scale; const colour = chroma > .4 ? `rgba(${side < 0 ? "88,210,228" : "255,111,66"},${.16 + (1-z)*.25})` : `rgba(226,226,216,${.13 + (1-z)*.2})`;
          line([[x-aw,y],[x-aw,y-ah],[x,y-ah-26*scale],[x+aw,y-ah],[x+aw,y]], colour, 1.2);
          line([[x-aw*.55,y-ah],[x-aw*.55,y],[x+aw*.55,y],[x+aw*.55,y-ah]], colour, .7, .7);
        }
      }
    };

    const drawRoad3D = (w: number, h: number, distance: number, lane: number, chroma: number) => {
      const horizon = h * .34; const bottom = h * 1.05; const bend = Math.sin(distance * .0022) * .12 + Math.sin(distance * .0007) * .16;
      const centerAt = (p: number) => w / 2 + (bend * Math.pow(p, 2) - lane * .28 * Math.pow(p, .7)) * w;
      const halfAt = (p: number) => mix(w * .025, w * .62, Math.pow(p, 1.35));
      const roadGrad = ctx.createLinearGradient(0, horizon, 0, bottom); roadGrad.addColorStop(0,"rgba(12,14,16,.1)"); roadGrad.addColorStop(1, chroma > .05 ? `rgba(16,21,25,${.78 + chroma*.12})` : "rgba(11,12,13,.88)");
      polygon([[centerAt(0)-halfAt(0),horizon],[centerAt(1)-halfAt(1),bottom],[centerAt(1)+halfAt(1),bottom],[centerAt(0)+halfAt(0),horizon]], roadGrad);
      for (let i = 0; i <= 24; i++) {
        const p = i / 24; const y = mix(horizon,bottom,Math.pow(p,1.55)); const c = centerAt(p), hw = halfAt(p);
        const accent = i % 4 === 0 && chroma > .08 ? `rgba(${i%8===0?"255,97,54":"104,218,232"},${.15+chroma*.35})` : `rgba(232,232,222,${.06+p*.18})`;
        line([[c-hw,y],[c+hw,y]],accent,p > .75 ? 1.5 : .7);
      }
      [-1,-.5,0,.5,1].forEach(offset => { const pts: [number,number][] = []; for(let i=0;i<=20;i++){const p=i/20;pts.push([centerAt(p)+halfAt(p)*offset,mix(horizon,bottom,Math.pow(p,1.55))]);} line(pts, offset === 0 && chroma>.2 ? `rgba(255,113,64,${.35*chroma})` : "rgba(235,235,225,.32)", offset === 0 ? 1.4 : .8); });
      ctx.save(); ctx.shadowBlur = 28; ctx.shadowColor = chroma > .3 ? "#ff6038" : "#ffffff"; line([[centerAt(.88)-halfAt(.88)*.88,h*.88],[centerAt(.96)-halfAt(.96)*.91,h*.98]],chroma>.3?"rgba(255,93,50,.78)":"rgba(255,255,255,.45)",3); ctx.restore();
    };

    const projected = (w: number, h: number, obj: WorldObject, distance: number, lane: number) => {
      const rel = obj.z - distance; const range = 680; if (rel < -25 || rel > range) return null;
      const p = 1 - rel / range; const curve = Math.sin(distance * .0022) * .12 + Math.sin(distance * .0007) * .16;
      const c = w/2 + (curve*Math.pow(p,2)-lane*.28*Math.pow(p,.7))*w; const hw=mix(w*.025,w*.62,Math.pow(p,1.35)); const y=mix(h*.34,h*1.05,Math.pow(p,1.55));
      return { x:c+hw*obj.lane*.76, y, scale:.13+Math.pow(p,2)*1.35, p };
    };

    const drawObject3D = (w: number, h: number, obj: WorldObject, distance: number, lane: number, chroma: number, t: number) => {
      if (obj.hit) return; const q=projected(w,h,obj,distance,lane); if(!q)return;
      if(obj.kind==="shard"){
        const s=13*q.scale, bob=Math.sin(t*.006+obj.z)*5*q.scale; ctx.save();ctx.translate(q.x,q.y-30*q.scale+bob);ctx.rotate(t*.001+obj.z);ctx.shadowBlur=22*q.scale;ctx.shadowColor=chroma>.2?"#ff7646":"#fff";polygon([[0,-s],[s*.62,0],[0,s],[-s*.62,0]],chroma>.2?"#ff7546":"#e7e5d9","rgba(255,255,255,.8)",1);ctx.restore();
      } else {
        const s=30*q.scale; const c=chroma>.35?"rgba(12,18,26,.9)":"rgba(8,9,10,.92)"; polygon([[q.x-s*.72,q.y],[q.x-s*.5,q.y-s*1.9],[q.x,q.y-s*2.7],[q.x+s*.5,q.y-s*1.9],[q.x+s*.72,q.y]],c,chroma>.35?"rgba(111,218,232,.75)":"rgba(230,230,220,.72)",Math.max(1,q.scale)); line([[q.x,q.y-s*2.7],[q.x,q.y]],chroma>.65?"rgba(255,99,55,.75)":"rgba(255,255,255,.25)",1);
      }
    };

    const drawPaperWorld = (w:number,h:number,distance:number,lane:number,t:number) => {
      ctx.fillStyle="#e7e3d7";ctx.fillRect(0,0,w,h);ctx.strokeStyle="rgba(27,28,29,.065)";ctx.lineWidth=1;
      for(let x=(-distance*.2)%42;x<w;x+=42){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke()} for(let y=0;y<h;y+=42){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke()}
      const ground=h*.76; polygon([[0,ground],[w,ground],[w,h],[0,h]],"#0c1114");
      for(let i=0;i<10;i++){const x=((i*210-distance*.55)%(w+300)+w+300)%(w+300)-100; const bh=60+(i%4)*38; polygon([[x,ground],[x+80,ground],[x+65,ground-bh],[x+18,ground-bh-20]],i%3===0?"#fc6840":"#11191d","#17252b",2);}
      line([[0,ground],[w,ground]],"#fc6840",4); line([[0,ground+10],[w,ground+10]],"#66d6e6",1);
      for(let i=0;i<8;i++){const x=((i*260-distance*.8)%(w+260)+w+260)%(w+260)-100;ctx.fillStyle="rgba(16,23,27,.16)";ctx.beginPath();ctx.ellipse(x,h*.2+(i%3)*45,110,26,0,0,Math.PI*2);ctx.fill()}
      const py=ground-58+lane*h*.18; ctx.save();ctx.translate(w*.22,py);ctx.rotate(Math.sin(t*.01)*.018);drawVehicle(ctx,0,0,1.05,1);ctx.restore();
      ctx.fillStyle="#171b1d";ctx.font="700 11px monospace";ctx.letterSpacing="2px";ctx.fillText("PERSPECTIVE: FLAT",28,38);
    };

    const drawVehicle = (c:CanvasRenderingContext2D,x:number,y:number,scale:number,chroma:number) => {
      c.save();c.translate(x,y);c.scale(scale,scale);
      c.shadowBlur=chroma>0?26:10;c.shadowColor=chroma>.2?"#ff653c":"#fff";
      polygon([[-42,13],[-31,-7],[-18,-15],[24,-15],[43,5],[35,17],[-35,17]],chroma>.2?"#e94e2f":"#0a0b0c",chroma>.2?"#ffb184":"rgba(240,240,230,.85)",1.5);
      c.fillStyle="#07090a";c.beginPath();c.arc(-26,16,10,0,Math.PI*2);c.arc(27,16,10,0,Math.PI*2);c.fill();c.strokeStyle=chroma>.3?"#79dce8":"#d9d8cf";c.stroke();
      polygon([[-14,-13],[-8,-35],[2,-47],[16,-38],[20,-13]],chroma>.25?"#ff7548":"#111214",chroma>.25?"#ffb28d":"#e8e7dc",1.2);
      c.fillStyle="#eeeae2";c.beginPath();c.arc(3,-43,10,0,Math.PI*2);c.fill();c.fillStyle="#07090a";c.beginPath();c.arc(6,-43,6.5,0,Math.PI*2);c.fill();
      polygon([[12,-35],[37,-29],[24,-16],[14,-13]],chroma>.2?"rgba(255,94,52,.88)":"rgba(220,220,210,.45)",chroma>.2?"#ffad82":"#eee",1);
      line([[40,4],[55,-2]],chroma>.2?"#ff6b40":"#fff",3);c.restore();
    };

    const collide = (s: typeof stateRef.current, stage: number) => {
      for(const obj of s.objects){ if(obj.hit) continue; const rel=obj.z-s.distance; if(rel<18&&rel>-10&&Math.abs(obj.lane-s.lane)<(stage===2?.34:.27)){
          obj.hit=true; if(obj.kind==="shard"){s.shards++;s.energy=Math.min(100,s.energy+7);s.flash=.75;ping(610+s.shards*34);} else {s.energy=Math.max(0,s.energy-28);s.speed*=.45;s.shake=1;s.flash=-.8;ping(90);}
        }}
    };

    const render = (now:number) => {
      const rect=canvas.getBoundingClientRect(),w=rect.width,h=rect.height; const s=stateRef.current; const dt=Math.min((now-previous)/1000,.05);previous=now;s.time+=dt;
      const active=phaseRef.current==="running"; const stage=stageFor(s.distance); const chroma=chromaFor(s.distance);
      if(active){
        const keys=keysRef.current; const steer=(keys.arrowleft||keys.a||keys.arrowup||keys.w?-1:0)+(keys.arrowright||keys.d||keys.arrowdown||keys.s?1:0);
        const boost=keys[" "]; const target=boost?245:185; s.speed=mix(s.speed,target,dt*(boost?1.8:1.05));s.lane=clamp(s.lane+steer*dt*(1.15+s.speed/320),-.86,.86);s.distance+=s.speed*dt;s.shake=Math.max(0,s.shake-dt*3.3);s.flash*=Math.pow(.045,dt);collide(s,stage);
        if(engineRef.current){engineRef.current.frequency.setTargetAtTime(44+s.speed*.28,audioRef.current?.currentTime||0,.1);engineGainRef.current?.gain.setTargetAtTime(.012+s.speed*.000045,audioRef.current?.currentTime||0,.1)}
        if(s.energy<=0){s.energy=100;s.distance=Math.max(0,s.distance-260);s.lane=0;s.speed=0;} if(s.distance>=TRACK_END){s.distance=TRACK_END;s.speed=0;setPhase("complete");ping(880)}
      } else if(phaseRef.current==="menu"){s.distance=(s.distance+dt*22)%520;s.speed=60;s.lane=Math.sin(now*.0003)*.08;}
      if(now-lastUI>90){lastUI=now;setUi({distance:s.distance,speed:s.speed,energy:s.energy,shards:s.shards,mode:stage})}
      ctx.save(); if(s.shake>0)ctx.translate((Math.random()-.5)*13*s.shake,(Math.random()-.5)*8*s.shake);
      if(stage===2){drawPaperWorld(w,h,s.distance,s.lane,now); for(const obj of s.objects){if(obj.hit)continue;const rel=obj.z-s.distance;if(rel>-20&&rel<w*1.25){const x=w*.22+rel*.72,y=h*.76-42+obj.lane*h*.18;if(obj.kind==="shard"){ctx.save();ctx.translate(x,y);ctx.rotate(now*.002);polygon([[0,-13],[9,0],[0,13],[-9,0]],"#ff6840","#1c2224",1);ctx.restore()}else{polygon([[x-14,h*.76],[x-12,y-28],[x,y-46],[x+12,y-28],[x+14,h*.76]],"#13191c","#63d5e5",2)}}}
      }else{drawSky(w,h,s.distance,now,chroma);drawArchitecture(w,h,s.distance,chroma);drawRoad3D(w,h,s.distance,s.lane,chroma);const visible=[...s.objects].sort((a,b)=>b.z-a.z);visible.forEach(obj=>drawObject3D(w,h,obj,s.distance,s.lane,chroma,now));ctx.save();ctx.translate(w/2,h*.83);ctx.rotate(-s.lane*.08);drawVehicle(ctx,0,0,clamp(w/900,.75,1.15),chroma);ctx.restore();}
      if(s.flash){ctx.fillStyle=s.flash>0?`rgba(255,130,74,${Math.abs(s.flash)*.34})`:`rgba(255,255,255,${Math.abs(s.flash)*.42})`;ctx.fillRect(0,0,w,h)}ctx.restore();
      frameRef.current=requestAnimationFrame(render);
    };
    frameRef.current=requestAnimationFrame(render);
    return()=>{cancelAnimationFrame(frameRef.current);window.removeEventListener("resize",resize)};
  }, [ping]);

  const progress = (ui.distance / TRACK_END) * 100;

  return (
    <main className={`game-shell mode-${ui.mode}`}>
      <canvas ref={canvasRef} className="game-canvas" aria-label="Chromatic Drift racing game" />
      <div className="grain" aria-hidden="true" />
      <header className="game-topbar">
        <button className="wordmark" type="button" onClick={() => setPhase("menu")}><span className="mark">CD</span><span>CHROMATIC<br />DRIFT</span></button>
        <div className="run-label"><i /> RUN 01 <span>/</span> THE UNFINISHED WORLD</div>
        <div className="header-actions">
          <button className="icon-button" type="button" onClick={() => setSound(v=>!v)} aria-label={sound?"Mute sound":"Enable sound"}>{sound?"◖))":"◖×"}</button>
          <button className="icon-button" type="button" onClick={togglePause} aria-label="Pause game">Ⅱ</button>
        </div>
      </header>

      {phase !== "menu" && <>
        <section className="hud-left" aria-label="Race status">
          <p>DISTANCE</p><strong>{String(Math.floor(ui.distance)).padStart(4,"0")}<small> M</small></strong>
          <div className="hud-rule" /><p>VELOCITY</p><strong>{Math.floor(ui.speed)}<small> KM/H</small></strong>
        </section>
        <section className="hud-right">
          <div className="energy-label"><span>LIGHT</span><b>{ui.energy}%</b></div>
          <div className="energy-track"><i style={{width:`${ui.energy}%`}} /></div>
          <div className="shard-count"><span>◆</span> {ui.shards} / 10</div>
        </section>
        <div className="race-progress"><span style={{width:`${progress}%`}} /><i style={{left:`${progress}%`}} /></div>
        <div className="stage-rail">
          {MODE_NAMES.map((name,index)=><div key={name} className={index===ui.mode?"stage active":"stage"}><span>0{index+1}</span><b>{name}</b></div>)}
        </div>
      </>}

      {phase === "menu" && <section className="start-screen">
        <div className="start-copy">
          <p className="eyebrow"><span>01</span> A RACE BETWEEN DIMENSIONS</p>
          <h1><span>CHROMATIC</span><br />DRIFT</h1>
          <p className="dek">Race through a world still being drawn.<br />Leave colour in your wake.</p>
          <div className="actions">
            <button className="launch" type="button" onClick={begin}><span>BEGIN THE RUN</span><b>↗</b></button>
            <button className="ghost-button" type="button" onClick={()=>setHelp(true)}>HOW TO PLAY <span>＋</span></button>
          </div>
        </div>
        <aside className="pilot-card">
          <div className="pilot-image" role="img" aria-label="The white-haired Lightbearer pilot" />
          <div className="pilot-caption"><span>PILOT // 01</span><strong>THE LIGHTBEARER</strong><small>COLOUR AFFINITY — EMBER</small></div>
        </aside>
        <div className="intro-stages"><span>LINE / 3D</span><i>→</i><span>LIGHT / COLOUR</span><i>→</i><span>PAPER / 2D</span></div>
        <div className="corner-note">KEYBOARD + TOUCH&nbsp;&nbsp; / &nbsp;&nbsp;HEADPHONES RECOMMENDED</div>
      </section>}

      {phase === "paused" && <section className="modal pause-card"><p>WORLD SUSPENDED</p><h2>PAUSED</h2><button className="launch" type="button" onClick={togglePause}>CONTINUE <b>→</b></button><button className="text-button" onClick={()=>setPhase("menu")}>ABANDON RUN</button></section>}
      {phase === "complete" && <section className="modal complete-card"><div className="complete-image"/><p>ALL THREE DIMENSIONS RESTORED</p><h2>YOU LEFT<br/><em>COLOUR</em> BEHIND.</h2><div className="final-stat"><span>LIGHT SHARDS</span><b>{ui.shards} / 10</b></div><button className="launch" type="button" onClick={begin}>RUN AGAIN <b>↗</b></button></section>}
      {help && <section className="modal help-card"><button className="modal-close" onClick={()=>setHelp(false)} aria-label="Close instructions">×</button><p>FIELD MANUAL / 01</p><h2>HOW TO DRIFT</h2><div className="control-grid"><div><kbd>A</kbd><kbd>←</kbd><span>STEER LEFT</span></div><div><kbd>D</kbd><kbd>→</kbd><span>STEER RIGHT</span></div><div><kbd>SPACE</kbd><span>PHOTON BOOST</span></div><div><kbd>ESC</kbd><span>PAUSE WORLD</span></div></div><small>Collect ember shards. Avoid black obelisks. At 2,450 m, perspective collapses—the same steering moves you vertically through the paper world.</small><button className="launch" type="button" onClick={begin}>I&apos;M READY <b>→</b></button></section>}

      {phase === "running" && <div className="touch-controls" aria-label="Touch controls">
        <button onPointerDown={()=>setControl("arrowleft",true)} onPointerUp={()=>setControl("arrowleft",false)} onPointerCancel={()=>setControl("arrowleft",false)}>←</button>
        <button className="boost" onPointerDown={()=>setControl(" ",true)} onPointerUp={()=>setControl(" ",false)} onPointerCancel={()=>setControl(" ",false)}>BOOST</button>
        <button onPointerDown={()=>setControl("arrowright",true)} onPointerUp={()=>setControl("arrowright",false)} onPointerCancel={()=>setControl("arrowright",false)}>→</button>
      </div>}
      {phase === "running" && ui.mode < 2 && ui.distance > 1080 && ui.distance < 1260 && <div className="transition-title"><span>DIMENSION 02</span><strong>COLOUR REMEMBERS YOU</strong></div>}
      {phase === "running" && ui.mode === 2 && ui.distance < 2640 && <div className="transition-title dark"><span>DIMENSION 03</span><strong>PERSPECTIVE COLLAPSED</strong></div>}
    </main>
  );
}
