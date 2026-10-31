import React, { useState } from "react";

export interface ShareableEvent { uid?: string; title: string; date: string }

export function eventShareUrl(event: ShareableEvent, base: string): string {
  const url = new URL(`${base.replace(/\/$/, "")}/${event.date.slice(0, 7).replace("-", "/")}`, window.location.origin);
  url.searchParams.set("event", event.uid || event.title);
  url.searchParams.set("date", event.date);
  return url.href;
}

export default function EventShare({ event, base }: { event: ShareableEvent; base: string }) {
  const [status, setStatus] = useState("");
  const [showInvitation, setShowInvitation] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [sharing, setSharing] = useState(false);
  const url = eventShareUrl(event, base);
  const parts = event.date.split("-").map(Number);
  const date = new Date(parts[0], parts[1] - 1, parts[2]).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const message = `Join us for ${event.title}!\n${date}\n\nSee the event details and RSVP on MSS:`;
  const invitation = `${message}\n${url}`;

  async function copyInvitation() {
    setShowInvitation(true);
    try {
      await navigator.clipboard.writeText(invitation);
      setStatus("Invitation copied. Paste it into a message or email.");
    } catch {
      setStatus("Select the invitation below to copy it into a message or email.");
    }
  }
  async function share() {
    // Invoke directly from the tap so mobile browsers retain user activation.
    if (!navigator.share) { await copyInvitation(); return; }
    setSharing(true);
    setStatus("");
    try {
      await navigator.share({ title: event.title, text: message, url });
      setStatus("Sharing completed.");
    } catch (error) {
      // Closing the native menu is intentional; do not copy or report an error.
      if ((error as { name?: string })?.name !== "AbortError") await copyInvitation();
    } finally { setSharing(false); }
  }
  async function copyLink() {
    setShowLink(true);
    try {
      await navigator.clipboard.writeText(url);
      setStatus("Link copied.");
    } catch {
      setStatus("Select the link below to copy it.");
    }
  }
  return <div className="mt-4 border-t border-gray-200 pt-3">
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={share} disabled={sharing} className="rounded-lg bg-green-800 px-4 py-2 font-semibold text-white disabled:opacity-50">{sharing ? "Sharing…" : "Share invitation"}</button>
      <button type="button" onClick={copyInvitation} className="rounded border border-gray-300 px-3 py-2 text-sm">Copy invitation</button>
      <button type="button" onClick={copyLink} className="rounded border border-gray-300 px-3 py-2 text-sm">Copy event link</button>
      <a href={url} className="recipe-link text-sm font-semibold">Link to this event</a>
    </div>
    {status && <p role="status" className="mt-2 text-sm">{status}</p>}
    {showInvitation && <textarea aria-label="Invitation to share" readOnly value={invitation} rows={6} onFocus={e => e.currentTarget.select()} className="mt-2 w-full rounded border border-gray-300 p-2 text-sm" />}
    {showLink && <input aria-label="Event sharing link" readOnly value={url} onFocus={e => e.currentTarget.select()} className="mt-2 w-full rounded border border-gray-300 p-2 text-sm" />}
  </div>;
}
