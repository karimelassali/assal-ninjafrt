"use client";

import { useEffect, useRef, useState } from "react";
import Webcam from "react-webcam";
import type { Results } from "@mediapipe/hands";
import type { HandStatus } from "./HandDetector";

interface Props {
    webcamRef: React.RefObject<Webcam | null>;
    results: Results | null;
    jutsuActive: boolean;
    cloneCount: number;
    handStatus: HandStatus;
}

/* ---- Smoke particle ---- */
interface Smoke {
    x: number;
    y: number;
    vx: number;
    vy: number;
    r: number;
    life: number;
    maxLife: number;
}

export default function CloneEffect({
    webcamRef,
    results,
    jutsuActive,
    cloneCount,
    handStatus,
}: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [size, setSize] = useState({ w: 1280, h: 720 });

    /* ---- Segmentation ---- */
    const segRef = useRef<any>(null);
    const maskRef = useRef<any>(null);
    const segBusyRef = useRef(false);

    /* ---- Offscreen canvases ---- */
    const personCanvasRef = useRef<HTMLCanvasElement | null>(null);

    /* ---- Smoke particles ---- */
    const smokesRef = useRef<Smoke[]>([]);

    /* ---- Stable refs ---- */
    const flashRef = useRef(0);
    const prevCountRef = useRef(0);
    const jutsuRef = useRef(jutsuActive);
    const countRef = useRef(cloneCount);
    const statusRef = useRef(handStatus);
    const resultsRef = useRef(results);

    useEffect(() => { jutsuRef.current = jutsuActive; }, [jutsuActive]);
    useEffect(() => {
        if (cloneCount > 0 && prevCountRef.current === 0) {
            flashRef.current = 1;
            // Spawn burst of smoke
            spawnSmokeBurst(640, 360, 80);
        }
        prevCountRef.current = cloneCount;
        countRef.current = cloneCount;
    }, [cloneCount]);
    useEffect(() => { statusRef.current = handStatus; }, [handStatus]);
    useEffect(() => { resultsRef.current = results; }, [results]);
    useEffect(() => {
        if (!jutsuActive) { prevCountRef.current = 0; flashRef.current = 0; }
    }, [jutsuActive]);

    /* ---- Spawn smoke burst ---- */
    function spawnSmokeBurst(cx: number, cy: number, count: number) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 1 + Math.random() * 4;
            const life = 0.6 + Math.random() * 0.8;
            smokesRef.current.push({
                x: cx + (Math.random() - 0.5) * 200,
                y: cy + (Math.random() - 0.5) * 200,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 1,
                r: 10 + Math.random() * 30,
                life,
                maxLife: life,
            });
        }
    }

    /* ---- Create offscreen canvas ---- */
    useEffect(() => {
        personCanvasRef.current = document.createElement("canvas");
    }, []);

    /* ---- Init selfie segmentation ---- */
    useEffect(() => {
        let alive = true;
        (async () => {
            const { SelfieSegmentation } = await import("@mediapipe/selfie_segmentation");
            if (!alive) return;
            const seg = new SelfieSegmentation({
                locateFile: (file: string) =>
                    `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`,
            });
            seg.setOptions({ modelSelection: 1 });
            seg.onResults((r: any) => {
                maskRef.current = r.segmentationMask;
                segBusyRef.current = false;
            });
            segRef.current = seg;
            console.log("✅ Selfie Segmentation loaded");
        })();
        return () => { alive = false; };
    }, []);

    /* ---- Resize ---- */
    useEffect(() => {
        const resize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
        resize();
        window.addEventListener("resize", resize);
        return () => window.removeEventListener("resize", resize);
    }, []);

    /* ---- drawCover: video fills dest area maintaining aspect (like CSS cover) ---- */
    function drawCover(
        ctx: CanvasRenderingContext2D,
        src: CanvasImageSource & { videoWidth?: number; videoHeight?: number; width?: number; height?: number },
        dx: number, dy: number, dw: number, dh: number
    ) {
        const vw = src.videoWidth || (src as any).width || 0;
        const vh = src.videoHeight || (src as any).height || 0;
        if (!vw || !vh) return;
        const da = dw / dh, va = vw / vh;
        let sx: number, sy: number, sw: number, sh: number;
        if (da > va) { sw = vw; sh = vw / da; sx = 0; sy = (vh - sh) / 2; }
        else { sh = vh; sw = vh * da; sx = (vw - sw) / 2; sy = 0; }
        ctx.drawImage(src, sx, sy, sw, sh, dx, dy, dw, dh);
    }

    /* ---- Render loop ---- */
    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;
        let raf: number;

        const draw = () => {
            const vid = webcamRef.current?.video;
            if (!vid || vid.readyState < 4) { raf = requestAnimationFrame(draw); return; }

            const W = canvas.width;
            const H = canvas.height;

            // Dark bg
            ctx.fillStyle = "#0a0a0a";
            ctx.fillRect(0, 0, W, H);

            const active = jutsuRef.current;
            const count = countRef.current;
            const status = statusRef.current;
            const res = resultsRef.current;

            // Send frames to segmentation when jutsu is active
            if (active && segRef.current && !segBusyRef.current) {
                segBusyRef.current = true;
                segRef.current.send({ image: vid });
            }

            // ============================
            // 1. Draw full video (background + you = the scene)
            // ============================
            drawCover(ctx, vid, 0, 0, W, H);

            // ============================
            // 2. Draw person-only clones (when jutsu active + mask ready)
            // ============================
            if (active && count > 0 && maskRef.current && personCanvasRef.current) {
                const pc = personCanvasRef.current;
                pc.width = W;
                pc.height = H;
                const pctx = pc.getContext("2d");

                if (pctx) {
                    // Step A: Draw the segmentation mask (person = opaque, bg = transparent)
                    pctx.clearRect(0, 0, W, H);
                    pctx.drawImage(maskRef.current, 0, 0, W, H);

                    // Step B: source-in → next draw keeps only pixels where mask is opaque
                    pctx.globalCompositeOperation = "source-in";
                    drawCover(pctx, vid, 0, 0, W, H);
                    pctx.globalCompositeOperation = "source-over";

                    // Now pc contains ONLY the person on transparent background!
                    // Draw clones at shifted positions
                    const cloneOffsets = [
                        { x: -0.22 },
                        { x: 0.22 },
                        { x: -0.40 },
                        { x: 0.40 },
                        { x: -0.55 },
                        { x: 0.55 },
                    ];

                    for (let i = 0; i < Math.min(count, 6); i++) {
                        const off = cloneOffsets[i];
                        ctx.save();
                        ctx.globalAlpha = 0.92;
                        // Draw the person-only cutout shifted horizontally
                        ctx.drawImage(pc, off.x * W, 0);
                        ctx.restore();
                    }
                }
            }

            // ============================
            // 3. Hand skeleton (when NOT active)
            // ============================
            if (!active && res?.multiHandLandmarks) {
                let color = "#ff3333";
                if (status === "near") color = "#ffdd00";
                if (status === "active") color = "#00ff66";
                if (status === "fist") color = "#3399ff";

                ctx.save();
                const conns = [
                    [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8],
                    [0, 9], [9, 10], [10, 11], [11, 12], [0, 13], [13, 14], [14, 15], [15, 16],
                    [0, 17], [17, 18], [18, 19], [19, 20], [5, 9], [9, 13], [13, 17],
                ];
                ctx.strokeStyle = color;
                ctx.lineWidth = 2;
                ctx.globalAlpha = 0.4;
                for (const hand of res.multiHandLandmarks) {
                    for (const [a, b] of conns) {
                        ctx.beginPath();
                        ctx.moveTo(hand[a].x * W, hand[a].y * H);
                        ctx.lineTo(hand[b].x * W, hand[b].y * H);
                        ctx.stroke();
                    }
                }
                ctx.globalAlpha = 1;
                ctx.fillStyle = color;
                ctx.shadowBlur = 10;
                ctx.shadowColor = color;
                for (const hand of res.multiHandLandmarks) {
                    for (const pt of hand) {
                        ctx.beginPath();
                        ctx.arc(pt.x * W, pt.y * H, 4, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
                ctx.restore();
            }

            // ============================
            // 4. Smoke particles
            // ============================
            const smokes = smokesRef.current;
            for (let i = smokes.length - 1; i >= 0; i--) {
                const s = smokes[i];
                s.x += s.vx;
                s.y += s.vy;
                s.life -= 0.012;
                s.r += 0.5;
                if (s.life <= 0) { smokes.splice(i, 1); continue; }
                const alpha = (s.life / s.maxLife) * 0.5;
                ctx.save();
                ctx.globalAlpha = alpha;
                ctx.fillStyle = "#ddd";
                ctx.shadowColor = "#fff";
                ctx.shadowBlur = 15;
                ctx.beginPath();
                ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }

            // ============================
            // 5. Flash (fades once)
            // ============================
            if (flashRef.current > 0.02) {
                ctx.save();
                ctx.globalAlpha = flashRef.current;
                ctx.fillStyle = "#ffffff";
                ctx.fillRect(0, 0, W, H);
                ctx.restore();
                flashRef.current *= 0.82;
            }

            raf = requestAnimationFrame(draw);
        };

        draw();
        return () => cancelAnimationFrame(raf);
    }, [webcamRef, size]);

    return (
        <canvas
            ref={canvasRef}
            width={size.w}
            height={size.h}
            className="absolute inset-0 w-full h-full"
        />
    );
}
