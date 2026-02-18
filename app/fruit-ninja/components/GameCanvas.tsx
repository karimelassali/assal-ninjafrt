"use client";

import { useEffect, useRef, useState } from "react";
import Webcam from "react-webcam";

interface Props {
    webcamRef: React.RefObject<Webcam | null>;
    finger: { x: number; y: number } | null;
}

type GameState = "start" | "playing" | "gameover";

interface Fruit {
    id: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    type: string;
    rotation: number;
    vr: number;
    scale: number;
    sliced: boolean;
    bomb: boolean;
}

interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    color: string;
    size: number;
}

interface SlashPoint {
    x: number;
    y: number;
    life: number;
}

interface FloatingText {
    x: number;
    y: number;
    text: string;
    life: number;
    color: string;
}

const FRUIT_TYPES = ["🍉", "🍊", "🍎", "🍋", "🍇", "🥝", "🍌"];
const FRUIT_COLORS: Record<string, string> = {
    "🍉": "#ff3333", "🍊": "#ffaa00", "🍎": "#ff0000", "🍋": "#ffff00",
    "🍇": "#cc00ff", "🥝": "#55ff00", "🍌": "#ffee00"
};
const GRAVITY = 0.15; // User liked 0.10, but 0.15 feels slightly snappier
const SPAWN_RATE = 50; // Faster spawns

export default function GameCanvas({ webcamRef, finger }: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const requestRef = useRef<number>(0);
    const audioCtxRef = useRef<AudioContext | null>(null);

    // Game State Refs
    const stateRef = useRef<GameState>("start");
    const scoreRef = useRef(0);
    const livesRef = useRef(3);
    const comboRef = useRef(0);
    const comboTimerRef = useRef(0);
    const shakeRef = useRef(0); // Screen shake intensity

    // Entities
    const fruitsRef = useRef<Fruit[]>([]);
    const particlesRef = useRef<Particle[]>([]);
    const trailRef = useRef<SlashPoint[]>([]);
    const floatTextsRef = useRef<FloatingText[]>([]);
    const frameRef = useRef(0);

    // Performance Optimization: Ref for finger to avoid loop restart
    const fingerRef = useRef(finger);
    useEffect(() => {
        fingerRef.current = finger;
    }, [finger]);

    // React State for UI
    const [uiState, setUiState] = useState<GameState>("start");
    const [score, setScore] = useState(0);
    const [lives, setLives] = useState(3);
    const [combo, setCombo] = useState(0);

    // Sound Synth
    const playSound = (type: "slice" | "splat" | "bomb" | "start") => {
        if (!audioCtxRef.current) return;
        const ctx = audioCtxRef.current;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        const now = ctx.currentTime;
        if (type === "slice") {
            osc.frequency.setValueAtTime(600, now);
            osc.frequency.exponentialRampToValueAtTime(100, now + 0.2); // Squelchier sound
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
            osc.start(now);
            osc.stop(now + 0.2);
        } else if (type === "bomb") {
            osc.type = "sawtooth";
            osc.frequency.setValueAtTime(100, now);
            osc.frequency.exponentialRampToValueAtTime(10, now + 0.8);
            gain.gain.setValueAtTime(0.8, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
            osc.start(now);
            osc.stop(now + 0.8);
        } else if (type === "start") {
            osc.frequency.setValueAtTime(440, now);
            osc.frequency.linearRampToValueAtTime(880, now + 0.3);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.3);
            osc.start(now);
            osc.stop(now + 0.3);
        }
    };

    const startGame = () => {
        stateRef.current = "playing";
        setUiState("playing");
        scoreRef.current = 0;
        livesRef.current = 90;
        setScore(0);
        setLives(90);
        fruitsRef.current = [];
        particlesRef.current = [];
        floatTextsRef.current = [];
        if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioCtxRef.current.resume();
        playSound("start");
    };

    const spawnFruit = (w: number, h: number) => {
        const isBomb = Math.random() < 1;
        const type = FRUIT_TYPES[Math.floor(Math.random() * FRUIT_TYPES.length)];
        const x = Math.random() * (w - 100) + 50;
        const vx = (w / 2 - x) * 0.008 + (Math.random() - 0.5) * 5;
        const vy = -(Math.random() * 6 + 14); // Higher launch

        fruitsRef.current.push({
            id: Math.random(),
            x, y: h + 50,
            vx, vy,
            type: isBomb ? "💣" : type,
            rotation: 0,
            vr: (Math.random() - 0.5) * 0.3,
            scale: 1,
            sliced: false,
            bomb: isBomb
        });
    };

    const spawnParticles = (x: number, y: number, color: string) => {
        // More particles, bigger size
        for (let i = 0; i < 20; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 8 + 2;
            particlesRef.current.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1.0,
                color,
                size: Math.random() * 15 + 8 // Bigger particles!
            });
        }
    };

    const spawnText = (x: number, y: number, text: string, color: string) => {
        floatTextsRef.current.push({ x, y, text, life: 1.0, color });
    };

    // Main Game Loop
    useEffect(() => {
        const update = () => {
            const canvas = canvasRef.current;
            const ctx = canvas?.getContext("2d");
            if (!canvas || !ctx) return;

            const w = canvas.width;
            const h = canvas.height;

            // Screen Shake Logic
            let dx = 0, dy = 0;
            if (shakeRef.current > 0) {
                dx = (Math.random() - 0.5) * shakeRef.current;
                dy = (Math.random() - 0.5) * shakeRef.current;
                shakeRef.current *= 0.9; // Decay
                if (shakeRef.current < 0.5) shakeRef.current = 0;
            }

            ctx.save();
            ctx.translate(dx, dy);

            // 1. Draw Camera Feed
            if (webcamRef.current?.video) {
                const video = webcamRef.current.video;
                if (video.readyState >= 2) {
                    ctx.save();
                    ctx.scale(-1, 1);
                    ctx.drawImage(video, -w, 0, w, h);
                    ctx.restore();
                }
            } else {
                ctx.fillStyle = "#111";
                ctx.fillRect(0, 0, w, h);
            }

            // 2. Trail Logic (Using Ref!)
            const fPos = fingerRef.current;
            if (fPos) {
                trailRef.current.push({ x: fPos.x * w, y: fPos.y * h, life: 1.0 });
            }
            for (let i = trailRef.current.length - 1; i >= 0; i--) {
                trailRef.current[i].life -= 0.12;
                if (trailRef.current[i].life <= 0) trailRef.current.splice(i, 1);
            }

            // Draw Trail
            if (trailRef.current.length > 1) {
                ctx.beginPath();
                ctx.moveTo(trailRef.current[0].x, trailRef.current[0].y);
                for (let p of trailRef.current) ctx.lineTo(p.x, p.y);
                ctx.strokeStyle = "#fff";
                ctx.lineWidth = 10; // Thicker trail
                ctx.lineCap = "round";
                ctx.stroke();

                ctx.shadowBlur = 25;
                ctx.shadowColor = "#00ffff";
                ctx.stroke();
                ctx.shadowBlur = 0;
            }

            if (stateRef.current === "playing") {
                // Spawning
                frameRef.current++;
                if (frameRef.current % SPAWN_RATE === 0) spawnFruit(w, h);

                // Update Fruits
                for (let i = fruitsRef.current.length - 1; i >= 0; i--) {
                    const f = fruitsRef.current[i];
                    f.x += f.vx;
                    f.y += f.vy;
                    f.vy += GRAVITY;
                    f.rotation += f.vr;

                    // Collision
                    if (!f.sliced && trailRef.current.length > 2) {
                        const tip = trailRef.current[trailRef.current.length - 1];
                        const dx = f.x - tip.x;
                        const dy = f.y - tip.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);

                        if (dist < 80) { // Bigger hitbox
                            if (f.bomb) {
                                stateRef.current = "gameover";
                                setUiState("gameover");
                                setScore(scoreRef.current);
                                playSound("bomb");
                                shakeRef.current = 50; // Massive shake
                            } else {
                                f.sliced = true;
                                f.vx = Math.random() * 10 - 5;
                                f.vy = -8; // Bounce up
                                scoreRef.current += 10;
                                setScore(scoreRef.current);
                                spawnParticles(f.x, f.y, FRUIT_COLORS[f.type] || "#fff");
                                spawnText(f.x, f.y, "+10", "#fff");
                                playSound("slice");
                                shakeRef.current = 10; // Small shake

                                // Combo Logic
                                if (frameRef.current - comboTimerRef.current < 20) {
                                    comboRef.current++;
                                    if (comboRef.current > 1) {
                                        setCombo(comboRef.current);
                                        spawnText(f.x, f.y - 40, `${comboRef.current} COMBO!`, "#ffff00");
                                    }
                                } else {
                                    comboRef.current = 1;
                                    setCombo(0);
                                }
                                comboTimerRef.current = frameRef.current;
                            }
                        }
                    }

                    // Render Fruit
                    ctx.save();
                    ctx.translate(f.x, f.y);
                    ctx.rotate(f.rotation);
                    ctx.font = f.sliced ? "70px Arial" : "100px Arial"; // Bigger fruits
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";

                    if (f.sliced) {
                        ctx.shadowBlur = 0;
                        // Draw halves
                        ctx.save();
                        ctx.translate(-20, -10);
                        ctx.rotate(-0.5);
                        ctx.fillText(f.type, 0, 0);
                        ctx.restore();

                        ctx.save();
                        ctx.translate(20, 10);
                        ctx.rotate(0.5);
                        ctx.fillText(f.type, 0, 0);
                        ctx.restore();
                    } else {
                        ctx.shadowBlur = 20;
                        ctx.shadowColor = f.bomb ? "#ff0000" : "#ffff00";
                        ctx.fillText(f.type, 0, 0);
                    }
                    ctx.restore();

                    // Remove off-screen
                    if (f.y > h + 100) {
                        if (!f.sliced && !f.bomb) {
                            livesRef.current--;
                            setLives(livesRef.current);
                            if (livesRef.current <= 0) {
                                stateRef.current = "gameover";
                                setUiState("gameover");
                                setScore(scoreRef.current);
                            }
                        }
                        fruitsRef.current.splice(i, 1);
                    }
                }

                // Particles
                for (let i = particlesRef.current.length - 1; i >= 0; i--) {
                    const p = particlesRef.current[i];
                    p.x += p.vx;
                    p.y += p.vy;
                    p.vy += 0.3; // Gravity
                    p.life -= 0.02; // Slower fade (longer animation)
                    if (p.life <= 0) particlesRef.current.splice(i, 1);

                    ctx.globalAlpha = p.life;
                    ctx.fillStyle = p.color;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.globalAlpha = 1;

                    // Shrink
                    p.size *= 0.96;
                }

                // Floating Text
                for (let i = floatTextsRef.current.length - 1; i >= 0; i--) {
                    const t = floatTextsRef.current[i];
                    t.y -= 2;
                    t.life -= 0.02;
                    if (t.life <= 0) floatTextsRef.current.splice(i, 1);

                    ctx.globalAlpha = t.life;
                    ctx.fillStyle = t.color;
                    ctx.font = "bold 40px 'Outfit'";
                    ctx.shadowColor = "#000";
                    ctx.shadowBlur = 4;
                    ctx.fillText(t.text, t.x, t.y);
                    ctx.globalAlpha = 1;
                }
            }

            ctx.restore(); // Restore shake transform
            requestRef.current = requestAnimationFrame(update);
        };

        const resize = () => {
            if (canvasRef.current) {
                canvasRef.current.width = window.innerWidth;
                canvasRef.current.height = window.innerHeight;
            }
        };
        window.addEventListener("resize", resize);
        resize();

        requestRef.current = requestAnimationFrame(update);

        return () => {
            window.removeEventListener("resize", resize);
            cancelAnimationFrame(requestRef.current);
        };
    }, []); // Empty dependency array for stability!

    return (
        <>
            <canvas ref={canvasRef} className="absolute inset-0 z-10" />

            {/* HUD */}
            {uiState === "playing" && (
                <div className="absolute top-4 left-4 z-20 font-bold text-white drop-shadow-md select-none pointer-events-none">
                    <div className="text-4xl filter drop-shadow-lg">Score: {score}</div>
                    <div className="text-3xl mt-2 text-red-500 font-black tracking-widest filter drop-shadow-lg">
                        {"❤️".repeat(lives)}
                    </div>
                </div>
            )}
            {/* Combo Popups (HTML overlay for huge effect) */}
            {combo > 1 && (
                <div className="absolute top-1/3 left-1/2 -translate-x-1/2 z-20 text-6xl font-black text-yellow-400 animate-bounce drop-shadow-[0_0_25px_rgba(255,200,0,1)] pointer-events-none whitespace-nowrap">
                    {combo} COMBO! 🔥
                </div>
            )}

            {/* Start Screen */}
            {uiState === "start" && (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm">
                    <h1 className="text-8xl font-black text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-orange-500 mb-6 animate-pulse drop-shadow-[0_0_30px_rgba(0,255,100,0.5)]">
                        FRUIT NINJA
                    </h1>
                    <p className="text-3xl text-white mb-10 font-bold drop-shadow-md">Raise hand to slice! 🤚</p>
                    <button
                        onClick={startGame}
                        className="px-12 py-6 bg-gradient-to-br from-orange-600 to-red-600 rounded-full text-4xl font-black hover:scale-110 transition-all shadow-[0_0_50px_rgba(255,100,0,0.8)] border-4 border-orange-400 text-white active:scale-95"
                    >
                        START GAME
                    </button>

                    <div className="absolute bottom-10 flex gap-12 text-white/70 text-lg font-semibold">
                        <div className="flex flex-col items-center gap-2">
                            <span className="text-4xl">☝️</span>
                            <span>Index Finger</span>
                        </div>
                        <div className="flex flex-col items-center gap-2">
                            <span className="text-4xl">💣</span>
                            <span>No Bombs</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Game Over Screen */}
            {uiState === "gameover" && (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-red-950/90 backdrop-blur-md animate-in fade-in duration-300">
                    <h2 className="text-7xl font-black text-white mb-4 drop-shadow-[0_5px_0_#990000]">GAME OVER</h2>
                    <div className="text-5xl text-yellow-300 mb-12 font-bold drop-shadow-lg">Final Score: {score}</div>
                    <button
                        onClick={startGame}
                        className="px-10 py-5 bg-white text-red-700 rounded-3xl text-3xl font-black hover:scale-105 transition-transform shadow-2xl hover:shadow-white/20"
                    >
                        PLAY AGAIN ↺
                    </button>
                </div>
            )}
        </>
    );
}
