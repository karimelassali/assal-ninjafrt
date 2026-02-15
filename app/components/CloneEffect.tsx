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

export default function CloneEffect({
    webcamRef,
    results,
    jutsuActive,
    cloneCount,
    handStatus,
}: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [size, setSize] = useState({ w: 1280, h: 720 });

    // Stable refs
    const flashRef = useRef(0);
    const prevCountRef = useRef(0);
    const jutsuRef = useRef(jutsuActive);
    const countRef = useRef(cloneCount);
    const statusRef = useRef(handStatus);
    const resultsRef = useRef(results);

    useEffect(() => { jutsuRef.current = jutsuActive; }, [jutsuActive]);
    useEffect(() => {
        if (cloneCount > 0 && prevCountRef.current === 0) flashRef.current = 1;
        prevCountRef.current = cloneCount;
        countRef.current = cloneCount;
    }, [cloneCount]);
    useEffect(() => { statusRef.current = handStatus; }, [handStatus]);
    useEffect(() => { resultsRef.current = results; }, [results]);
    useEffect(() => {
        if (!jutsuActive) { prevCountRef.current = 0; flashRef.current = 0; }
    }, [jutsuActive]);

    useEffect(() => {
        const resize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
        resize();
        window.addEventListener("resize", resize);
        return () => window.removeEventListener("resize", resize);
    }, []);

    /* ---- Helper: draw video with "cover" fit (fills dest, crops overflow) ---- */
    function drawCover(
        ctx: CanvasRenderingContext2D,
        vid: HTMLVideoElement,
        dx: number, dy: number, dw: number, dh: number
    ) {
        const vw = vid.videoWidth;
        const vh = vid.videoHeight;
        if (!vw || !vh) return;

        const destAspect = dw / dh;
        const vidAspect = vw / vh;
        let sx: number, sy: number, sw: number, sh: number;

        if (destAspect > vidAspect) {
            sw = vw;
            sh = vw / destAspect;
            sx = 0;
            sy = (vh - sh) / 2;
        } else {
            sh = vh;
            sw = vh * destAspect;
            sx = (vw - sw) / 2;
            sy = 0;
        }
        ctx.drawImage(vid, sx, sy, sw, sh, dx, dy, dw, dh);
    }

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

            // Dark background
            ctx.fillStyle = "#0a0a0a";
            ctx.fillRect(0, 0, W, H);

            const active = jutsuRef.current;
            const count = countRef.current;
            const status = statusRef.current;
            const res = resultsRef.current;

            if (!active || count === 0) {
                // ==========================================
                // IDLE MODE: full-screen video with hand dots
                // ==========================================
                drawCover(ctx, vid, 0, 0, W, H);

                // Hand tracking dots
                if (res?.multiHandLandmarks) {
                    let color = "#ff3333";
                    if (status === "near") color = "#ffdd00";
                    if (status === "active") color = "#00ff66";
                    if (status === "fist") color = "#3399ff";

                    ctx.save();
                    for (const hand of res.multiHandLandmarks) {
                        // draw connections (skeleton)
                        const connections = [
                            [0, 1], [1, 2], [2, 3], [3, 4], // thumb
                            [0, 5], [5, 6], [6, 7], [7, 8], // index
                            [0, 9], [9, 10], [10, 11], [11, 12], // middle
                            [0, 13], [13, 14], [14, 15], [15, 16], // ring
                            [0, 17], [17, 18], [18, 19], [19, 20], // pinky
                            [5, 9], [9, 13], [13, 17], // palm
                        ];
                        ctx.strokeStyle = color;
                        ctx.lineWidth = 2;
                        ctx.globalAlpha = 0.5;
                        for (const [a, b] of connections) {
                            ctx.beginPath();
                            ctx.moveTo(hand[a].x * W, hand[a].y * H);
                            ctx.lineTo(hand[b].x * W, hand[b].y * H);
                            ctx.stroke();
                        }

                        // dots
                        ctx.globalAlpha = 0.9;
                        ctx.fillStyle = color;
                        ctx.shadowBlur = 8;
                        ctx.shadowColor = color;
                        for (const pt of hand) {
                            ctx.beginPath();
                            ctx.arc(pt.x * W, pt.y * H, 4, 0, Math.PI * 2);
                            ctx.fill();
                        }
                    }
                    ctx.restore();
                }
            } else {
                // ==========================================
                // JUTSU MODE: Main + Clone panels
                // ==========================================
                const gap = 4;

                // Determine layout based on clone count
                // 2 clones = 3 panels, 4 clones = 5 panels, 6 clones = 7 panels
                const totalPanels = Math.min(count, 6) + 1; // +1 for main
                // Limit to max 5 visible panels for clarity (1 main + 4 clones)
                const visiblePanels = Math.min(totalPanels, 5);

                // Calculate panel sizes
                // Main panel is larger, clones are smaller
                const mainWidth = Math.floor(W * 0.42);
                const remainingWidth = W - mainWidth - gap * (visiblePanels - 1);
                const cloneWidth = Math.floor(remainingWidth / (visiblePanels - 1));
                const panelH = H;

                // Draw clones first (behind if overlapping)
                const clonePanels = visiblePanels - 1;
                const leftClones = Math.ceil(clonePanels / 2);
                const rightClones = Math.floor(clonePanels / 2);

                // Left clones
                for (let i = 0; i < leftClones; i++) {
                    const x = (leftClones - 1 - i) * (cloneWidth + gap);
                    ctx.save();
                    // Slight blue/purple tint for clones
                    ctx.filter = "saturate(0.8) brightness(0.9) hue-rotate(10deg)";
                    drawCover(ctx, vid, x, 0, cloneWidth, panelH);
                    ctx.restore();

                    // Clone border glow
                    ctx.save();
                    ctx.strokeStyle = "rgba(0, 180, 255, 0.6)";
                    ctx.lineWidth = 3;
                    ctx.shadowColor = "#00b4ff";
                    ctx.shadowBlur = 15;
                    ctx.strokeRect(x + 1, 1, cloneWidth - 2, panelH - 2);
                    ctx.restore();
                }

                // Right clones
                for (let i = 0; i < rightClones; i++) {
                    const x = W - (i + 1) * (cloneWidth + gap) + gap;
                    ctx.save();
                    ctx.filter = "saturate(0.8) brightness(0.9) hue-rotate(10deg)";
                    drawCover(ctx, vid, x, 0, cloneWidth, panelH);
                    ctx.restore();

                    ctx.save();
                    ctx.strokeStyle = "rgba(0, 180, 255, 0.6)";
                    ctx.lineWidth = 3;
                    ctx.shadowColor = "#00b4ff";
                    ctx.shadowBlur = 15;
                    ctx.strokeRect(x + 1, 1, cloneWidth - 2, panelH - 2);
                    ctx.restore();
                }

                // Main panel (center, larger, on top)
                const mainX = leftClones * (cloneWidth + gap);
                ctx.save();
                drawCover(ctx, vid, mainX, 0, mainWidth, panelH);
                ctx.restore();

                // Main panel orange border
                ctx.save();
                ctx.strokeStyle = "rgba(255, 120, 0, 0.8)";
                ctx.lineWidth = 4;
                ctx.shadowColor = "#ff6600";
                ctx.shadowBlur = 20;
                ctx.strokeRect(mainX + 1, 1, mainWidth - 2, panelH - 2);
                ctx.restore();
            }

            // ==========================================
            // Flash effect (brief white/gold, fades once)
            // ==========================================
            if (flashRef.current > 0.02) {
                ctx.save();
                ctx.globalAlpha = flashRef.current;
                ctx.fillStyle = "#ffffff";
                ctx.fillRect(0, 0, W, H);
                ctx.restore();
                flashRef.current *= 0.85;
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
