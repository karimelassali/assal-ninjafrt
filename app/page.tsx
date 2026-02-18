"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Webcam from "react-webcam";
import type { Results } from "@mediapipe/hands";
import CameraFeed from "./components/CameraFeed";
import HandDetector, { HandStatus } from "./components/HandDetector";
import CloneEffect from "./components/CloneEffect";

/* ============ Tutorial Data ============ */
const STEPS = [
  { emoji: "🍥", title: "Welcome, Shinobi!", body: "This app uses your camera + AI to detect Naruto hand signs and create real Shadow Clones of yourself!" },
  { emoji: "✋✋", title: "Show Both Hands", body: "Raise both hands in front of the camera. Colored tracking dots will appear on your fingers." },
  { emoji: "✌️✌️", title: "Form the Tiger Seal", body: "Extend Index + Middle fingers on both hands (peace sign ✌️). Keep Ring & Pinky fingers curled." },
  { emoji: "🤞", title: "Cross Your Hands", body: "Bring both hands close together — wrists touching. Status goes 🔴 → 🟡 → 🟢" },
  { emoji: "💨", title: "Clones Appear!", body: "Your body is extracted from the background and duplicated next to you. 影分身の術!" },
  { emoji: "👊", title: "Release with Fists", body: "Make fists with both hands to dismiss clones and try again. Ready? Let's go!" },
];

export default function Home() {
  const webcamRef = useRef<Webcam>(null);
  const [loading, setLoading] = useState(true);
  const [camReady, setCamReady] = useState(false);
  const [appStarted, setAppStarted] = useState(false);
  const [tutStep, setTutStep] = useState(0);
  const [showHelp, setShowHelp] = useState(false);

  const [results, setResults] = useState<Results | null>(null);
  const [handStatus, setHandStatus] = useState<HandStatus>("idle");
  const [jutsuActive, setJutsuActive] = useState(false);
  const [cloneCount, setCloneCount] = useState(0);

  const jutsuRef = useRef(false);
  const jutsuAudioRef = useRef<HTMLAudioElement | null>(null);
  const bgMusicRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    jutsuAudioRef.current = new Audio("/naruto_shadow_clones.mp3");
    jutsuAudioRef.current.volume = 1;
    bgMusicRef.current = new Audio("/luca-sto-sbolando.mp3");
    bgMusicRef.current.volume = 0.3;
    bgMusicRef.current.loop = true;
  }, []);

  const playJutsuAudio = useCallback(() => {
    if (!jutsuAudioRef.current || !appStarted) return;
    jutsuAudioRef.current.currentTime = 0;
    jutsuAudioRef.current.play().catch(() => { });
  }, [appStarted]);

  const onCamReady = useCallback(() => { setLoading(false); setCamReady(true); }, []);

  const reset = useCallback(() => {
    jutsuRef.current = false;
    setJutsuActive(false);
    setCloneCount(0);
    if (jutsuAudioRef.current) { jutsuAudioRef.current.pause(); jutsuAudioRef.current.currentTime = 0; }
  }, []);

  const onStatus = useCallback((s: HandStatus) => {
    setHandStatus(s);
    if (s === "active" && !jutsuRef.current) {
      jutsuRef.current = true;
      setJutsuActive(true);
      playJutsuAudio();
      let c = 0;
      const iv = setInterval(() => { c += 2; setCloneCount(c); if (c >= 4) clearInterval(iv); }, 500);
    }
    if (s === "fist" && jutsuRef.current) reset();
  }, [playJutsuAudio, reset]);

  const finishTutorial = () => {
    setAppStarted(true);
    setShowHelp(false);
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (AC) new AC().resume();
    if (jutsuAudioRef.current) {
      jutsuAudioRef.current.play().then(() => { jutsuAudioRef.current!.pause(); jutsuAudioRef.current!.currentTime = 0; }).catch(() => { });
    }
    bgMusicRef.current?.play().catch(() => { });
  };

  const toggleMusic = () => {
    if (!bgMusicRef.current) return;
    bgMusicRef.current.paused ? bgMusicRef.current.play().catch(() => { }) : bgMusicRef.current.pause();
  };

  /* ============ TUTORIAL SCREEN ============ */
  if (!appStarted) {
    const step = STEPS[tutStep];
    const isLast = tutStep === STEPS.length - 1;
    const hues = [20, 0, 45, 130, 210, 270];
    const hue = hues[tutStep];

    return (
      <div style={{
        position: "fixed", inset: 0,
        background: `radial-gradient(ellipse at 50% 80%, hsl(${hue}, 60%, 8%) 0%, #050505 70%)`,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        fontFamily: "'Outfit', system-ui, sans-serif", color: "#fff",
        transition: "background 0.5s ease",
      }}>
        {/* Camera preloading invisibly */}
        <CameraFeed ref={webcamRef} onUserMedia={onCamReady} />

        {/* Ambient glow */}
        <div style={{
          position: "absolute", top: "30%", left: "50%", transform: "translateX(-50%)",
          width: 300, height: 300, borderRadius: "50%",
          background: `radial-gradient(circle, hsla(${hue}, 80%, 40%, 0.12) 0%, transparent 70%)`,
          pointerEvents: "none",
        }} />

        {/* Content card */}
        <div style={{
          position: "relative", zIndex: 2, maxWidth: 420, width: "90%",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 16,
          animation: "fadeSlideUp 0.5s ease-out both",
        }}>
          {/* Progress bar */}
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            {STEPS.map((_, i) => (
              <div key={i} style={{
                height: 4, borderRadius: 4,
                width: i === tutStep ? 32 : 16,
                background: i <= tutStep ? `hsl(${hue}, 80%, 55%)` : "rgba(255,255,255,0.1)",
                transition: "all 0.3s ease",
              }} />
            ))}
          </div>

          {/* Emoji */}
          <div style={{ fontSize: 72, lineHeight: 1, marginBottom: 8, filter: "drop-shadow(0 0 20px rgba(255,120,0,0.3))" }}>
            {step.emoji}
          </div>

          {/* Title */}
          <h1 style={{ fontSize: 32, fontWeight: 900, textAlign: "center", margin: 0, lineHeight: 1.2 }}>
            {step.title}
          </h1>

          {/* Body */}
          <p style={{ fontSize: 16, color: "rgba(255,255,255,0.45)", textAlign: "center", lineHeight: 1.7, maxWidth: 340, margin: 0 }}>
            {step.body}
          </p>

          {/* Buttons */}
          <div style={{ display: "flex", gap: 10, width: "100%", marginTop: 20 }}>
            {tutStep > 0 ? (
              <button onClick={() => setTutStep(s => s - 1)} style={{
                flex: 1, padding: "14px 16px", borderRadius: 16,
                background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                color: "rgba(255,255,255,0.4)", fontWeight: 600, fontSize: 15, cursor: "pointer",
                fontFamily: "inherit", transition: "all 0.2s",
              }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.12)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
              >
                ← Back
              </button>
            ) : (
              <button onClick={finishTutorial} style={{
                flex: 1, padding: "14px 16px", borderRadius: 16,
                background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                color: "rgba(255,255,255,0.25)", fontWeight: 600, fontSize: 15, cursor: "pointer",
                fontFamily: "inherit",
              }}>
                Skip
              </button>
            )}
            <button onClick={() => isLast ? finishTutorial() : setTutStep(s => s + 1)} style={{
              flex: 2, padding: "14px 16px", borderRadius: 16,
              background: `linear-gradient(135deg, hsl(${hue}, 80%, 50%), hsl(${hue + 20}, 70%, 40%))`,
              border: "none", color: "#fff", fontWeight: 700, fontSize: 17, cursor: "pointer",
              fontFamily: "inherit", boxShadow: `0 4px 30px hsla(${hue}, 80%, 50%, 0.3)`,
              transition: "all 0.2s",
            }}
              onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.02)"; }}
              onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}
            >
              {isLast ? "Let's Go! 🔥" : "Next →"}
            </button>
          </div>

          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.12)", marginTop: 8 }}>
            {tutStep + 1} / {STEPS.length}
          </p>
        </div>

        <style>{`
          @keyframes fadeSlideUp {
            from { opacity: 0; transform: translateY(30px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>
    );
  }

  /* ============ MAIN APP ============ */
  const statusColors: Record<HandStatus, string> = {
    idle: "#aaa", far: "#ff4444", near: "#ffcc00", active: "#44ff66", fist: "#4488ff",
  };
  const statusLabels: Record<HandStatus, string> = {
    idle: "Show both hands ✋", far: "Bring hands closer", near: "Almost there…", active: "Activating!", fist: "Releasing…",
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000", fontFamily: "'Outfit', system-ui, sans-serif" }}>
      <CameraFeed ref={webcamRef} onUserMedia={onCamReady} />
      <CloneEffect webcamRef={webcamRef} results={results} jutsuActive={jutsuActive} cloneCount={cloneCount} handStatus={handStatus} />
      {camReady && <HandDetector webcamRef={webcamRef} onResults={setResults} onStatusChange={onStatus} />}

      {/* Help modal */}
      {showHelp && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.85)", backdropFilter: "blur(12px)",
        }}>
          <div style={{
            background: "rgba(20,20,25,0.97)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 24,
            maxWidth: 380, width: "90%", padding: 28,
          }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, textAlign: "center", marginBottom: 20, color: "#fff" }}>Quick Guide</h2>
            {[
              ["✌️", "Show both hands with index + middle fingers up"],
              ["🤞", "Bring hands close together in a cross shape"],
              ["💨", "Clones appear — your body is duplicated!"],
              ["👊", "Make fists to release and try again"],
            ].map(([icon, text], i) => (
              <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
                <span style={{ fontSize: 20 }}>{icon}</span>
                <p style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", margin: 0, lineHeight: 1.5 }}>{text}</p>
              </div>
            ))}
            <button onClick={() => setShowHelp(false)} style={{
              marginTop: 16, width: "100%", padding: "12px 0", borderRadius: 16,
              background: "linear-gradient(135deg, #ff6600, #cc3300)", border: "none",
              color: "#fff", fontWeight: 700, fontSize: 16, cursor: "pointer", fontFamily: "inherit",
            }}>Got it ✓</button>
          </div>
        </div>
      )}

      {/* HUD */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 50, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 12 }}>
        {/* Top */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          {/* Status badge */}
          <div style={{
            background: "rgba(0,0,0,0.75)", backdropFilter: "blur(12px)", borderRadius: 14,
            padding: jutsuActive ? "10px 18px" : "8px 16px", border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
          }}>
            {loading ? (
              <span style={{ fontSize: 14, color: "#ff8800" }}>Loading…</span>
            ) : !jutsuActive ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{
                  width: 8, height: 8, borderRadius: "50%", background: statusColors[handStatus],
                  boxShadow: `0 0 8px ${statusColors[handStatus]}`,
                }} />
                <span style={{ fontSize: 14, fontWeight: 600, color: statusColors[handStatus] }}>
                  {statusLabels[handStatus]}
                </span>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 22, fontWeight: 900, color: "#ff6600", textShadow: "0 0 20px rgba(255,100,0,0.5)" }}>
                  影分身の術！
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>
                  Fists 👊 to release
                </div>
              </div>
            )}
          </div>

          {/* Control buttons */}
          <div style={{ display: "flex", gap: 6, pointerEvents: "auto" }}>
            <a href="/fruit-ninja" style={{
              width: 40, height: 40, borderRadius: 12, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(12px)",
              border: "1px solid rgba(255,255,255,0.08)", color: "#ffaa00",
              fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none"
            }} title="Go to Fruit Ninja">🍉</a>
            <button onClick={() => setShowHelp(true)} style={{
              width: 40, height: 40, borderRadius: 12, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(12px)",
              border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)",
              fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            }} title="Help">?</button>
            <button onClick={toggleMusic} style={{
              width: 40, height: 40, borderRadius: 12, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(12px)",
              border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)",
              fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            }} title="Toggle music">🎵</button>
          </div>
        </div>

        {/* Bottom */}
        <div style={{ display: "flex", justifyContent: "center" }}>
          {jutsuActive && cloneCount > 0 && (
            <div style={{
              marginBottom: 4, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(12px)",
              padding: "8px 20px", borderRadius: 100, border: "1px solid rgba(255,100,0,0.15)",
              boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
            }}>
              <span style={{ fontSize: 26, fontWeight: 900, color: "#ff8800" }}>×{cloneCount + 1}</span>
              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.2)", marginLeft: 6 }}>clones</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
