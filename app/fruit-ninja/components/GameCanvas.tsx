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
    const knightAngleRef = useRef(0); // Track sword angle
    const swordImgRef = useRef<HTMLImageElement | null>(null); // Image for the sword
    const bombImgRef = useRef<HTMLImageElement | null>(null); // Image for the bomb
    const comboSoundRef = useRef<AudioBuffer | null>(null); // Custom combo sound
    const gameOverSoundRef = useRef<AudioBuffer | null>(null); // Custom gameover sound
    const fingerRef = useRef(finger);
    const activeAudioSourceRef = useRef<AudioBufferSourceNode | null>(null); // Track active sound
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
        livesRef.current = 90;
        setScore(0);
        setLives(90);
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

    const drawSword = (ctx: CanvasRenderingContext2D, x: number, y: number, angle: number) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle); // Rotate to align with movement

        const img = swordImgRef.current;
        if (img && img.complete) {
            // Draw Image
            const scale = 1.2; // Adjust scale as needed
            const w = img.width * scale;
            const h = img.height * scale;
            // Draw centered, maybe offset slightly so 'tip' is at (0,0)?
            // Assuming balgha is horizontal, let's center it for now.
            ctx.drawImage(img, -w / 2, -h / 2, w, h);
        } else {
            // Fallback to "Big Knight" sword if image not loaded
            const scale = 1.5;
            ctx.scale(scale, scale);
            ctx.rotate(Math.PI / 2); // Original rotation tweak for the drawn sword

            // Shadow
            ctx.shadowBlur = 10;
            ctx.shadowColor = "rgba(0,0,0,0.5)";

            // Blade (Metallic)
            ctx.beginPath();
            ctx.moveTo(0, -10);
            ctx.lineTo(80, 0); // Tip
            ctx.lineTo(0, 10);
            ctx.lineTo(-20, 10);
            ctx.lineTo(-20, -10);
            ctx.closePath();
            const grad = ctx.createLinearGradient(0, -10, 0, 10);
            grad.addColorStop(0, "#ccc");
            grad.addColorStop(0.5, "#fff");
            grad.addColorStop(1, "#999");
            ctx.fillStyle = grad;
            ctx.fill();
            ctx.strokeStyle = "#666";
            ctx.lineWidth = 1;
            ctx.stroke();

            // Fuller (Blood groove)
            ctx.beginPath();
            ctx.moveTo(-15, 0);
            ctx.lineTo(50, 0);
            ctx.lineWidth = 2;
            ctx.strokeStyle = "#888";
            ctx.stroke();

            // Crossguard
            ctx.fillStyle = "#DAA520"; // Golden
            ctx.fillRect(-24, -25, 10, 50);

            // Hilt (Handle)
            ctx.fillStyle = "#8B4513"; // Brown leather
            ctx.fillRect(-60, -5, 40, 10);

            // Pommel
            ctx.beginPath();
            ctx.arc(-65, 0, 8, 0, Math.PI * 2);
            ctx.fillStyle = "#DAA520";
            ctx.fill();
        }

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

                ctx.shadowBlur = 25;
                ctx.shadowColor = "#00ffff";
                ctx.stroke();
                ctx.shadowBlur = 0;
            }

            // Sword angle - FIXED
            knightAngleRef.current = 3.5;

            // ================= GAME LOOP =================
            if (stateRef.current === "playing") {
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
                        ctx.shadowBlur = 20;
                        ctx.shadowColor = f.bomb ? "#ff0000" : "#ffff00";

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
                    <button
                        onClick={startGame}
                        className="px-12 py-6 bg-gradient-to-br from-orange-600 to-red-600 rounded-full text-4xl font-black hover:scale-110 transition-all shadow-[0_0_50px_rgba(255,100,0,0.8)] border-4 border-orange-400 text-white active:scale-95"
                    >
                        بسم الله نبداو
                    </button>

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
