import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

// ---- Types ----
type GameScreen = "start" | "playing" | "gameover";
type JudgmentType = "PERFECT" | "GOOD" | "MISS";

interface Note {
  id: number;
  lane: number;
  y: number;
  speed: number;
  hit: boolean;
  missed: boolean;
  hitFlash: boolean;
}

interface FeedbackItem {
  id: number;
  lane: number;
  type: JudgmentType;
}

interface HitZoneFlash {
  lane: number;
  id: number;
}

// ---- Constants ----
const LANE_COLORS = ["#37D6FF", "#3B7CFF", "#FF3BCB", "#8A4CFF"];
const LANE_KEYS = ["d", "f", "j", "k"];
const HIT_ZONE_Y = 85;
const PERFECT_WINDOW = 50;
const GOOD_WINDOW = 120;
const NOTE_SIZE = 52;
const BASE_SPEED = 18;
const LIVES_MAX = 5;

const JUDGMENT_COLORS: Record<JudgmentType, string> = {
  PERFECT: "#37D6FF",
  GOOD: "#8A4CFF",
  MISS: "#FF3BCB",
};

function getBestScore(): number {
  return Number.parseInt(localStorage.getItem("taptap_best") ?? "0", 10);
}
function saveBestScore(score: number) {
  const best = getBestScore();
  if (score > best) localStorage.setItem("taptap_best", score.toString());
}

let noteIdCounter = 0;

export default function App() {
  const [screen, setScreen] = useState<GameScreen>("start");
  const [bestScore, setBestScore] = useState(getBestScore);
  const [notes, setNotes] = useState<Note[]>([]);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [lives, setLives] = useState(LIVES_MAX);
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);
  const [hitZoneFlashes, setHitZoneFlashes] = useState<HitZoneFlash[]>([]);
  const [lanePressed, setLanePressed] = useState<boolean[]>([
    false,
    false,
    false,
    false,
  ]);

  const gameRef = useRef({
    notes: [] as Note[],
    score: 0,
    combo: 0,
    lives: LIVES_MAX,
    running: false,
    lastTime: 0,
    elapsed: 0,
    nextNoteTime: 0,
    feedbackId: 0,
    flashId: 0,
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  const spawnNote = useCallback(() => {
    const lane = Math.floor(Math.random() * 4);
    const speed = BASE_SPEED + (gameRef.current.elapsed / 30) * 2;
    const note: Note = {
      id: ++noteIdCounter,
      lane,
      y: -5,
      speed,
      hit: false,
      missed: false,
      hitFlash: false,
    };
    gameRef.current.notes = [...gameRef.current.notes, note];
  }, []);

  const triggerFeedback = useCallback((lane: number, type: JudgmentType) => {
    const id = ++gameRef.current.feedbackId;
    setFeedbacks((prev) => [...prev, { id, lane, type }]);
    setTimeout(
      () => setFeedbacks((prev) => prev.filter((f) => f.id !== id)),
      700,
    );
  }, []);

  const triggerFlash = useCallback((lane: number) => {
    const id = ++gameRef.current.flashId;
    setHitZoneFlashes((prev) => [...prev, { id, lane }]);
    setTimeout(
      () => setHitZoneFlashes((prev) => prev.filter((f) => f.id !== id)),
      300,
    );
  }, []);

  const handleLaneTap = useCallback(
    (lane: number) => {
      if (!gameRef.current.running) return;

      let bestNote: Note | null = null;
      let bestDist = Number.POSITIVE_INFINITY;

      for (const note of gameRef.current.notes) {
        if (note.lane !== lane || note.hit || note.missed) continue;
        const dist = Math.abs(note.y - HIT_ZONE_Y);
        if (dist < bestDist) {
          bestDist = dist;
          bestNote = note;
        }
      }

      const speed = bestNote ? bestNote.speed : BASE_SPEED;
      const distMs = bestNote
        ? (bestDist / speed) * 1000
        : Number.POSITIVE_INFINITY;

      if (bestNote && distMs <= GOOD_WINDOW) {
        const type: JudgmentType =
          distMs <= PERFECT_WINDOW ? "PERFECT" : "GOOD";
        const pts = type === "PERFECT" ? 100 : 50;
        gameRef.current.combo += 1;
        const newCombo = gameRef.current.combo;
        const earned = pts * Math.max(1, newCombo);
        gameRef.current.score += earned;
        setScore(gameRef.current.score);
        setCombo(newCombo);
        gameRef.current.notes = gameRef.current.notes.map((n) =>
          n.id === bestNote!.id ? { ...n, hit: true } : n,
        );
        triggerFeedback(lane, type);
        triggerFlash(lane);
      }

      setLanePressed((prev) => {
        const next = [...prev];
        next[lane] = true;
        return next;
      });
      setTimeout(() => {
        setLanePressed((prev) => {
          const next = [...prev];
          next[lane] = false;
          return next;
        });
      }, 150);
    },
    [triggerFeedback, triggerFlash],
  );

  const gameLoop = useCallback(
    (timestamp: number) => {
      if (!gameRef.current.running) return;

      const dt = Math.min((timestamp - gameRef.current.lastTime) / 1000, 0.05);
      gameRef.current.lastTime = timestamp;
      gameRef.current.elapsed += dt;

      if (timestamp >= gameRef.current.nextNoteTime) {
        spawnNote();
        const interval = Math.max(400, 900 - gameRef.current.elapsed * 5);
        gameRef.current.nextNoteTime = timestamp + interval;
      }

      let livesLost = 0;
      gameRef.current.notes = gameRef.current.notes
        .map((note) => {
          if (note.hit || note.missed) return note;
          const newY = note.y + note.speed * dt;
          if (newY > HIT_ZONE_Y + 8 && !note.hit) {
            livesLost += 1;
            return { ...note, y: newY, missed: true };
          }
          return { ...note, y: newY };
        })
        .filter((note) => !(note.hit && note.y > 110))
        .filter((note) => note.y < 115);

      if (livesLost > 0) {
        gameRef.current.combo = 0;
        setCombo(0);
        gameRef.current.lives = Math.max(0, gameRef.current.lives - livesLost);
        setLives(gameRef.current.lives);

        const missedNotes = gameRef.current.notes.filter((n) => n.missed);
        for (const n of missedNotes) {
          triggerFeedback(n.lane, "MISS");
        }
        gameRef.current.notes = gameRef.current.notes.filter((n) => !n.missed);

        if (gameRef.current.lives <= 0) {
          gameRef.current.running = false;
          saveBestScore(gameRef.current.score);
          setBestScore(getBestScore());
          setScreen("gameover");
          return;
        }
      }

      setNotes([...gameRef.current.notes]);
      rafRef.current = requestAnimationFrame(gameLoop);
    },
    [spawnNote, triggerFeedback],
  );

  const startGame = useCallback(() => {
    noteIdCounter = 0;
    gameRef.current = {
      notes: [],
      score: 0,
      combo: 0,
      lives: LIVES_MAX,
      running: true,
      lastTime: performance.now(),
      elapsed: 0,
      nextNoteTime: performance.now() + 1000,
      feedbackId: 0,
      flashId: 0,
    };
    setNotes([]);
    setScore(0);
    setCombo(0);
    setLives(LIVES_MAX);
    setFeedbacks([]);
    setHitZoneFlashes([]);
    setScreen("playing");
    rafRef.current = requestAnimationFrame(gameLoop);
  }, [gameLoop]);

  useEffect(() => {
    return () => {
      gameRef.current.running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => {
    if (screen !== "playing") return;
    const handleKey = (e: KeyboardEvent) => {
      const idx = LANE_KEYS.indexOf(e.key.toLowerCase());
      if (idx !== -1) handleLaneTap(idx);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [screen, handleLaneTap]);

  return (
    <div
      ref={containerRef}
      className="game-bg scanline-overlay min-h-screen flex flex-col items-center justify-center select-none overflow-hidden"
    >
      <AnimatePresence mode="wait">
        {screen === "start" && (
          <StartScreen key="start" bestScore={bestScore} onPlay={startGame} />
        )}
        {screen === "playing" && (
          <GameScreen
            key="playing"
            notes={notes}
            score={score}
            combo={combo}
            lives={lives}
            feedbacks={feedbacks}
            hitZoneFlashes={hitZoneFlashes}
            lanePressed={lanePressed}
            onLaneTap={handleLaneTap}
          />
        )}
        {screen === "gameover" && (
          <GameOverScreen
            key="gameover"
            score={score}
            bestScore={bestScore}
            onPlayAgain={startGame}
          />
        )}
      </AnimatePresence>

      <div
        className="fixed bottom-4 left-0 right-0 text-center text-xs"
        style={{ color: "var(--neon-muted)", opacity: 0.5 }}
      >
        © {new Date().getFullYear()}. Built with love using{" "}
        <a
          href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(window.location.hostname)}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "var(--neon-cyan)" }}
        >
          caffeine.ai
        </a>
      </div>
    </div>
  );
}

function StartScreen({
  bestScore,
  onPlay,
}: { bestScore: number; onPlay: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.1 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col items-center justify-center gap-8 px-6"
      data-ocid="start.panel"
    >
      <div className="text-center">
        <h1
          className="text-8xl md:text-9xl font-black uppercase tracking-widest animate-title-glow"
          style={{
            color: "var(--neon-cyan)",
            fontFamily: "'Bricolage Grotesque', sans-serif",
          }}
        >
          TAP TAP
        </h1>
        <p
          className="mt-2 text-lg uppercase tracking-[0.3em] animate-flicker"
          style={{ color: "var(--neon-magenta)" }}
        >
          Rhythm Game
        </p>
      </div>

      <div
        className="px-8 py-4 rounded-2xl border"
        style={{
          background: "var(--neon-card)",
          borderColor: "rgba(55,214,255,0.3)",
          boxShadow: "0 0 20px rgba(55,214,255,0.1)",
        }}
      >
        <p
          className="text-xs uppercase tracking-widest mb-1"
          style={{ color: "var(--neon-muted)" }}
        >
          Best Score
        </p>
        <p
          className="text-4xl font-black text-center"
          style={{ color: "var(--neon-cyan)" }}
        >
          {bestScore.toLocaleString()}
        </p>
      </div>

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={onPlay}
        type="button"
        className="px-16 py-5 rounded-full text-2xl font-black uppercase tracking-widest border-2 transition-all duration-200"
        style={{
          background: "rgba(55,214,255,0.05)",
          borderColor: "var(--neon-cyan)",
          color: "var(--neon-cyan)",
          boxShadow:
            "0 0 20px rgba(55,214,255,0.4), 0 0 60px rgba(55,214,255,0.2), inset 0 0 20px rgba(55,214,255,0.05)",
        }}
        data-ocid="start.primary_button"
      >
        PLAY
      </motion.button>

      <div className="text-center" style={{ color: "var(--neon-muted)" }}>
        <p className="text-sm uppercase tracking-widest mb-3">Controls</p>
        <div className="flex gap-3 justify-center">
          {["D", "F", "J", "K"].map((key, i) => (
            <div
              key={key}
              className="w-12 h-12 rounded-lg border flex items-center justify-center text-lg font-bold"
              style={{
                borderColor: LANE_COLORS[i],
                color: LANE_COLORS[i],
                background: `${LANE_COLORS[i]}18`,
                boxShadow: `0 0 8px ${LANE_COLORS[i]}60`,
              }}
            >
              {key}
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs uppercase tracking-widest opacity-60">
          Or tap the lanes
        </p>
      </div>
    </motion.div>
  );
}

interface GameScreenProps {
  notes: Note[];
  score: number;
  combo: number;
  lives: number;
  feedbacks: FeedbackItem[];
  hitZoneFlashes: HitZoneFlash[];
  lanePressed: boolean[];
  onLaneTap: (lane: number) => void;
}

function GameScreen({
  notes,
  score,
  combo,
  lives,
  feedbacks,
  hitZoneFlashes,
  lanePressed,
  onLaneTap,
}: GameScreenProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="w-full h-screen flex flex-col"
      data-ocid="game.panel"
    >
      <div className="flex items-start justify-between px-6 pt-4 pb-2 z-10 relative">
        <div data-ocid="game.section">
          <p
            className="text-xs uppercase tracking-widest"
            style={{ color: "var(--neon-muted)" }}
          >
            Score
          </p>
          <p
            className="text-3xl font-black tabular-nums"
            style={{
              color: "var(--neon-cyan)",
              textShadow: "0 0 10px #37D6FF",
            }}
          >
            {score.toLocaleString()}
          </p>
        </div>

        <div className="text-center">
          {combo > 1 && (
            <motion.div
              key={combo}
              initial={{ scale: 1.4, opacity: 0.8 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.15 }}
            >
              <p
                className="text-xs uppercase tracking-widest"
                style={{ color: "var(--neon-muted)" }}
              >
                Combo
              </p>
              <p
                className="text-4xl font-black"
                style={{
                  color:
                    combo >= 50
                      ? "#FF3BCB"
                      : combo >= 20
                        ? "#8A4CFF"
                        : "#37D6FF",
                  textShadow:
                    combo >= 50
                      ? "0 0 15px #FF3BCB, 0 0 30px #FF3BCB"
                      : combo >= 20
                        ? "0 0 15px #8A4CFF, 0 0 30px #8A4CFF"
                        : "0 0 15px #37D6FF, 0 0 30px #37D6FF",
                }}
              >
                ×{combo}
              </p>
            </motion.div>
          )}
        </div>

        <div className="text-right">
          <p
            className="text-xs uppercase tracking-widest"
            style={{ color: "var(--neon-muted)" }}
          >
            Lives
          </p>
          <div className="flex gap-1 justify-end mt-1">
            {Array.from({ length: LIVES_MAX }, (_, i) => `heart-${i}`).map(
              (heartKey, i) => (
                <span
                  key={heartKey}
                  className="text-xl transition-all duration-300"
                  style={{
                    filter: i < lives ? "drop-shadow(0 0 6px #FF3BCB)" : "none",
                    opacity: i < lives ? 1 : 0.2,
                  }}
                >
                  ♥
                </span>
              ),
            )}
          </div>
        </div>
      </div>

      <div
        className="flex flex-1 gap-2 px-4 pb-8 relative"
        style={{ maxWidth: 500, margin: "0 auto", width: "100%" }}
      >
        {[0, 1, 2, 3].map((lane) => (
          <Lane
            key={lane}
            lane={lane}
            notes={notes.filter((n) => n.lane === lane)}
            feedbacks={feedbacks.filter((f) => f.lane === lane)}
            hitZoneFlash={hitZoneFlashes.some((f) => f.lane === lane)}
            pressed={lanePressed[lane]}
            onTap={() => onLaneTap(lane)}
          />
        ))}
      </div>
    </motion.div>
  );
}

interface LaneProps {
  lane: number;
  notes: Note[];
  feedbacks: FeedbackItem[];
  hitZoneFlash: boolean;
  pressed: boolean;
  onTap: () => void;
}

function Lane({
  lane,
  notes,
  feedbacks,
  hitZoneFlash,
  pressed,
  onTap,
}: LaneProps) {
  const color = LANE_COLORS[lane];
  const keyLabel = ["D", "F", "J", "K"][lane];

  return (
    <button
      type="button"
      aria-label={`Lane ${lane + 1} (${keyLabel})`}
      className="relative flex-1 rounded-2xl cursor-pointer overflow-hidden"
      style={{
        background: `linear-gradient(180deg, ${color}08 0%, ${color}04 100%)`,
        border: `1px solid ${color}40`,
        boxShadow: pressed
          ? `0 0 20px ${color}80, inset 0 0 20px ${color}20`
          : `0 0 6px ${color}30`,
        transition: "box-shadow 0.1s",
      }}
      onClick={onTap}
      onTouchStart={(e) => {
        e.preventDefault();
        onTap();
      }}
    >
      <div
        className="absolute top-3 left-0 right-0 flex justify-center text-xs font-bold uppercase tracking-widest opacity-40"
        style={{ color }}
      >
        {keyLabel}
      </div>

      {notes.map((note) => (
        <NoteCircle key={note.id} note={note} color={color} />
      ))}

      <HitZone color={color} flash={hitZoneFlash} pressed={pressed} />

      <AnimatePresence>
        {feedbacks.map((fb) => (
          <motion.div
            key={fb.id}
            initial={{ opacity: 1, y: 0, scale: 1 }}
            animate={{ opacity: 0, y: -60, scale: 1.2 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.65, ease: "easeOut" }}
            className="absolute left-0 right-0 flex justify-center pointer-events-none text-xs font-black uppercase tracking-widest"
            style={{
              bottom: `${100 - HIT_ZONE_Y + 5}%`,
              color: JUDGMENT_COLORS[fb.type],
              textShadow: `0 0 10px ${JUDGMENT_COLORS[fb.type]}`,
              zIndex: 20,
            }}
          >
            {fb.type}
          </motion.div>
        ))}
      </AnimatePresence>
    </button>
  );
}

function NoteCircle({ note, color }: { note: Note; color: string }) {
  return (
    <motion.div
      className="absolute left-1/2 rounded-full pointer-events-none"
      style={{
        width: NOTE_SIZE,
        height: NOTE_SIZE,
        top: `${note.y}%`,
        transform: "translate(-50%, -50%)",
        background: `radial-gradient(circle, ${color}FF 0%, ${color}99 50%, ${color}44 100%)`,
        boxShadow: `0 0 12px ${color}, 0 0 24px ${color}88, 0 0 40px ${color}44`,
        border: `2px solid ${color}`,
        zIndex: 10,
      }}
      animate={note.hit ? { scale: [1, 2], opacity: [1, 0] } : {}}
      transition={{ duration: 0.2 }}
    />
  );
}

function HitZone({
  color,
  flash,
  pressed,
}: { color: string; flash: boolean; pressed: boolean }) {
  const pulseClass = !flash && !pressed ? "animate-pulse-ring" : "";
  return (
    <div
      className={`absolute left-1/2 rounded-full ${pulseClass}`}
      style={{
        width: NOTE_SIZE + 16,
        height: NOTE_SIZE + 16,
        top: `${HIT_ZONE_Y}%`,
        transform: "translate(-50%, -50%)",
        border: `3px solid ${color}`,
        boxShadow:
          flash || pressed
            ? `0 0 30px ${color}, 0 0 60px ${color}88, inset 0 0 20px ${color}40`
            : `0 0 10px ${color}60, inset 0 0 5px ${color}20`,
        background: flash ? `${color}30` : "transparent",
        transition: "all 0.1s",
        zIndex: 5,
      }}
    />
  );
}

function GameOverScreen({
  score,
  bestScore,
  onPlayAgain,
}: { score: number; bestScore: number; onPlayAgain: () => void }) {
  const isNewBest = score >= bestScore && score > 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="flex flex-col items-center justify-center gap-8 px-6"
      data-ocid="gameover.panel"
    >
      <div className="text-center">
        <h2
          className="text-6xl font-black uppercase tracking-widest"
          style={{
            color: "var(--neon-magenta)",
            textShadow: "0 0 20px #FF3BCB, 0 0 40px #FF3BCB",
          }}
        >
          GAME OVER
        </h2>
        {isNewBest && (
          <motion.p
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.3, type: "spring" }}
            className="mt-2 text-lg uppercase tracking-widest"
            style={{ color: "var(--neon-cyan)" }}
          >
            🎉 New Best!
          </motion.p>
        )}
      </div>

      <div
        className="w-full max-w-xs rounded-2xl p-6 border"
        style={{
          background: "var(--neon-card)",
          borderColor: "rgba(55,214,255,0.2)",
          boxShadow: "0 0 30px rgba(55,214,255,0.1)",
        }}
      >
        <div
          className="mb-4 pb-4"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}
        >
          <p
            className="text-xs uppercase tracking-widest"
            style={{ color: "var(--neon-muted)" }}
          >
            Final Score
          </p>
          <p
            className="text-5xl font-black"
            style={{
              color: "var(--neon-cyan)",
              textShadow: "0 0 15px #37D6FF",
            }}
          >
            {score.toLocaleString()}
          </p>
        </div>
        <div>
          <p
            className="text-xs uppercase tracking-widest"
            style={{ color: "var(--neon-muted)" }}
          >
            Best Score
          </p>
          <p
            className="text-3xl font-black"
            style={{
              color: "var(--neon-purple)",
              textShadow: "0 0 10px #8A4CFF",
            }}
          >
            {bestScore.toLocaleString()}
          </p>
        </div>
      </div>

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={onPlayAgain}
        type="button"
        className="px-14 py-4 rounded-full text-xl font-black uppercase tracking-widest border-2"
        style={{
          background: "rgba(55,214,255,0.05)",
          borderColor: "var(--neon-cyan)",
          color: "var(--neon-cyan)",
          boxShadow:
            "0 0 20px rgba(55,214,255,0.4), 0 0 60px rgba(55,214,255,0.2)",
        }}
        data-ocid="gameover.primary_button"
      >
        PLAY AGAIN
      </motion.button>
    </motion.div>
  );
}
