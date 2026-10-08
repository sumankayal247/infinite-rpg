"use client";
import dynamic from "next/dynamic";

const GameShell = dynamic(() => import("./GameShell"), {
  ssr: false,
  loading: () => <div style={{ display: "grid", placeItems: "center", height: "100dvh", color: "#ffd166", fontFamily: "monospace" }}>Loading Infinite RPG…</div>,
});

export default function GameClient() {
  return <GameShell />;
}
