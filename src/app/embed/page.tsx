"use client";

import { useEffect } from "react";
import { ChatWidget } from "@/components/ChatWidget";

export default function EmbedPage() {
  useEffect(() => {
    document.documentElement.classList.add("embed-chat-root");
    document.body.classList.add("embed-chat-root");
    return () => {
      document.documentElement.classList.remove("embed-chat-root");
      document.body.classList.remove("embed-chat-root");
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.parent !== window) {
      window.parent.postMessage({ type: "shop-assist-embed-ready" }, "*");
    }
  }, []);

  return <ChatWidget embed />;
}
