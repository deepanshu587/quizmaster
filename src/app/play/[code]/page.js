"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { db } from "@/lib/firebase";
import {
  doc,
  onSnapshot,
  getDoc,
  setDoc,
  serverTimestamp,
  updateDoc,
  increment,
} from "firebase/firestore";

export default function PlayPage() {
  const { code } = useParams();
  const search = useSearchParams();
  const playerId = search.get("player");

  const [session, setSession] = useState(null);
  const [question, setQuestion] = useState(null);

  const [selected, setSelected] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const currentIndex = session?.currentQuestionIndex ?? 0;

  // Listen session in realtime
  useEffect(() => {
    return onSnapshot(doc(db, "sessions", code), (snap) => {
      setSession(snap.exists() ? snap.data() : null);
    });
  }, [code]);

  // Load question whenever index changes
  useEffect(() => {
    async function load() {
      setSelected(null);
      setSubmitted(false);
      setSubmitting(false);

      const qRef = doc(db, "sessions", code, "questions", String(currentIndex));
      const qSnap = await getDoc(qRef);
      setQuestion(qSnap.exists() ? qSnap.data() : null);
    }
    load();
  }, [code, currentIndex]);

  // Options in A,B,C,D order
  const options = useMemo(() => {
    const opts = question?.options || {};
    return ["A", "B", "C", "D"]
      .filter((k) => opts[k])
      .map((k) => ({ key: k, text: opts[k] }));
  }, [question]);

  // Timer
  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    if (!session) return;

    const duration = session.durationSeconds ?? 30;
    const start = session.questionStartAt?.toDate?.();

    if (!start) {
      setTimeLeft(duration);
      return;
    }

    const tick = () => {
      const now = new Date();
      const elapsed = Math.floor((now - start) / 1000);
      const left = Math.max(duration - elapsed, 0);
      setTimeLeft(left);
    };

    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [session]);

  const locked = session?.status !== "running" || timeLeft <= 0;

  async function submit() {
    if (!playerId) return alert("Missing player id in URL");
    if (!selected) return alert("Select an option first");
    if (locked) return;

    if (submitting) return;
    setSubmitting(true);

    try {
      // Read player name (optional)
      const pRef = doc(db, "sessions", code, "players", playerId);
      const pSnap = await getDoc(pRef);
      const playerName = pSnap.exists() ? pSnap.data().name : playerId;

      const isCorrect = question?.correct === selected;
      const answerId = `${currentIndex}_${playerId}`;
      const aRef = doc(db, "sessions", code, "answers", answerId);

      // Save answer
      await setDoc(
        aRef,
        {
          code,
          playerId,
          playerName,
          questionIndex: currentIndex,
          selected,
          isCorrect,
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );

      // ✅ Update score only if correct
      // (score must exist or Firestore will create it)
      if (isCorrect) {
        await updateDoc(pRef, { score: increment(1) });
      }

      setSubmitted(true);
    } catch (err) {
      console.error(err);
      alert("Submit failed. Check console.");
    } finally {
      setSubmitting(false);
    }
  }

  if (session === null) return <div style={{ padding: 24 }}>Loading session...</div>;
  if (!session) return <div style={{ padding: 24 }}>Session not found.</div>;

  return (
    <div style={{ padding: 24 }}>
      <h1>Quiz: {code}</h1>
      <div>Status: {session.status}</div>
      <div>⏱ Time left: {timeLeft}s</div>
      <div>Current Question Index: {currentIndex}</div>

      <hr style={{ margin: "16px 0" }} />

      {!question ? (
        <div>No question found for this index.</div>
      ) : (
        <>
          <h2>{question.text}</h2>

          <div style={{ display: "grid", gap: 10, maxWidth: 650 }}>
            {options.map((o) => {
              const isSel = selected === o.key;

              return (
                <button
                  key={o.key}
                  onClick={() => {
                    if (!locked && !submitted) setSelected(o.key);
                  }}
                  disabled={locked || submitted}
                  style={{
                    textAlign: "left",
                    padding: 14,
                    fontSize: 16,
                    border: isSel ? "3px solid black" : "1px solid #999",
                    background: isSel ? "#eaeaea" : "white",
                    cursor: locked || submitted ? "not-allowed" : "pointer",
                    borderRadius: 6,
                  }}
                >
                  <b>{o.key}:</b> {o.text}
                </button>
              );
            })}
          </div>

          <div style={{ marginTop: 14 }}>
            {!locked && !submitted && selected && (
              <button
                onClick={submit}
                disabled={submitting}
                style={{
                  padding: "10px 16px",
                  fontSize: 16,
                  border: "2px solid black",
                  background: "black",
                  color: "white",
                  cursor: submitting ? "not-allowed" : "pointer",
                  opacity: submitting ? 0.7 : 1,
                }}
              >
                {submitting ? "Submitting..." : "Submit Answer"}
              </button>
            )}

            {submitted && <div style={{ marginTop: 10 }}>✅ Submitted! Waiting for next question…</div>}

            {locked && !submitted && (
              <div style={{ marginTop: 10, color: "crimson" }}>
                ⛔ Answer locked (timer ended or quiz not running).
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}