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

interface GameSettings {
    spawnRate: number;
    gravity: number;
    launchPower: number;
    lives: number;
}

const DIFFICULTY_PRESETS: Record<string, GameSettings> = {
    easy: { spawnRate: 150, gravity: 0.06, launchPower: 8, lives: 5 },
    medium: { spawnRate: 100, gravity: 0.08, launchPower: 10, lives: 3 },
    hard: { spawnRate: 60, gravity: 0.12, launchPower: 14, lives: 2 },
};

export default function GameCanvas({ webcamRef, finger }: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const requestRef = useRef<number>(0);
    const audioCtxRef = useRef<AudioContext | null>(null);

    // Performance Optimization
    const isMobileRef = useRef(false);
    useEffect(() => {
        isMobileRef.current = window.innerWidth < 768;
    }, []);

    // Settings State
    const [showSettings, setShowSettings] = useState(false);
    const [settings, setSettings] = useState<GameSettings>(DIFFICULTY_PRESETS.medium);

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
    const knightAngleRef = useRef(0); // Track sword angle
    const swordImgRef = useRef<HTMLImageElement | null>(null); // Image for the sword
    const bombImgRef = useRef<HTMLImageElement | null>(null); // Image for the bomb
    const comboSoundRef = useRef<AudioBuffer | null>(null); // Custom combo sound
    const gameOverSoundRef = useRef<AudioBuffer | null>(null); // Custom gameover sound
    const fingerRef = useRef(finger);
    const activeAudioSourceRef = useRef<AudioBufferSourceNode | null>(null); // Track active sound

    // FPS Tracking
    const fpsRef = useRef(0);
    const lastTimeRef = useRef(performance.now());
    const frameCountRef = useRef(0);

    useEffect(() => {
        fingerRef.current = finger;
    }, [finger]);

    // React State for UI
    const [uiState, setUiState] = useState<GameState>("start");
    const [score, setScore] = useState(0);
    const [lives, setLives] = useState(3);
    const [combo, setCombo] = useState(0);

    // Sound Synth
    const playSound = (type: "slice" | "splat" | "bomb" | "start" | "combo_custom" | "gameover_custom") => {
        if (!audioCtxRef.current) return;
        const ctx = audioCtxRef.current;
        if (ctx.state === "suspended") ctx.resume();
        const now = ctx.currentTime;

        if (type === "combo_custom" && comboSoundRef.current) {
            // Stop previous sound if playing
            if (activeAudioSourceRef.current) {
                try { activeAudioSourceRef.current.stop(); } catch (e) { /* ignore */ }
            }

            console.log("Playing Combo Sound");
            const source = ctx.createBufferSource();
            source.buffer = comboSoundRef.current;
            const gain = ctx.createGain();
            gain.gain.value = 0.8;
            source.connect(gain);
            gain.connect(ctx.destination);
            source.start(now);
            source.stop(now + 3); // Play for exactly 3 seconds

            activeAudioSourceRef.current = source; // Track this source
            source.onended = () => { if (activeAudioSourceRef.current === source) activeAudioSourceRef.current = null; };
            return;
        }

        if (type === "gameover_custom" && gameOverSoundRef.current) {
            // Stop previous sound if playing
            if (activeAudioSourceRef.current) {
                try { activeAudioSourceRef.current.stop(); } catch (e) { /* ignore */ }
            }

            const source = ctx.createBufferSource();
            source.buffer = gameOverSoundRef.current;
            const gain = ctx.createGain();
            gain.gain.value = 1.5; // High volume
            source.connect(gain);
            gain.connect(ctx.destination);
            source.start(now);
            console.log("Playing Game Over sound");
            source.stop(now + 10); // Stop after 10s just in case

            activeAudioSourceRef.current = source;
            source.onended = () => { if (activeAudioSourceRef.current === source) activeAudioSourceRef.current = null; };
            return;
        }

        if (type === "combo_custom" && !comboSoundRef.current) console.warn("Combo sound not loaded yet");
        if (type === "gameover_custom" && !gameOverSoundRef.current) console.warn("Game Over sound not loaded yet");

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

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
        livesRef.current = settings.lives;
        setScore(0);
        setLives(settings.lives);
        fruitsRef.current = [];
        particlesRef.current = [];
        floatTextsRef.current = [];
        if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioCtxRef.current.resume();
        playSound("start");

        // Load Sword Image
        if (!swordImgRef.current) {
            const img = new Image();
            img.src = "/balgha.png";
            img.onload = () => {
                swordImgRef.current = img;
            };
        }

        // Load Bomb Image
        if (!bombImgRef.current) {
            const img = new Image();
            img.src = "/fruit/taouus-dish.png";
            img.onload = () => {
                bombImgRef.current = img;
            };
        }

        // Load Custom Sounds
        // Load Custom Sounds
    };

    // Load Sounds on Mount
    useEffect(() => {
        const loadSound = async (url: string, ref: React.MutableRefObject<AudioBuffer | null>) => {
            try {
                const response = await fetch(url);
                const arrayBuffer = await response.arrayBuffer();
                if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();

                const audioBuffer = await audioCtxRef.current.decodeAudioData(arrayBuffer);
                ref.current = audioBuffer;
                console.log(`Sound loaded: ${url}, Duration: ${audioBuffer.duration}s`);
            } catch (error) {
                console.error("Error loading sound:", url, error);
            }
        };

        if (!comboSoundRef.current) loadSound("/fruit/l7loobn-awlidi.mp3", comboSoundRef);
        // Correctly encode spaces for URL
        const gameOverUrl = "/fruit/nari-awili-la%20(2).mp3";
        if (!gameOverSoundRef.current) loadSound(gameOverUrl, gameOverSoundRef);
    }, []);

    const spawnFruit = (w: number, h: number) => {
        const isBomb = Math.random() < 0.1;
        const type = FRUIT_TYPES[Math.floor(Math.random() * FRUIT_TYPES.length)];
        const x = Math.random() * (w - 100) + 50;
        const vx = (w / 2 - x) * 0.005 + (Math.random() - 0.5) * 3;
        const vy = -(Math.random() * 4 + settings.launchPower);

        fruitsRef.current.push({
            id: Math.random(),
            x, y: h + 50,
            vx, vy,
            type: isBomb ? "💣" : type,
            rotation: 0,
            vr: (Math.random() - 0.5) * 0.2,
            scale: 1,
            sliced: false,
            bomb: isBomb
        });
    };

    const spawnParticles = (x: number, y: number, color: string) => {
        // Less particles on mobile for performance
        const count = isMobileRef.current ? 8 : 20;
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 8 + 2;
            particlesRef.current.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1.0,
                color,
                size: Math.random() * 15 + 8
            });
        }
    };

    const spawnText = (x: number, y: number, text: string, color: string) => {
        floatTextsRef.current.push({ x, y, text, life: 1.0, color });
    };

    const drawSword = (ctx: CanvasRenderingContext2D, x: number, y: number, angle: number) => {
        // Optimization: No fancy sword, just a high-performance glowing pointer
        ctx.save();
        ctx.translate(x, y);

        // Simple glowing orb (much faster than image)
        const radius = isMobileRef.current ? 8 : 12;

        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);

        // Fast glow using radial gradient instead of shadowBlur (better for mobile)
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 2);
        gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
        gradient.addColorStop(0.4, "rgba(0, 255, 255, 0.6)");
        gradient.addColorStop(1, "rgba(0, 255, 255, 0)");

        ctx.fillStyle = gradient;
        ctx.fill();

        ctx.restore();
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
                shakeRef.current *= 0.9;
                if (shakeRef.current < 0.5) shakeRef.current = 0;
            }

            ctx.save();
            ctx.translate(dx, dy);

            // Draw Camera Feed
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

            // Trail Logic
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
                ctx.lineWidth = 10;
                ctx.lineCap = "round";
                ctx.stroke();

                // Disable glow on mobile
                if (!isMobileRef.current) {
                    ctx.shadowBlur = 25;
                    ctx.shadowColor = "#00ffff";
                }
                ctx.stroke();
                ctx.shadowBlur = 0;
            }

            // Sword angle - FIXED
            knightAngleRef.current = 3.5;

            // ================= GAME LOOP =================
            if (stateRef.current === "playing") {
                frameRef.current++;
                if (frameRef.current % settings.spawnRate === 0) spawnFruit(w, h);

                // Update Fruits
                for (let i = fruitsRef.current.length - 1; i >= 0; i--) {
                    const f = fruitsRef.current[i];

                    f.x += f.vx;
                    f.y += f.vy;
                    f.vy += settings.gravity;
                    f.rotation += f.vr;

                    // Collision
                    if (!f.sliced && trailRef.current.length > 2) {
                        const tip = trailRef.current[trailRef.current.length - 1];
                        const ddx = f.x - tip.x;
                        const ddy = f.y - tip.y;
                        const dist = Math.sqrt(ddx * ddx + ddy * ddy);

                        if (dist < 80) {
                            if (f.bomb) {
                                stateRef.current = "gameover";
                                setUiState("gameover");
                                setScore(scoreRef.current);
                                playSound("gameover_custom"); // UPDATED: Play custom sound instead of old bomb sound
                                shakeRef.current = 50;
                            } else {
                                f.sliced = true;
                                f.vx = Math.random() * 10 - 5;
                                f.vy = -8;

                                scoreRef.current += 10;
                                setScore(scoreRef.current);

                                spawnParticles(f.x, f.y, FRUIT_COLORS[f.type] || "#fff");
                                spawnText(f.x, f.y, "+10", "#fff");
                                playSound("slice");
                                shakeRef.current = 10;

                                const timeSinceLastSlice = frameRef.current - comboTimerRef.current;

                                if (timeSinceLastSlice < 60) { // Increased window to 60 frames (approx 1s)
                                    comboRef.current++;
                                    if (comboRef.current > 1) {
                                        setCombo(comboRef.current);
                                        spawnText(
                                            f.x,
                                            f.y - 40,
                                            `${comboRef.current} COMBO!`,
                                            "#ffff00"
                                        );
                                        playSound("combo_custom");
                                    }
                                } else {
                                    // Too slow, reset combo chain
                                    comboRef.current = 1;
                                    setCombo(0);
                                }
                                // Always update timer on slice
                                comboTimerRef.current = frameRef.current;
                            }
                        }
                    }

                    // Render Fruit
                    ctx.save();
                    ctx.translate(f.x, f.y);
                    ctx.rotate(f.rotation);
                    ctx.font = f.sliced ? "70px Arial" : "100px Arial";
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";

                    if (f.sliced) {
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
                        // Disable expensive shadow on mobile
                        if (!isMobileRef.current) {
                            ctx.shadowBlur = 20;
                            ctx.shadowColor = f.bomb ? "#ff0000" : "#ffff00";
                        }

                        if (f.bomb && bombImgRef.current?.complete) {
                            const bImg = bombImgRef.current;
                            ctx.drawImage(
                                bImg,
                                -bImg.width / 2,
                                -bImg.height / 2,
                                bImg.width,
                                bImg.height
                            );
                        } else {
                            ctx.fillText(f.type, 0, 0);
                        }
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
                                playSound("gameover_custom");
                            }
                        }
                        fruitsRef.current.splice(i, 1);
                    }
                }
            }
            // ================= END PLAYING =================

            // Particles
            for (let i = particlesRef.current.length - 1; i >= 0; i--) {
                const p = particlesRef.current[i];
                p.x += p.vx;
                p.y += p.vy;
                p.vy += 0.3;
                p.life -= 0.02;
                if (p.life <= 0) particlesRef.current.splice(i, 1);

                ctx.globalAlpha = p.life;
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1;

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

            // Draw Sword
            const swordPos =
                trailRef.current.length > 0
                    ? trailRef.current[trailRef.current.length - 1]
                    : null;

            if (swordPos) {
                drawSword(ctx, swordPos.x, swordPos.y, knightAngleRef.current);
            }

            ctx.restore();

            // FPS Calculation & Display
            const now = performance.now();
            frameCountRef.current++;
            if (now - lastTimeRef.current >= 1000) {
                fpsRef.current = frameCountRef.current;
                frameCountRef.current = 0;
                lastTimeRef.current = now;
            }

            ctx.save();
            ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
            ctx.fillRect(w - 100, h - 40, 90, 30);
            ctx.fillStyle = "#00ff00";
            ctx.font = "bold 20px monospace";
            ctx.textAlign = "right";
            ctx.fillText(`FPS: ${fpsRef.current}`, w - 20, h - 18);
            ctx.restore();

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
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
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

            {/* Debug Button */}

            {/* Combo Popups (HTML overlay for huge effect) */}
            {combo > 1 && (
                <div className="absolute top-1/3 left-1/2 -translate-x-1/2 z-20 text-6xl font-black text-yellow-400 animate-bounce drop-shadow-[0_0_25px_rgba(255,200,0,1)] pointer-events-none whitespace-nowrap">
                    {combo} COMBO! 🔥
                </div>
            )}

            {/* Start Screen */}
            {uiState === "start" && (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm text-center">
                    <h1 className="text-8xl font-black text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-orange-500 mb-6 animate-pulse drop-shadow-[0_0_30px_rgba(0,255,100,0.5)]">
                        نينجا البلغة
                    </h1>
                    <p className="text-4xl text-white mb-10 font-bold drop-shadow-md" dir="rtl">هز صبعك و وريني حنة يديك! 🤚</p>
                    
                    <div className="flex gap-4 mb-8">
                        <button
                            onClick={startGame}
                            className="px-12 py-6 bg-gradient-to-br from-orange-600 to-red-600 rounded-full text-4xl font-black hover:scale-110 transition-all shadow-[0_0_50px_rgba(255,100,0,0.8)] border-4 border-orange-400 text-white active:scale-95"
                        >
                            بسم الله نبداو
                        </button>
                        <button
                            onClick={() => setShowSettings(true)}
                            className="px-8 py-6 bg-gradient-to-br from-purple-600 to-blue-600 rounded-full text-3xl font-bold hover:scale-110 transition-all shadow-[0_0_30px_rgba(150,100,255,0.6)] border-4 border-purple-400 text-white active:scale-95"
                        >
                            ⚙️ الإعدادات
                        </button>
                    </div>

                    <div className="absolute bottom-10 flex gap-12 text-white/70 text-lg font-semibold">
                        <div className="flex flex-col items-center gap-2">
                            <span className="text-4xl">☝️</span>
                            <span>غير بالصبع</span>
                        </div>
                        <div className="flex flex-col items-center gap-2">
                            <span className="text-4xl">🥘</span>
                            <span>حضِي مع الطبسيل</span>
                        </div>
                    </div>

                    {/* Settings Panel */}
                    {showSettings && (
                        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-md" onClick={() => setShowSettings(false)}>
                            <div className="bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 rounded-3xl p-8 max-w-2xl w-full mx-4 border-2 border-purple-500/50 shadow-[0_0_60px_rgba(150,100,255,0.4)]" onClick={e => e.stopPropagation()}>
                                <div className="flex justify-between items-center mb-6">
                                    <h2 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">
                                        ⚙️ إعدادات اللعبة
                                    </h2>
                                    <button
                                        onClick={() => setShowSettings(false)}
                                        className="text-3xl text-white/70 hover:text-white transition-colors"
                                    >
                                        ✕
                                    </button>
                                </div>

                                {/* Difficulty Presets */}
                                <div className="mb-8">
                                    <h3 className="text-2xl font-bold text-white mb-4">📊 الصعوبة</h3>
                                    <div className="grid grid-cols-3 gap-3">
                                        {Object.entries(DIFFICULTY_PRESETS).map(([key, preset]) => (
                                            <button
                                                key={key}
                                                onClick={() => setSettings(preset)}
                                                className={`py-4 px-6 rounded-2xl text-xl font-bold transition-all ${
                                                    settings.spawnRate === preset.spawnRate && settings.gravity === preset.gravity
                                                        ? 'bg-gradient-to-br from-purple-500 to-pink-500 text-white scale-105 shadow-lg'
                                                        : 'bg-white/10 text-white/70 hover:bg-white/20'
                                                }`}
                                            >
                                                {key === 'easy' && '🟢 سهل'}
                                                {key === 'medium' && '🟡 متوسط'}
                                                {key === 'hard' && '🔴 صعب'}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Custom Sliders */}
                                <div className="space-y-6">
                                    <div>
                                        <div className="flex justify-between text-white mb-2">
                                            <span className="text-lg font-semibold">🎯 سرعة الظهور</span>
                                            <span className="text-purple-400 font-mono">{settings.spawnRate}</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="40"
                                            max="200"
                                            value={settings.spawnRate}
                                            onChange={e => setSettings({ ...settings, spawnRate: Number(e.target.value) })}
                                            className="w-full h-3 bg-white/20 rounded-full appearance-none cursor-pointer accent-purple-500"
                                        />
                                        <div className="flex justify-between text-xs text-white/50 mt-1">
                                            <span>سريع</span>
                                            <span>بطيء</span>
                                        </div>
                                    </div>

                                    <div>
                                        <div className="flex justify-between text-white mb-2">
                                            <span className="text-lg font-semibold">🌍 الجاذبية</span>
                                            <span className="text-purple-400 font-mono">{settings.gravity.toFixed(2)}</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="0.04"
                                            max="0.20"
                                            step="0.01"
                                            value={settings.gravity}
                                            onChange={e => setSettings({ ...settings, gravity: Number(e.target.value) })}
                                            className="w-full h-3 bg-white/20 rounded-full appearance-none cursor-pointer accent-purple-500"
                                        />
                                        <div className="flex justify-between text-xs text-white/50 mt-1">
                                            <span>خفيفة</span>
                                            <span>قوية</span>
                                        </div>
                                    </div>

                                    <div>
                                        <div className="flex justify-between text-white mb-2">
                                            <span className="text-lg font-semibold">🚀 قوة القفز</span>
                                            <span className="text-purple-400 font-mono">{settings.launchPower}</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="6"
                                            max="18"
                                            value={settings.launchPower}
                                            onChange={e => setSettings({ ...settings, launchPower: Number(e.target.value) })}
                                            className="w-full h-3 bg-white/20 rounded-full appearance-none cursor-pointer accent-purple-500"
                                        />
                                        <div className="flex justify-between text-xs text-white/50 mt-1">
                                            <span>منخفض</span>
                                            <span>عالي</span>
                                        </div>
                                    </div>

                                    <div>
                                        <div className="flex justify-between text-white mb-2">
                                            <span className="text-lg font-semibold">❤️ عدد القلوب</span>
                                            <span className="text-purple-400 font-mono">{settings.lives}</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="1"
                                            max="10"
                                            value={settings.lives}
                                            onChange={e => setSettings({ ...settings, lives: Number(e.target.value) })}
                                            className="w-full h-3 bg-white/20 rounded-full appearance-none cursor-pointer accent-purple-500"
                                        />
                                        <div className="flex justify-between text-xs text-white/50 mt-1">
                                            <span>1</span>
                                            <span>10</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Current Settings Preview */}
                                <div className="mt-8 p-4 bg-white/10 rounded-xl">
                                    <div className="text-white/70 text-sm mb-2">📋 الإعدادات الحالية:</div>
                                    <div className="text-white font-mono text-sm">
                                        ظهور: {settings.spawnRate} | جاذبية: {settings.gravity.toFixed(2)} | قفز: {settings.launchPower} | قلوب: {settings.lives}
                                    </div>
                                </div>

                                <div className="mt-6 flex justify-center">
                                    <button
                                        onClick={() => setShowSettings(false)}
                                        className="px-10 py-4 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full text-2xl font-bold hover:scale-105 transition-all shadow-lg text-white"
                                    >
                                        ✓ حفظ وإغلاق
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Game Over Screen */}
            {uiState === "gameover" && (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-red-950/90 backdrop-blur-md animate-in fade-in duration-300 text-center">
                    <h2 className="text-8xl font-black text-white mb-4 drop-shadow-[0_5px_0_#990000]">مشيتي فيها!</h2>
                    <p className="text-3xl text-orange-300 mb-6 font-bold drop-shadow-md max-w-2xl leading-normal" dir="rtl">
                        هرستي طبسيل الطاووس ديال الوالدة؟!! 😱<br />
                        الله يرحمك.. الوالدة جاية في الطريق!
                    </p>
                    <div className="text-5xl text-yellow-300 mb-12 font-bold drop-shadow-lg" dir="rtl">السكور: {score}</div>
                    <button
                        onClick={startGame}
                        className="px-10 py-5 bg-white text-red-700 rounded-3xl text-3xl font-black hover:scale-105 transition-transform shadow-2xl hover:shadow-white/20"
                    >
                        عاود جرب (قبل ما تجي) ↺
                    </button>
                </div>
            )}
        </>
    );
}
