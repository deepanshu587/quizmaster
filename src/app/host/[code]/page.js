"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  serverTimestamp,
  getDocs,
  writeBatch,
} from "firebase/firestore";

const BRAND_GREEN = "#76bc21";
const LIGHT_GREY = "#f3f4f6";

export default function HostPage() {
  const { code } = useParams();

  const [session, setSession] = useState(null);

  // Sorted leaderboard
  const [players, setPlayers] = useState([]);

  // All answers once (we’ll derive current question answers from it)
  const [allAnswers, setAllAnswers] = useState([]);

  // Questions map for correct answer + option text
  const [questionsMap, setQuestionsMap] = useState({}); // { "0": {text, correct, options}, ... }

  const [resetting, setResetting] = useState(false);

  // Leader banner
  const [leaderBanner, setLeaderBanner] = useState(null);
  const bannerTimerRef = useRef(null);
  const prevLeaderIdRef = useRef(null);

  // Score animation
  const prevScoresRef = useRef(new Map()); // id -> score
  const [scorePulseIds, setScorePulseIds] = useState(new Set());
  const pulseTimersRef = useRef(new Map()); // id -> timeoutId

  // Results dropdown selected player
  const [selectedPlayerId, setSelectedPlayerId] = useState("");

  const currentIndex = session?.currentQuestionIndex ?? 0;

  // 1) session listener
  useEffect(() => {
    return onSnapshot(doc(db, "sessions", code), (snap) => {
      setSession(snap.exists() ? snap.data() : null);
    });
  }, [code]);

  // 2) questions listener (needed for correct option + option text)
  useEffect(() => {
    return onSnapshot(collection(db, "sessions", code, "questions"), (snap) => {
      const next = {};
      snap.docs.forEach((d) => (next[d.id] = d.data()));
      setQuestionsMap(next);
    });
  }, [code]);

  // 3) players listener (sorted)
  useEffect(() => {
    const qPlayers = query(
      collection(db, "sessions", code, "players"),
      orderBy("score", "desc"),
      orderBy("joinedAt", "asc")
    );

    return onSnapshot(qPlayers, (snap) => {
      const nextPlayers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setPlayers(nextPlayers);

      // Auto select first player
      if (!selectedPlayerId && nextPlayers.length) setSelectedPlayerId(nextPlayers[0].id);

      // Leader change banner (useRef = stable)
      const newLeaderId = nextPlayers?.[0]?.id ?? null;
      if (newLeaderId && prevLeaderIdRef.current && prevLeaderIdRef.current !== newLeaderId) {
        const leader = nextPlayers[0];
        setLeaderBanner({ name: leader.name ?? "Someone", score: leader.score ?? 0 });

        if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
        bannerTimerRef.current = setTimeout(() => setLeaderBanner(null), 2600);
      }
      prevLeaderIdRef.current = newLeaderId;

      // Score pulse (per-player timer, no flicker)
      for (const p of nextPlayers) {
        const prev = prevScoresRef.current.get(p.id);
        const now = p.score ?? 0;

        if (prev !== undefined && prev !== now) {
          setScorePulseIds((old) => new Set([...old, p.id]));

          // clear existing timer for this player if any
          const oldTimer = pulseTimersRef.current.get(p.id);
          if (oldTimer) clearTimeout(oldTimer);

          const t = setTimeout(() => {
            setScorePulseIds((old) => {
              const copy = new Set(old);
              copy.delete(p.id);
              return copy;
            });
            pulseTimersRef.current.delete(p.id);
          }, 600);

          pulseTimersRef.current.set(p.id, t);
        }

        prevScoresRef.current.set(p.id, now);
      }
    });
  }, [code, selectedPlayerId]);

  // 4) all answers listener (single source of truth)
  useEffect(() => {
    const qAll = query(collection(db, "sessions", code, "answers"), orderBy("createdAt", "asc"));
    return onSnapshot(qAll, (snap) => {
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setAllAnswers(all);
    });
  }, [code]);

  // Current question answers
  const currentAnswers = useMemo(() => {
    return allAnswers.filter((a) => a.questionIndex === currentIndex);
  }, [allAnswers, currentIndex]);

  // Live stats A/B/C/D
  const stats = useMemo(() => {
    const s = { A: 0, B: 0, C: 0, D: 0 };
    for (const a of currentAnswers) if (s[a.selected] != null) s[a.selected]++;
    return s;
  }, [currentAnswers]);

  function medalForRank(i) {
    if (i === 0) return "🥇";
    if (i === 1) return "🥈";
    if (i === 2) return "🥉";
    return "•";
  }

  async function startQuiz() {
    await updateDoc(doc(db, "sessions", code), {
      status: "running",
      currentQuestionIndex: 0,
      questionStartAt: serverTimestamp(),
    });
  }

  async function nextQuestion() {
    await updateDoc(doc(db, "sessions", code), {
      currentQuestionIndex: (currentIndex || 0) + 1,
      questionStartAt: serverTimestamp(),
    });
  }

  async function endQuiz() {
    await updateDoc(doc(db, "sessions", code), { status: "ended" });
  }

  async function resetGame() {
    if (!confirm("Reset game? This will remove ALL players & answers.")) return;
    setResetting(true);

    // delete answers
    const ansSnap = await getDocs(collection(db, "sessions", code, "answers"));
    let batch = writeBatch(db);
    let count = 0;
    for (const d of ansSnap.docs) {
      batch.delete(d.ref);
      count++;
      if (count === 450) {
        await batch.commit();
        batch = writeBatch(db);
        count = 0;
      }
    }
    if (count > 0) await batch.commit();

    // delete players
    const pSnap = await getDocs(collection(db, "sessions", code, "players"));
    batch = writeBatch(db);
    count = 0;
    for (const d of pSnap.docs) {
      batch.delete(d.ref);
      count++;
      if (count === 450) {
        await batch.commit();
        batch = writeBatch(db);
        count = 0;
      }
    }
    if (count > 0) await batch.commit();

    // reset session
    await updateDoc(doc(db, "sessions", code), {
      status: "ended",
      currentQuestionIndex: 0,
      questionStartAt: serverTimestamp(),
    });

    setSelectedPlayerId("");
    setResetting(false);
    alert("✅ Reset complete.");
  }

  // RESULTS dropdown rows for selected player
  const resultsRows = useMemo(() => {
    if (!selectedPlayerId) return [];

    const rows = allAnswers
      .filter((a) => a.playerId === selectedPlayerId)
      .sort((x, y) => (x.questionIndex ?? 0) - (y.questionIndex ?? 0));

    return rows.map((a) => {
      const qi = a.questionIndex ?? 0;
      const q = questionsMap[String(qi)] || null;

      // Best: show correct from question doc
      // Backup: if you later store correct in answer doc (recommended), we’ll use that too
      const correct = q?.correct ?? a.correct ?? null;

      const selectedText = q?.options?.[a.selected] ?? "";
      const correctText = correct ? q?.options?.[correct] ?? "" : "";

      return {
        id: a.id,
        qi,
        qText: q?.text ?? `(Question ${qi + 1} not found in Firestore)`,
        selected: a.selected,
        selectedText,
        isCorrect: !!a.isCorrect,
        correct,
        correctText,
      };
    });
  }, [allAnswers, selectedPlayerId, questionsMap]);

  if (!session) return <div style={{ padding: 24 }}>No session found: {code}</div>;

  return (
    <div style={{ minHeight: "100vh", background: `linear-gradient(180deg, #ffffff, ${LIGHT_GREY})` }}>
      {/* simple top chip */}
      <div style={{ padding: 14, display: "flex", justifyContent: "center" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            border: "1px solid #e5e7eb",
            borderRadius: 999,
            padding: "8px 14px",
            background: "white",
            boxShadow: "0 10px 25px rgba(0,0,0,0.06)",
          }}
        >
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              background: BRAND_GREEN,
              boxShadow: "0 0 0 6px rgba(118,188,33,0.15)",
            }}
          />
          <b>Slate Accounts</b>
        </div>
      </div>

      <div style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
        {/* leader banner */}
        {leaderBanner && (
          <div
            style={{
              background: BRAND_GREEN,
              color: "white",
              padding: "12px 14px",
              borderRadius: 12,
              fontWeight: 900,
              marginBottom: 14,
              boxShadow: "0 12px 30px rgba(118,188,33,0.25)",
              animation: "slideDown 220ms ease-out",
            }}
          >
            🟢 New Leader: {leaderBanner.name} ({leaderBanner.score} pts)
          </div>
        )}

        <h1 style={{ margin: 0, fontSize: 40, color: "#0f172a" }}>Team Day Quiz — Host</h1>
        <div style={{ marginTop: 8, color: "#334155", lineHeight: 1.6 }}>
          <div><b>Code:</b> {code}</div>
          <div><b>Status:</b> {session.status}</div>
          <div><b>Question:</b> {currentIndex + 1}</div>
        </div>

        <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={startQuiz} style={btn()}>Start Quiz</button>
          <button onClick={nextQuestion} style={btn()}>Next Question</button>
          <button onClick={endQuiz} style={btn()}>End Quiz</button>
          <button
            onClick={resetGame}
            disabled={resetting}
            style={{ ...btn(), background: "white", color: "crimson", border: "2px solid crimson" }}
          >
            {resetting ? "Resetting..." : "Reset Game"}
          </button>
        </div>

        <hr style={{ margin: "18px 0", border: 0, borderTop: "1px solid #e5e7eb" }} />

        {/* leaderboard */}
        <h2 style={{ marginTop: 0 }}>🏆 Leaderboard</h2>

        {players.length === 0 ? (
          <div style={{ color: "#64748b" }}>No players yet.</div>
        ) : (
          <div
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 14,
              overflow: "hidden",
              background: "white",
              boxShadow: "0 10px 25px rgba(0,0,0,0.06)",
            }}
          >
            {players.map((p, i) => {
              const pts = p.score ?? 0;
              const pulse = scorePulseIds.has(p.id);

              return (
                <div
                  key={p.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px 14px",
                    borderBottom: i === players.length - 1 ? "none" : "1px solid #f1f5f9",
                    background: i === 0 ? "rgba(118,188,33,0.10)" : "white",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 30, textAlign: "center", fontSize: 18 }}>
                      {medalForRank(i)}
                    </div>
                    <div style={{ fontWeight: 900, color: "#0f172a" }}>
                      {i + 1}. {p.name || "Player"}
                    </div>
                  </div>

                  <div
                    style={{
                      fontWeight: 900,
                      color: BRAND_GREEN,
                      padding: "6px 10px",
                      borderRadius: 999,
                      border: "1px solid rgba(118,188,33,0.25)",
                      background: "rgba(118,188,33,0.10)",
                      transform: pulse ? "scale(1.12)" : "scale(1)",
                      transition: "transform 200ms ease",
                    }}
                  >
                    {pts} pts
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <hr style={{ margin: "18px 0", border: 0, borderTop: "1px solid #e5e7eb" }} />

        {/* live answers */}
        <h2 style={{ marginTop: 0 }}>Live Answers (Question {currentIndex + 1})</h2>
        <div style={{ fontWeight: 800, color: "#0f172a" }}>
          A: {stats.A} | B: {stats.B} | C: {stats.C} | D: {stats.D}
        </div>

        <h3 style={{ marginTop: 14 }}>Submissions</h3>
        {currentAnswers.length === 0 ? (
          <div style={{ color: "#64748b" }}>No submissions yet.</div>
        ) : (
          <ul>
            {currentAnswers.map((a) => (
              <li key={a.id}>
                {a.playerName || a.playerId} → <b>{a.selected}</b> {a.isCorrect ? "✅" : "❌"}
              </li>
            ))}
          </ul>
        )}

        <hr style={{ margin: "18px 0", border: 0, borderTop: "1px solid #e5e7eb" }} />

        {/* results dropdown */}
        <h2 style={{ marginTop: 0 }}>📌 Results (per player)</h2>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ fontWeight: 900, color: "#0f172a" }}>Choose player:</label>
          <select
            value={selectedPlayerId}
            onChange={(e) => setSelectedPlayerId(e.target.value)}
            style={{
              padding: 10,
              borderRadius: 10,
              border: "1px solid #cbd5e1",
              minWidth: 260,
              background: "white",
            }}
          >
            <option value="">-- Select --</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.score ?? 0} pts)
              </option>
            ))}
          </select>
        </div>

        {selectedPlayerId && (
          <div style={{ marginTop: 12 }}>
            {resultsRows.length === 0 ? (
              <div style={{ color: "#64748b" }}>No answers for this player yet.</div>
            ) : (
              <div
                style={{
                  background: "white",
                  border: "1px solid #e5e7eb",
                  borderRadius: 14,
                  overflow: "hidden",
                  boxShadow: "0 10px 25px rgba(0,0,0,0.06)",
                }}
              >
                {resultsRows.map((r, idx) => (
                  <details
                    key={r.id}
                    style={{
                      padding: "10px 14px",
                      borderBottom: idx === resultsRows.length - 1 ? "none" : "1px solid #f1f5f9",
                    }}
                  >
                    <summary style={{ cursor: "pointer", fontWeight: 900 }}>
                      Q{r.qi + 1}: {r.isCorrect ? "✅ Correct" : "❌ Wrong"} — selected <b>{r.selected}</b>
                    </summary>

                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontWeight: 900 }}>{r.qText}</div>
                      <div style={{ marginTop: 8 }}>
                        <div>
                          <b>Your answer:</b> {r.selected}
                          {r.selectedText ? ` — ${r.selectedText}` : ""}
                        </div>

                        {!r.isCorrect && (
                          <div style={{ marginTop: 6, fontWeight: 900, color: BRAND_GREEN }}>
                            <b>Correct answer:</b>{" "}
                            {r.correct ? r.correct : "?"}
                            {r.correctText ? ` — ${r.correctText}` : ""}
                            {!r.correct && (
                              <div style={{ marginTop: 6, color: "#64748b", fontWeight: 700 }}>
                                (Correct answer missing because questions are not loaded.
                                Ensure sessions/{code}/questions/{index} has field "correct".)
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </details>
                ))}
              </div>
            )}
          </div>
        )}

        <style>{`
          @keyframes slideDown {
            from { transform: translateY(-8px); opacity: 0; }
            to   { transform: translateY(0); opacity: 1; }
          }
        `}</style>
      </div>
    </div>
  );
}

function btn() {
  return {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid #0f172a",
    background: "#0f172a",
    color: "white",
    fontWeight: 900,
    cursor: "pointer",
  };
}