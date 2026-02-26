"use client";

import { useEffect } from "react";
import confetti from "canvas-confetti";

export default function ConfettiBurst({ run }) {
  useEffect(() => {
    if (!run) return;

    confetti({
      particleCount: 120,
      spread: 70,
      origin: { y: 0.6 },
      colors: ["#76bc21", "#d1d5db", "#ffffff"],
    });
  }, [run]);

  return null;
}