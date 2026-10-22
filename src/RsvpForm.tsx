import React, { useId, useState } from "react";

export interface RsvpConfig {
  mode: "email" | "endpoint";
  recipient: string;
  endpoint?: string;
  eventTitles?: string[];
}

export function parseRsvpConfig(value: unknown): RsvpConfig | null {
  if (!value || typeof value !== "object") return null;
  const config = value as Record<string, unknown>;
  if (config.mode !== "email" && config.mode !== "endpoint") return null;
  if (typeof config.recipient !== "string" || !/^[^\s@,;<>?&]+@[^\s@,;<>?&]+\.[^\s@,;<>?&]+$/.test(config.recipient)) return null;
  if (config.mode === "endpoint") {
    if (typeof config.endpoint !== "string") return null;
    try {
      const url = new URL(config.endpoint);
      if (url.protocol !== "https:" || url.username || url.password) return null;
    } catch { return null; }
  }
  if (config.eventTitles !== undefined && (!Array.isArray(config.eventTitles) || !config.eventTitles.every(title => typeof title === "string"))) return null;
  return config as unknown as RsvpConfig;
}

interface RsvpEvent {
  uid?: string;
  title: string;
  date: string;
}

export default function RsvpForm({ event, config }: { event: RsvpEvent; config: RsvpConfig | null }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [response, setResponse] = useState("yes");
  const [guests, setGuests] = useState("1");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "draft" | "error">("idle");
  const [draftUrl, setDraftUrl] = useState("");

  if (!config || (config.eventTitles && config.eventTitles.indexOf(event.title) === -1)) return null;
  const labels: Record<string, string> = { yes: "Going", maybe: "Maybe", no: "Not going" };
  const date = event.date.split("-");
  const displayDate = `${date[1]}/${date[2]}/${date[0]}`;
  const field = "mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 focus:border-green-700 focus:outline-none focus:ring-1 focus:ring-green-700";

  async function submit(submission: React.FormEvent<HTMLFormElement>) {
    submission.preventDefault();
    if (!config || status === "sending" || status === "sent") return;
    const form = submission.currentTarget;
    if (!form.reportValidity()) return;
    const attendees = response === "no" ? 0 : Number(guests);
    if (!name.trim() || !Number.isInteger(attendees) || attendees < 0 || attendees > 20 || (response !== "no" && attendees === 0)) return;
    const subject = `RSVP: ${event.title.replace(/[\r\n]/g, " ")} — ${event.date}`;
    const fields = {
      name: name.trim(), email: email.trim(), response: labels[response],
      guests: attendees, note: note.trim(), event: event.title, date: event.date,
      event_uid: event.uid || "", event_url: window.location.href,
    };
    if (config.mode === "email") {
      const body = [
        `Event: ${fields.event}`, `Date: ${fields.date}`, `Response: ${fields.response}`,
        `Name: ${fields.name}`, `Email: ${fields.email}`, `Party size (including me): ${fields.guests}`,
        "", fields.note, "", `Calendar: ${fields.event_url}`,
      ].join("\r\n");
      const url = `mailto:${config.recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      setDraftUrl(url);
      setStatus("draft");
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    setStatus("sending");
    try {
      const result = await fetch(config.endpoint!, {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ ...fields, _subject: subject, _replyto: fields.email, _gotcha: (form.elements.namedItem("_gotcha") as HTMLInputElement | null)?.value || "" }),
      });
      const receipt = await result.json();
      if (!result.ok || receipt.ok !== true) throw new Error("Submission not acknowledged");
      setStatus("sent");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="mt-5 border-t border-green-100 pt-4">
      <button type="button" className="rounded-lg bg-green-800 px-4 py-2 font-semibold text-white hover:bg-green-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-800" aria-expanded={open} aria-controls={`${id}-form`} onClick={() => setOpen(!open)}>
        RSVP to our gathering
      </button>
      {open && (
        <form id={`${id}-form`} onSubmit={submit} className="mt-3 space-y-3" aria-label={`RSVP for ${event.title}`}>
          <p className="text-sm text-gray-600">{event.title} · {displayDate}<br />Your response goes to the calendar host. For ticketed events, use the organizer’s registration link too.</p>
          {config.mode === "email" && <p className="text-sm text-gray-600">This opens an email to {config.recipient}. Review and send it in your email app to complete your RSVP.</p>}
          {status !== "sent" && <fieldset disabled={status === "sending"} className="space-y-3">
            <label className="block text-sm font-medium" htmlFor={`${id}-name`}>Your name<input id={`${id}-name`} className={field} required maxLength={100} autoComplete="name" value={name} onChange={e => { setName(e.target.value); setStatus("idle"); }} /></label>
            <label className="block text-sm font-medium" htmlFor={`${id}-email`}>Your email<input id={`${id}-email`} type="email" className={field} required maxLength={254} autoComplete="email" value={email} onChange={e => { setEmail(e.target.value); setStatus("idle"); }} /></label>
            <label className="block text-sm font-medium" htmlFor={`${id}-response`}>Your response<select id={`${id}-response`} className={field} value={response} onChange={e => { setResponse(e.target.value); setStatus("idle"); }}><option value="yes">Going</option><option value="maybe">Maybe</option><option value="no">Not going</option></select></label>
            {response !== "no" && <label className="block text-sm font-medium" htmlFor={`${id}-guests`}>Party size, including you<input id={`${id}-guests`} type="number" className={field} min={1} max={20} step={1} required value={guests} onChange={e => { setGuests(e.target.value); setStatus("idle"); }} /></label>}
            <label className="block text-sm font-medium" htmlFor={`${id}-note`}>Note to the host (optional)<textarea id={`${id}-note`} className={field} maxLength={1000} rows={3} value={note} onChange={e => { setNote(e.target.value); setStatus("idle"); }} /></label>
            <div hidden aria-hidden="true"><label>Leave this empty<input name="_gotcha" tabIndex={-1} autoComplete="off" /></label></div>
            <button type="submit" disabled={status === "sending"} className="rounded-lg bg-green-800 px-4 py-2 font-semibold text-white disabled:opacity-50">{status === "sending" ? "Sending…" : config.mode === "email" ? "Open email RSVP" : "Send RSVP"}</button>
          </fieldset>}
          <div aria-live="polite" className="text-sm">
            {status === "sent" && <p role="status" className="text-green-800">Your RSVP was received. Thank you!</p>}
            {status === "draft" && <p role="status">Email draft requested. Send it in your email app to finish. If nothing opened, <a href={draftUrl} target="_blank" rel="noopener noreferrer" className="recipe-link">open the RSVP email</a>.</p>}
            {status === "error" && <p role="alert" className="text-red-800">We couldn’t confirm your RSVP was received. Please try again or email <a className="recipe-link" href={`mailto:${config.recipient}`}>{config.recipient}</a>.</p>}
          </div>
        </form>
      )}
    </div>
  );
}
