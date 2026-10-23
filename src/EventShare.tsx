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
  const url = eventShareUrl(event, base);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setStatus("Link copied.");
    } catch {
      setStatus("Select the link below to copy it.");
    }
  }
  return <div className="mt-4 border-t border-gray-200 pt-3">
    <a href={url} className="recipe-link text-sm font-semibold">Link to this event</a>
    <button type="button" onClick={copy} className="ml-4 rounded border border-gray-300 px-3 py-2 text-sm">Copy event link</button>
    {status && <><p role="status" className="mt-2 text-sm">{status}</p>
      <input aria-label="Event sharing link" readOnly value={url} onFocus={e => e.currentTarget.select()} className="mt-2 w-full rounded border border-gray-300 p-2 text-sm" /></>}
  </div>;
}
