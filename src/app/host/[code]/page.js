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
} from "firebase/firestore";

export default function HostPage() {
  const { code } = useParams();

  const [session, setSession] = useState(null);
  const [players, setPlayers] = useState([]);
  const [answers, setAnswers] = useState([]); // answers for current question

  const currentIndex = session?.currentQuestionIndex ?? 0;

  // listen session
  useEffect(() => {
    return onSnapshot(doc(db, "sessions", code), (snap) => {
      setSession(snap.exists() ? snap.data() : null);
    });
  }, [code]);

  // listen players
  useEffect(() => {
    const qPlayers = query(collection(db, "sessions", code, "players"), orderBy("joinedAt", "asc"));
    return onSnapshot(qPlayers, (snap) => {
      setPlayers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, [code]);

  // listen answers for current question (needs index you created)
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

  if (!session) return <div style={{ padding: 24 }}>No session found: {code}</div>;

  return (
    <div style={{ padding: 24 }}>
      <h1>Host Dashboard: {code}</h1>
      <div>Status: {session.status}</div>
      <div>Question: {currentIndex}</div>

      <div style={{ marginTop: 12 }}>
        <button onClick={startQuiz} style={{ padding: 8, marginRight: 8 }}>
          Start Quiz
        </button>
        <button onClick={nextQuestion} style={{ padding: 8, marginRight: 8 }}>
          Next Question
        </button>
        <button onClick={endQuiz} style={{ padding: 8 }}>
          End Quiz
        </button>
      </div>

      <hr style={{ margin: "16px 0" }} />

      <h2>Players Joined ({players.length})</h2>
      <ul>
        {players.map((p) => (
          <li key={p.id}>
            {p.name} — score: {p.score ?? 0}
          </li>
        ))}
      </ul>

      <hr style={{ margin: "16px 0" }} />

      <h2>Live Answers (Question {currentIndex})</h2>
      <div>
        A: {stats.A} | B: {stats.B} | C: {stats.C} | D: {stats.D}
      </div>

      <h3>Submissions</h3>
      <ul>
        {answers.map((a) => (
          <li key={a.id}>
            {a.playerName || a.playerId} → {a.selected} {a.isCorrect ? "✅" : "❌"}
          </li>
        ))}
      </ul>
    </div>
  );
}