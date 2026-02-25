"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

export default function JoinPage() {
  const { code } = useParams();
  const router = useRouter();
  const search = useSearchParams();

  const [name, setName] = useState("");
  const [joining, setJoining] = useState(false);

  // optional: if you open /join/ABC123?host=1, go to host page
  useEffect(() => {
    if (search.get("host") === "1") router.push(`/host/${code}`);
  }, [search, router, code]);

  async function join() {
    if (!name.trim()) return alert("Enter your name");
    setJoining(true);

    // make a simple player id
    const playerId = String(Date.now());

    // store player doc under /sessions/{code}/players/{playerId}
    await setDoc(doc(db, "sessions", code, "players", playerId), {
      name: name.trim(),
      score: 0,
      joinedAt: serverTimestamp(),
    });

    // go to player page
    router.push(`/play/${code}?player=${playerId}`);
  }

  return (
    <div style={{ padding: 24 }}>
      <h2>Join Quiz: {code}</h2>

      <div style={{ marginTop: 12 }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          style={{ padding: 8, width: 260 }}
        />
        <button onClick={join} disabled={joining} style={{ marginLeft: 8, padding: 8 }}>
          {joining ? "Joining..." : "Join"}
        </button>
      </div>

      <hr style={{ margin: "20px 0" }} />

      <p><b>Host link:</b></p>
      <a href={`/host/${code}`}>{`/host/${code}`}</a>
    </div>
  );
}