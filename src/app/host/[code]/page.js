"use client";

import { useEffect, useMemo, useState } from "react";
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

export default function HostPage() {
  const { code } = useParams();

  const [session, setSession] = useState(null);
  const [players, setPlayers] = useState([]);
  const [answers, setAnswers] = useState([]);
  const [resetting, setResetting] = useState(false);

  const currentIndex = session?.currentQuestionIndex ?? 0;

  // Listen to session
  useEffect(() => {
    return onSnapshot(doc(db, "sessions", code), (snap) => {
      setSession(snap.exists() ? snap.data() : null);
    });
  }, [code]);

  // ✅ SORTED LEADERBOARD (Highest score first)
  useEffect(() => {
    const qPlayers = query(
      collection(db, "sessions", code, "players"),
      orderBy("score", "desc"),
      orderBy("joinedAt", "asc")
    );

    return onSnapshot(qPlayers, (snap) => {
      setPlayers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, [code]);

  // Listen answers for current question
  useEffect(() => {
    const qAns = query(
      collection(db, "sessions", code, "answers"),
      orderBy("createdAt", "asc")
    );

    return onSnapshot(qAns, (snap) => {
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setAnswers(all.filter((a) => a.questionIndex === currentIndex));
    });
  }, [code, currentIndex]);

  const stats = useMemo(() => {
    const s = { A: 0, B: 0, C: 0, D: 0 };
    for (const a of answers) if (s[a.selected] != null) s[a.selected]++;
    return s;
  }, [answers]);

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
    await updateDoc(doc(db, "sessions", code), {
      status: "ended",
    });
  }

  async function resetGame() {
    if (!confirm("Reset game? This will remove ALL players & answers.")) return;

    setResetting(true);

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

    const playersSnap = await getDocs(collection(db, "sessions", code, "players"));
    batch = writeBatch(db);
    count = 0;

    for (const d of playersSnap.docs) {
      batch.delete(d.ref);
      count++;
      if (count === 450) {
        await batch.commit();
        batch = writeBatch(db);
        count = 0;
      }
    }
    if (count > 0) await batch.commit();

    await updateDoc(doc(db, "sessions", code), {
      status: "ended",
      currentQuestionIndex: 0,
      questionStartAt: serverTimestamp(),
    });

    setResetting(false);
    alert("✅ Reset complete.");
  }

  if (!session) return <div style={{ padding: 24 }}>No session found: {code}</div>;

  return (
    <div style={{ padding: 24 }}>
      <h1>Team Day Quiz — Host</h1>
      <div>Code: {code}</div>
      <div>Status: {session.status}</div>
      <div>Question: {currentIndex + 1}</div>

      <div style={{ marginTop: 12 }}>
        <button onClick={startQuiz} style={{ padding: 8, marginRight: 8 }}>
          Start Quiz
        </button>
        <button onClick={nextQuestion} style={{ padding: 8, marginRight: 8 }}>
          Next Question
        </button>
        <button onClick={endQuiz} style={{ padding: 8, marginRight: 8 }}>
          End Quiz
        </button>
        <button
          onClick={resetGame}
          disabled={resetting}
          style={{
            padding: 8,
            border: "2px solid crimson",
            color: "crimson",
          }}
        >
          {resetting ? "Resetting..." : "Reset Game"}
        </button>
      </div>

      <hr style={{ margin: "16px 0" }} />

      <h2>🏆 Leaderboard</h2>
      <ul>
        {players.map((p, index) => (
          <li key={p.id}>
            {index + 1}. {p.name} — {p.score ?? 0} pts
          </li>
        ))}
      </ul>

      <hr style={{ margin: "16px 0" }} />

      <h2>Live Answers (Question {currentIndex + 1})</h2>
      <div>
        A: {stats.A} | B: {stats.B} | C: {stats.C} | D: {stats.D}
      </div>

      <h3>Submissions</h3>
      <ul>
        {answers.map((a) => (
          <li key={a.id}>
            {a.playerName || a.playerId} → {a.selected}{" "}
            {a.isCorrect ? "✅" : "❌"}
          </li>
        ))}
      </ul>
    </div>
  );
}